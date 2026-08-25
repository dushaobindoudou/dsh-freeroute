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
      const url = (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL
      if (!url) { catalogMeta.lastError = '未配置远程目录 URL'; return { ok: false, error: catalogMeta.lastError } }
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
            for (let i = 0; i < e.apikeys.length; i++) await credentials.set(refs[i], e.apikeys[i])
            for (let i = e.apikeys.length; i < refs.length; i++) { try { await credentials.unset(refs[i]) } catch (e2) { } }
            imported += 1
          } catch (e2) { }
        }
        catalogMeta.lastSyncAt = Date.now()
        catalogMeta.lastCount = parsed.entries.length
        catalogMeta.lastFormat = parsed.format
        catalogMeta.lastError = ''
        console.log('[freeroute] 远程目录已同步: ' + parsed.entries.length + ' 个上游（' + parsed.format + ' 格式' + (imported > 0 ? ('，导入 ' + imported + ' 家 Key 环') : '') + '）')
        return { ok: true, count: parsed.entries.length, format: parsed.format, imported: imported }
      } catch (e) {
        catalogMeta.lastError = emsg(e)
        return { ok: false, error: emsg(e) }
      }
    }

