    // attempt：上游+模型级入口。内部按 Key 环轮换（鉴权/限流换下一把 Key，
    // 全部失败才上报上游级失败）；attemptWithKey 才是真正的单次 HTTP 尝试。
    async function* attempt(upstream, model, options, hooks) {
      const ring = await keyRing(upstream)
      if (ring.length === 0) {
        const e0 = mkFail('上游 ' + upstream.id + ' 缺少 API Key：请在 设置 → freeroute 中保存密钥，或导出环境变量 ' + upstream.keyRef, 'MISSING_CREDENTIAL')
        recordFailure(upstream.id, e0, hooks && hooks.suppressCooldown === true)
        throw e0
      }
      const ordered = orderKeys(upstream, ring)
      let lastErr = null
      for (let i = 0; i < ordered.length; i++) {
        let produced = false
        try {
          for await (const ck of attemptWithKey(upstream, model, ordered[i], options, hooks)) {
            produced = true
            yield ck
          }
          // 成功：游标推进到下一把，多账号均匀分摊免费配额
          for (let j = 0; j < ring.length; j++) {
            if (ring[j].ref === ordered[i].ref) { keyCursor.set(upstream.id, (j + 1) % ring.length); break }
          }
          return
        } catch (e) {
          lastErr = e
          const code = String((e && e.code) || '')
          if (!produced && (code === 'AUTH' || code === 'RATE_LIMIT') && i < ordered.length - 1) {
            coolKey(ordered[i].ref, e)
            const kidx = keyNumber(ordered[i].ref)
            noteKeyFail(upstream.id, kidx, code)
            console.log('[freeroute] 上游 ' + upstream.id + ' 的第 ' + kidx + ' 把 Key 失败(' + code + ')，轮换下一把')
            continue
          }
          recordFailure(upstream.id, e, hooks && hooks.suppressCooldown === true)
          throw e
        }
      }
      throw lastErr
    }

    async function* attemptWithKey(upstream, model, keyEntry, options, hooks) {
      const startedAt = Date.now()
      const st = statsFor(upstream.id)
      st.requests += 1
      let completed = false
      let proc = null
      try {
        const key = keyEntry.key
        const curl = await ensureCurl()
        const url = String(upstream.baseUrl).replace(/\/+$/, '') + '/chat/completions'
        const body = JSON.stringify(serializeRequest(options, model))
        const argv = [curl, '-sS', '-N', '--connect-timeout', '15']
        if (upstream.proxy) argv.push('--proxy', String(upstream.proxy))
        argv.push('-X', 'POST', url,
          '-H', 'content-type: application/json',
          '-H', 'accept: text/event-stream')
        // noAuth / 免鉴权网关：key 为空时不发送 Authorization 头（空 Bearer
        // 会被部分网关按畸形鉴权处理）。
        if (key) argv.push('-H', 'authorization: Bearer ' + key)
        argv.push(
          '-H', 'user-agent: ' + UA,
          '-H', 'http-referer: https://github.com/0xrushmoon/dsh-freeroute',
          '-H', 'x-title: dsh-freeroute',
          '--data-binary', '@-', '-w', TRAILER)
        try {
          proc = subprocess.spawn({ argv: argv, cwd: '/tmp', stdio: { stdin: { data: body }, stdout: 'pipe', stderr: { maxBytes: 4096 } }, graceMs: 5000, signal: options.signal })
        } catch (e) { throw mkFail('curl 启动失败: ' + emsg(e), 'TRANSPORT') }
        if (hooks && typeof hooks.onProc === 'function') { try { hooks.onProc(proc) } catch (e) { } }
        if (!proc || !proc.stdout) throw mkFail('curl 输出管道不可用', 'TRANSPORT')
        const tr = createTranslator()
        try {
          for await (const bytes of proc.stdout) {
            for (const ck of tr.feed(bytes)) yield ck
          }
          for (const ck of tr.flush()) yield ck
          tr.finishOrThrow()
        } catch (e) {
          if (options.signal && options.signal.aborted) throw mkFail('请求已被调用方取消', 'ABORTED')
          throw e
        }
        completed = true
        goodModel.set(upstream.id, model)
        recordSuccess(upstream.id, tr.usage, Date.now() - startedAt)
      } catch (e) {
        const err = (e instanceof Error) ? e : mkFail(emsg(e), 'UNKNOWN')
        if (!err.code) err.code = 'UNKNOWN'
        // Key 级失败信息交给外层 attempt 决定是换 Key 还是上报上游
        err.keyRef = keyEntry.ref
        throw err
      } finally {
        if (!completed && proc) { try { proc.terminate() } catch (e) { } }
      }
    }

    const DELTA_TYPES = ['text-delta', 'reasoning-delta', 'tool-call-delta']

    function candidatesSync(pool, model) {
      if (model === 'auto') {
        // 同模型跨厂商优先：A/B 都提供 DeepSeek-3.5-flash 时，先在提供同款
        // 模型的厂商之间轮换，全部不可用才轮到其他模型。
        const out = []
        const seen = {}
        const push = function (u, mid) {
          const k = u.id + '|' + mid
          if (seen[k]) return
          if (!mergedModels(u).some(function (m) { return m.id === mid })) return
          seen[k] = true
          out.push({ upstream: u, model: mid })
        }
        if (pool.length > 0) {
          const primary = defaultModelFor(pool[0])
          if (primary) {
            const gen = canonicalModelId(primary)
            for (const u of pool) {
              const mm = mergedModels(u).find(function (x) { return canonicalModelId(x.id) === gen })
              if (mm) push(u, mm.id)
            }
          }
        }
        for (const u of pool) {
          for (const mid of modelCandidatesFor(u)) push(u, mid)
        }
        return out
      }
      const slash = model.indexOf('/')
      if (slash > 0) {
        const pid = model.slice(0, slash)
        const suffix = model.slice(slash + 1)
        const primary = pool.filter(function (u) { return u.id === pid })
        const others = pool.filter(function (u) { return u.id !== pid && mergedModels(u).some(function (m) { return m.id === suffix }) })
        return primary.concat(others).map(function (u) { return { upstream: u, model: suffix } })
      }
      const exact = pool.filter(function (u) { return mergedModels(u).some(function (m) { return m.id === model }) }).map(function (u) { return { upstream: u, model: model } })
      if (exact.length > 0) return exact
      // 通用别名：deepseek-3.5-flash -> 各提供该模型的上游真实 id（保持优先级序）
      const entry = buildAliasIndex().get(canonicalModelId(model))
      if (entry) {
        const out = []
        for (const u of pool) {
          for (const v of entry.via) {
            if (v.upstream === u.id) { out.push({ upstream: u, model: v.model }); break }
          }
        }
        return out
      }
      return []
    }

    async function candidatesFor(model) {
      const enabled = orderedUpstreams().filter(function (u) { return isEnabled(u.id) })
      const keyed = []
      for (const u of enabled) { if (await hasCredential(u)) keyed.push(u) }
      if (keyed.length === 0) return []
      const healthy = keyed.filter(function (u) { return !cooling(u.id) })
      const pool = healthy.length > 0 ? healthy : keyed.slice().sort(function (a, b) { return ((health.get(a.id) || {}).cooldownUntil || 0) - ((health.get(b.id) || {}).cooldownUntil || 0) })
      return candidatesSync(pool, model)
    }

    async function* failoverStream(options) {
      const cands = await candidatesFor(options.model)
      if (cands.length === 0) {
        throw mkFail('没有可用的免费上游：请先在 设置 → freeroute 中启用并配置至少一个 API Key', 'NO_UPSTREAM')
      }
      let lastErr = null
      for (let i = 0; i < cands.length; i++) {
        const cand = cands[i]
        const sameUpNext = !!(cands[i + 1] && cands[i + 1].upstream.id === cand.upstream.id)
        let produced = false
        let emptyFinish = null
        try {
          for await (const ck of attempt(cand.upstream, cand.model, options, { suppressCooldown: sameUpNext })) {
            if (DELTA_TYPES.indexOf(ck.type) >= 0) produced = true
            if (ck.type === 'finish' && (!ck.reason || ck.reason.kind === 'error') && !produced) {
              // 上游异常终止（如空响应）且尚未产出任何内容：视为该次尝试失败，
              // 不把错误 finish 下发，改为切换下一家候选。
              const failure = (ck.reason && ck.reason.failure) || {}
              emptyFinish = mkFail(failure.message || '上游异常终止', failure.code || 'EMPTY_RESPONSE')
              break
            }
            yield ck
          }
          if (emptyFinish) {
            recordFailure(cand.upstream.id, emptyFinish, sameUpNext)
            lastErr = emptyFinish
            const nxt0 = cands[i + 1]
            if (nxt0) console.log('[freeroute] 上游 ' + cand.upstream.id + ' 模型 ' + cand.model + ' 空响应(' + String(emptyFinish.code) + ')，切换到 ' + (sameUpNext ? '同上游备选 ' + nxt0.model : nxt0.upstream.id))
            continue
          }
          return
        } catch (e) {
          lastErr = e
          if (options.signal && options.signal.aborted) throw e
          if (produced) throw e
          const nxt = cands[i + 1]
          if (nxt) console.log('[freeroute] 上游 ' + cand.upstream.id + ' 模型 ' + cand.model + ' 失败(' + String(e && e.code) + ')，切换到 ' + (sameUpNext ? '同上游备选 ' + nxt.model : nxt.upstream.id))
          if (String((e && e.code) || '') === 'SERVER') scheduleReprobe(cand.upstream.id)
        }
      }
      throw lastErr || mkFail('全部候选上游均失败', 'NO_UPSTREAM')
    }

    const adapter = {
      providerInfo: function (provider) { return { id: provider, name: 'FreeRoute 免费模型' } },
      providerRetryPolicy: function () { return undefined },
      listModels: async function () {
        // 只展示「免费且可用」：auto -> 免费模型（通用名，跨上游合并去重）。
        // 未配 Key 上游的模型不展示（选了也用不了）；付费模型不进选择器，
        // 但显式指定（freeroute/<id> 或通用名）仍可派发，见 candidatesSync。
        const readySet = await readyUpstreamIdSet()
        const out = [{ provider: ROUTE, id: 'auto', name: '⚡ Auto（自动切换）', description: '按优先级在已启用的免费上游间自动选择与切换', inputModalities: ['text'] }]
        const freeList = []
        for (const entry of buildAliasIndex().values()) {
          if (entry.free !== true) continue
          const viaReady = entry.via.filter(function (v) { return readySet.has(v.upstream) })
          if (viaReady.length === 0) continue
          freeList.push({ provider: ROUTE, id: entry.id, name: entry.name || entry.id, description: '免费模型 · ' + viaReady.length + ' 家上游 · 失效自动切换', inputModalities: ['text'] })
        }
        const byId = function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 }
        freeList.sort(byId)
        return out.concat(freeList)
      },
      resolveModel: async function (provider, model) {
        let found = null
        const slash = model.indexOf('/')
        if (slash > 0) {
          const pid = model.slice(0, slash)
          const suffix = model.slice(slash + 1)
          for (const u of orderedUpstreams()) {
            if (u.id !== pid) continue
            for (const m of mergedModels(u)) { if (m.id === suffix) { found = m; break } }
          }
        }
        if (!found) {
          const entry = buildAliasIndex().get(canonicalModelId(model))
          if (entry) found = { name: entry.name, contextWindow: entry.contextWindow, free: entry.free }
        }
        if (!found) {
          for (const u of orderedUpstreams()) {
            for (const m of mergedModels(u)) { if (m.id === model) { found = m; break } }
            if (found) break
          }
        }
        if (found) {
          return { provider: ROUTE, id: model, name: found.name || model, inputModalities: ['text'], context: { contextWindow: found.contextWindow || 32768 } }
        }
        return { provider: ROUTE, id: model, name: model === 'auto' ? '⚡ Auto（自动切换）' : model, inputModalities: ['text'], context: { contextWindow: 32768 } }
      },
      // dsh 的 LlmAdapter 契约要求 prepareCall（基类有默认实现，但普通对象
      // 字面量适配器必须自带）：把模型元数据与本次分发的流入口绑定到同一代。
      prepareCall: async function (provider, model, signal) {
        return {
          model: await adapter.resolveModel(provider, model, signal),
          stream: function (options) { return failoverStream(options) }
        }
      },
      stream: function (options) { return failoverStream(options) }
    }

    function collectFrom(gen) {
      let text = ''
      let usage = null
      let finish = null
      async function run() {
        for await (const ck of gen) {
          if (ck.type === 'text-delta') text += ck.text
          if (ck.type === 'usage') usage = ck.usage
          if (ck.type === 'finish') finish = ck.reason
        }
        return { text: text, usage: usage, finish: finish }
      }
      return run()
    }

    async function testUpstream(id) {
      let up = null
      for (const u of orderedUpstreams()) { if (u.id === id) { up = u; break } }
      if (!up) return { ok: false, error: '未知上游: ' + id }
      // 逐个试模型级候选（默认 + 备选免费款）：单个模型不可用时换模型而不是
      // 直接判死刑；成功后 goodModel 会记住真正可用的那个（自动成为新默认）。
      const tryModels = modelCandidatesFor(up)
      if (tryModels.length === 0) return { ok: false, error: '该上游没有可用模型' }
      const startedAt = Date.now()
      let procRef = null
      let timedOut = false
      const disposer = timer.timeout(function () {
        timedOut = true
        if (procRef) { try { procRef.terminate() } catch (e) { } }
      }, 25000)
      let lastErr = null
      try {
        for (let i = 0; i < tryModels.length; i++) {
          const model = tryModels[i]
          const isLast = i === tryModels.length - 1
          try {
            const gen = attempt(up, model, { provider: ROUTE, model: id + '/' + model, messages: [{ id: 'fr-test', role: 'user', content: [{ type: 'text', text: '请只回复: pong' }], source: { kind: 'user' } }], maxTokens: 16 }, { onProc: function (p) { procRef = p }, suppressCooldown: !isLast })
            const r = await collectFrom(gen)
            return { ok: true, model: model, latencyMs: Date.now() - startedAt, preview: r.text.trim().slice(0, 80), tried: tryModels.slice(0, i + 1) }
          } catch (e) { lastErr = e }
        }
        return { ok: false, model: tryModels[0], latencyMs: Date.now() - startedAt, error: timedOut ? '测试超时（25s）' : (emsg(lastErr) + ' [' + String(lastErr && lastErr.code) + ']'), tried: tryModels }
      } finally { try { disposer() } catch (e) { } }
    }

