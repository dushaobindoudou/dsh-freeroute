    async function rawGet(url, timeoutMs, headers, proxy) {
      const curl = await ensureCurl()
      return new Promise(function (resolve, reject) {
        let settled = false
        let proc = null
        const dispose = timer.timeout(function () {
          if (settled) return
          settled = true
          try { if (proc) proc.terminate() } catch (e) { }
          reject(mkFail('下载超时（' + timeoutMs + 'ms）', 'TIMEOUT'))
        }, timeoutMs)
        function finish(fn, value) {
          if (settled) return
          settled = true
          try { dispose() } catch (e) { }
          fn(value)
        }
        try {
          const argv = [curl, '-sS', '-L', '--connect-timeout', '12']
          // 代理参数必须在 URL 之前（argv 解析按顺序取最后一个 http 开头项）
          if (proxy) argv.push('--proxy', String(proxy))
          for (const pair of Object.entries(headers || {})) argv.push('-H', pair[0] + ': ' + pair[1])
          argv.push(url, '-w', TRAILER)
          proc = subprocess.spawn({ argv: argv, cwd: '/tmp', stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 2048 } }, graceMs: 3000 })
        } catch (e) {
          finish(reject, mkFail('curl 启动失败: ' + emsg(e), 'TRANSPORT'))
          return
        }
        const dec = new TextDecoder()
        let out = ''
        ;(async function () {
          try {
            for await (const b of proc.stdout) {
              out += dec.decode(b, { stream: true })
              if (out.length > 8388608) throw mkFail('目录超过 8MB 上限', 'INVALID_CATALOG')
            }
            out += dec.decode()
            let errTail = ''
            try {
              const r = proc.collected.stderr && proc.collected.stderr.readFrom(0)
              if (r) errTail = String(r.text || '').trim().slice(0, 200)
            } catch (e) { }
            let exit = null
            try { exit = await proc.done } catch (e) { exit = null }
            const m = /__FREEROUTE_HTTP_(\d{3})__/.exec(out)
            const status = m ? Number(m[1]) : 0
            const body = out.replace(/__FREEROUTE_HTTP_\d{3}__/, '').trim()
            finish(resolve, { status: status, body: body, errTail: errTail, exitCode: exit && exit.exitCode })
          } catch (e) {
            finish(reject, (e instanceof Error) ? e : mkFail(emsg(e), 'TRANSPORT'))
          }
        })()
      })
    }

    async function syncCatalog() {
      // 主源：用户显式配置的 remoteUrl，否则内置默认（config.freetokenbox.com）。
      // 仅在「使用内置默认主源」时挂备份源 freeroute-catalog.pages.dev：
      // 用户若显式配置其它源，则尊重其选择，失败时直接报错而不静默切换。
      const configured = userConfig.catalog && userConfig.catalog.remoteUrl
      const primary = configured || DEFAULT_CATALOG_URL
      const candidates = configured ? [primary] : [primary, BACKUP_CATALOG_URL]
      let lastErr = ''
      for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i]
        try {
          const r = await rawGet(url, 30000)
          if (r.status !== 0 && (r.status < 200 || r.status >= 300)) throw mkFail('目录下载失败 HTTP ' + r.status + (r.errTail ? ' · ' + r.errTail : ''), 'HTTP_' + r.status)
          const parsed = parseCatalog(r.body)
          remoteUpstreams.clear()
          for (const e of parsed.entries) remoteUpstreams.set(e.id, e)
          // 目录自带 apikey 列表 -> 整环写入凭据（KEY / KEY_2 …，多余旧编号清掉）
          let imported = 0
          for (const e of parsed.entries) {
            if (!Array.isArray(e.apikeys) || e.apikeys.length === 0) continue
            try {
              const refs = keyRefsFor(e)
              for (let k = 0; k < e.apikeys.length; k++) await credentials.set(refs[k], e.apikeys[k])
              for (let k = e.apikeys.length; k < refs.length; k++) { try { await credentials.unset(refs[k]) } catch (e2) { } }
              imported += 1
            } catch (e2) { }
          }
          catalogMeta.lastSyncAt = Date.now()
          catalogMeta.lastCount = parsed.entries.length
          catalogMeta.lastFormat = parsed.format
          catalogMeta.lastError = ''
          catalogMeta.lastSyncUrl = url
          catalogMeta.lastUsedFallback = (i > 0)
          const tail = (i > 0 ? '，已回退备份源' : '') + (imported > 0 ? ('，导入 ' + imported + ' 家 Key 环') : '')
          console.log('[freeroute] 远程目录已同步: ' + parsed.entries.length + ' 个上游（' + parsed.format + ' 格式' + tail + '）来自 ' + url)
          return { ok: true, count: parsed.entries.length, format: parsed.format, imported: imported, url: url, usedFallback: i > 0 }
        } catch (e) {
          lastErr = emsg(e)
          // 还有备份源可试：记录并继续；否则在此源失败处收尾
          if (i < candidates.length - 1) {
            console.log('[freeroute] 主源 ' + url + ' 同步失败（' + lastErr + '），尝试备份源…')
            continue
          }
          catalogMeta.lastError = lastErr
          catalogMeta.lastSyncUrl = url
          catalogMeta.lastUsedFallback = false
          return { ok: false, error: lastErr }
        }
      }
      catalogMeta.lastError = lastErr || '未配置远程目录 URL'
      return { ok: false, error: catalogMeta.lastError }
    }

