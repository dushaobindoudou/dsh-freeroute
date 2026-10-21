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
            log('[freeroute] 上游 ' + upstream.id + ' 的第 ' + kidx + ' 把 Key 失败(' + code + ')，轮换下一把')
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
        // 非标网关（如 GMI autoroute）可用 chatPath 覆盖默认的 /chat/completions
        const url = String(upstream.baseUrl).replace(/\/+$/, '') + (upstream.chatPath || '/chat/completions')
        // requestExtra：附加/覆盖请求体字段（仅标量），model:null 表示不发 model
        const req = serializeRequest(options, model)
        if (upstream.requestExtra) {
          for (const k of Object.keys(upstream.requestExtra)) {
            const v = upstream.requestExtra[k]
            if (k === 'model' && v === null) delete req.model
            else req[k] = v
          }
        }
        const body = JSON.stringify(req)
        const argv = [curl, '-sS', '-N', '--connect-timeout', '15',
          // 防上游「接了连接但不吐数据」的假死（根因 C）：此前只有 connect-timeout，
          // 流中途卡住会无限挂起（实测单次请求挂 ~16 分钟才被上层重试触发）。
          // --speed-time 内收不到任何字节即判停滞中止（读空闲超时）；
          // --max-time 为整次请求绝对上限，双保险兜底。
          '--speed-limit', '1', '--speed-time', String(STALL_IDLE_SECONDS),
          '--max-time', String(REQUEST_MAX_SECONDS)]
        if (upstream.proxy) argv.push('--proxy', String(upstream.proxy))
        argv.push('-X', 'POST', url,
          '-H', 'content-type: application/json',
          '-H', 'accept: text/event-stream')
        // noAuth / 免鉴权网关：key 为空时不发送 Authorization 头（空 Bearer
        // 会被部分网关按畸形鉴权处理）。
        if (key) argv.push('-H', 'authorization: Bearer ' + key)
        argv.push(
          '-H', 'user-agent: ' + UA,
          '-H', 'http-referer: https://github.com/dushaobindoudou/dsh-freeroute',
          '-H', 'x-title: dsh-freeroute',
          '--data-binary', '@-', '-w', TRAILER)
        try {
          proc = subprocess.spawn({ argv: argv, cwd: '/tmp', stdio: { stdin: { data: body }, stdout: 'pipe', stderr: { maxBytes: 4096 } }, graceMs: 5000, signal: options.signal })
        } catch (e) { throw mkFail('curl 启动失败: ' + emsg(e), 'TRANSPORT') }
        if (hooks && typeof hooks.onProc === 'function') { try { hooks.onProc(proc) } catch (e) { } }
        if (!proc || !proc.stdout) throw mkFail('curl 输出管道不可用', 'TRANSPORT')
        const tr = createTranslator()
        // 配额通知嗅探：部分网关（如 aihubmix）配额用尽时返回 HTTP 200 + 一段
        // 纯文本提示而非错误码。传输层看到 200 视为成功，提示会被当成「正常
        // 回答」流给调用方，轮换/冷却/切换全部不触发。嗅探正文前 SNIFF_WINDOW
        // 个字符：命中已知配额模板 → 抛 RATE_LIMIT（attempt 换 Key / 记冷却，
        // chaseChain 切下一上游）；窗口越过后原样放行，不影响真实回答。
        const held = []
        let acc = ''
        let sniffing = true
        try {
          for await (const bytes of proc.stdout) {
            for (const ck of tr.feed(bytes)) {
              if (sniffing && ck.type === 'text-delta') {
                acc += ck.text
                // 只匹配窗口内子串：单块超窗时避免窗口外的词误伤
                if (quotaTextHit(acc.slice(0, SNIFF_WINDOW))) {
                  throw mkFail('上游 ' + upstream.id + ' 免费配额已用尽（200+通知文本检测）', 'RATE_LIMIT')
                }
                held.push(ck)
                if (acc.length >= SNIFF_WINDOW) {
                  sniffing = false
                  for (const h of held) yield h
                  held.length = 0
                }
                continue
              }
              if (sniffing && held.length > 0) {
                // 非 text 块（usage/finish/tool-call）到达即结束嗅探期，先放行缓冲
                sniffing = false
                for (const h of held) yield h
                held.length = 0
              }
              yield ck
            }
          }
          if (held.length > 0) { for (const h of held) yield h }
          for (const ck of tr.flush()) yield ck
          tr.finishOrThrow()
        } catch (e) {
          if (options.signal && options.signal.aborted) throw mkFail('请求已被调用方取消', 'ABORTED')
          // 流在 [DONE] 前中断时，把 curl 的退出原因（超时 / 速度过低中止 /
          // 连接被重置等）附到错误上；否则只剩笼统的「上游流在结束前中断」，
          // 无法判断是超时还是异常关闭（根因 C 诊断）。
          if ((e && e.code) === 'STREAM_CLOSED' && proc) {
            let tail = ''
            try {
              const rd = proc.collected && proc.collected.stderr
              if (rd) { const r = rd.readFrom(0); if (r && r.text) tail = String(r.text).trim().replace(/\s+/g, ' ').slice(0, 160) }
            } catch (e2) { }
            if (tail) e.message = String(e.message || '').replace(/：$/, '') + '（' + tail + '）'
          }
          throw e
        }
        completed = true
        goodModel.set(upstream.id, model)
        // 记录本次实际服务的上下文窗口：作为后续分层基准的粘性下限（根因 D）。
        const servedWin = contextWindowOf({ upstream: upstream, model: model })
        if (servedWin) lastServedWindow = servedWin
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

    // 已知「200 + 配额通知文本」模板（按厂商实测补充；机制与厂商无关）。
    // 只在正文前 SNIFF_WINDOW 字符内匹配，避免误伤正常长回答。
    const SNIFF_WINDOW = 240
    const QUOTA_TEXT_RES = [
      /to prevent abuse of free resources/i,
      /accounts? that have not been recharged/i
    ]
    function quotaTextHit(acc) {
      for (const re of QUOTA_TEXT_RES) { if (re.test(acc)) return true }
      return false
    }

    // 上游流防挂起参数（根因 C）：读空闲 90s 无任何字节即判停滞；整次请求
    // 绝对上限 600s。取值权衡：连续流式输出的正常长回答（如带长推理链的模型）
    // 不会被小上限误杀，但「连接后完全不吐数据」的静默卡死会在 90s / 600s 内
    // 被中止（此前只有 connect-timeout，实测挂过 ~16 分钟）。阈值可按需调整。
    const STALL_IDLE_SECONDS = 90
    const REQUEST_MAX_SECONDS = 600

    function candidatesSync(pool, model) {
      // auto 走 autoChain（质量/交集/容量三层排序），不在这里处理——本函数只
      // 负责「点名某个模型」的派发顺序：同 id 优先，其次提供该模型的其他上游。
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

    // 候选的实际上下文窗口（未知返回 0）。
    function contextWindowOf(cand) {
      try {
        for (const m of mergedModels(cand.upstream)) {
          if (m.id === cand.model && m.contextWindow) return m.contextWindow
        }
      } catch (e) { }
      return 0
    }

    // ---- auto 候选链：质量 / 交集 / 容量 三层排序 ----
    // 判断依据按优先级从高到低：
    //   ① quality —— 目录声明的质量档（1..5）。插件只能观测成功/失败/延迟，
    //      观测不到「答得好不好」，所以模型强弱必须由目录显式声明；
    //   ② coverage —— 同一款模型被多少家上游同时提供（交集家数）。交集越大，
    //      「同款模型跨厂商」这条零损耗的故障转移链越深：免费池天天限流，
    //      一个 5 家都在的模型比一个只有 1 家的小众预览款可靠得多；
    //   ③ window —— 上下文容量。只用来兜住「别把当前会话塞进放不下的模型」，
    //      不再拿它当「最好」的判据（窗口大 ≠ 能力强，1M 窗口的 lite 款
    //      在工具调用密集的场景里比 128K 的正式版差得多）。
    // 三者都分不出高下时保持原首选（池首上游的默认模型）——只有严格更优才
    // 替换，所以未声明 quality 的既有配置行为不变。

    // 本次请求的上下文占用粗估（token）。只用于分层排序，不做硬校验：
    // CJK 约 1.6 字符/token，其余约 3.5 字符/token，末尾加响应预留与 10% 余量。
    function estimateContextTokens(options) {
      if (!options) return 0
      let cjk = 0
      let other = 0
      const addStr = function (s) {
        for (let i = 0; i < s.length; i++) {
          if (s.charCodeAt(i) > 0x2e80) cjk++
          else other++
        }
      }
      const addBlocks = function (blocks) {
        if (typeof blocks === 'string') { addStr(blocks); return }
        if (!Array.isArray(blocks)) return
        for (const b of blocks) {
          if (!b || typeof b !== 'object') continue
          if (typeof b.text === 'string') addStr(b.text)
          if (typeof b.arguments === 'string') addStr(b.arguments)
          if (typeof b.content === 'string') addStr(b.content)
          else if (Array.isArray(b.content)) addBlocks(b.content)
          if (b.type === 'image' || b.type === 'image_url') other += 1024
        }
      }
      if (typeof options.system === 'string') addStr(options.system)
      for (const m of (options.messages || [])) addBlocks(m && m.content)
      if (Array.isArray(options.tools) && options.tools.length > 0) addStr(JSON.stringify(options.tools))
      const tokens = cjk / 1.6 + other / 3.5
      if (!(tokens > 0)) return 0
      const reserve = Number(options.maxTokens) > 0 ? Math.min(Number(options.maxTokens), 8192) : 4096
      return Math.ceil(tokens * 1.1) + reserve
    }

    // 一家上游可参与 auto 的模型：默认模型 + 全部免费模型（去重，顺序即优先）。
    // 只算免费款是刻意的——auto 的承诺是「免费额度内自动切换」，付费模型只在
    // 被点名（freeroute/<id> 或通用名）时才派发。
    function eligibleModels(u) {
      const out = []
      const seen = {}
      const def = defaultModelFor(u)
      const list = mergedModels(u)
      const push = function (m) {
        if (!m || !m.id || seen[m.id]) return
        seen[m.id] = true
        out.push(m)
      }
      for (const m of list) { if (m.id === def) push(m) }
      for (const m of list) { if (m.free === true) push(m) }
      return out
    }

    // 池内按 canonical 模型名聚合：质量取各家声明最高值、窗口取最大值
    // （同一款模型在不同网关标称窗口可能不同），providers 保持池的优先级序。
    function modelAggregates(pool) {
      const map = new Map()
      for (const u of pool) {
        for (const m of eligibleModels(u)) {
          const cid = canonicalModelId(m.id)
          if (!cid || cid === 'auto') continue
          let a = map.get(cid)
          if (!a) {
            a = { cid: cid, quality: 0, window: 0, coverage: 0, providers: [], order: map.size }
            map.set(cid, a)
          }
          const w = Number(m.contextWindow) || 0
          if (w > a.window) a.window = w
          const q = Number(m.quality) || 0
          if (q > a.quality) a.quality = q
          if (!a.providers.some(function (p) { return p.upstream.id === u.id })) {
            a.providers.push({ upstream: u, model: m.id, window: w })
          }
        }
      }
      for (const a of map.values()) a.coverage = a.providers.length
      return map
    }

    let lastAnchorNote = ''
    function noteAnchor(a, floor, n3, n4, n5) {
      const sig = a.cid + '|' + a.quality + '|' + a.coverage + '|' + a.window + '|' + floor + '|' + n3 + ',' + n4 + ',' + n5
      if (sig === lastAnchorNote) return
      lastAnchorNote = sig
      log('[freeroute] auto 锚点 → ' + a.cid + '（质量 ' + a.quality + ' · 交集 ' + a.coverage + ' 家 · 窗口 ' + a.window + '）'
        + '；备用层 同档 ' + n3 + ' / 够容量 ' + n4 + ' / 兜底 ' + n5 + '（容量下限 ' + floor + '）')
    }

    // auto 的全部候选，按层输出：
    //   ① 锚点模型的池内首选提供方
    //   ② 同款模型的其他厂商（能力与窗口都不变，最无损的一次转移）
    //   ③ 同质量档且窗口不低于锚点的其他模型（换模型但不掉容量）
    //   ④ 窗口不低于容量下限的其他模型
    //   ⑤ 其余（只在前四层全挂时兜底，沉底不删除）
    // MAX_CHAIN 给链长封顶：免费池里「每个 cid 的全家提供方」可能是几十条，
    // 逐条试错会把首字延迟抬到不可接受。
    //
    // floor = max(本次请求粗估占用, 粘性实际服务窗口)：前者保证不会把已经长大
    // 的会话塞进装不下的模型，后者保证跨请求不来回抖动（根因 D）。装不下的
    // 锚点会被「装得下的最优候选」顶替，但候选本身一个都不删——全部装不下时
    // 仍按原顺序试，让错误信息来自真实上游而不是路由器的猜测。
    const MAX_CHAIN = 12
    function autoChain(pool, floor) {
      const agg = modelAggregates(pool)
      if (agg.size === 0) return []
      const seed = agg.get(canonicalModelId(defaultModelFor(pool[0]))) || null
      let anchor = seed
      for (const a of agg.values()) {
        if (!anchor) { anchor = a; continue }
        if (a.quality > anchor.quality) { anchor = a; continue }
        if (a.quality === anchor.quality && a.coverage > anchor.coverage) anchor = a
      }
      // 容量可行性优先于质量与交集：锚点装不下本次会话时，改挑装得下里最好的。
      // 窗口未知（0）不当作「装不下」——网关没报 context_length 时，旧逻辑也
      // 把它当同窗放行，这里保持一致，否则一个没报窗口的目录会被整条踢下去。
      if (floor > 0 && anchor && anchor.window > 0 && anchor.window < floor) {
        let best = null
        for (const a of agg.values()) {
          if (a.window < floor) continue
          if (!best
            || a.quality > best.quality
            || (a.quality === best.quality && a.coverage > best.coverage)
            || (a.quality === best.quality && a.coverage === best.coverage && a.window > best.window)) best = a
        }
        if (best) anchor = best
      }
      const chain = []
      const used = new Set()
      const emit = function (a) {
        for (const p of a.providers) {
          if (chain.length >= MAX_CHAIN) return
          const k = p.upstream.id + '|' + p.model
          if (used.has(k)) continue
          used.add(k)
          chain.push({ upstream: p.upstream, model: p.model })
        }
      }
      emit(anchor)
      const tier3 = []
      const tier4 = []
      const tier5 = []
      for (const a of agg.values()) {
        if (a === anchor) continue
        if (a.quality === anchor.quality && (a.window === 0 || a.window >= anchor.window)) tier3.push(a)
        else if (a.window === 0 || a.window >= floor) tier4.push(a)
        else tier5.push(a)
      }
      // 层内排序：质量档 → 用户优先级 → 交集家数 → 窗口。
      // 「用户优先级」排在交集之前，是为了让同一家上游的多个模型保持相邻：
      // 某个模型下线时能立刻换到同家的备选，而不是把整家上游错误地冷却掉
      // （chaseChain 的 suppressCooldown 依赖「下一个候选还在同一家」）。
      const byScore = function (x, y) {
        if (y.quality !== x.quality) return y.quality - x.quality
        if (x.order !== y.order) return x.order - y.order
        if (y.coverage !== x.coverage) return y.coverage - x.coverage
        if (y.window !== x.window) return y.window - x.window
        return 0
      }
      tier3.sort(byScore)
      tier4.sort(byScore)
      tier5.sort(byScore)
      for (const a of tier3) emit(a)
      for (const a of tier4) emit(a)
      for (const a of tier5) emit(a)
      noteAnchor(anchor, floor, tier3.length, tier4.length, tier5.length)
      return chain
    }

    // 最近一次成功服务的上下文窗口（粘性基准）。会话在大窗口上游上积累出
    // 长上下文后，即便大窗上游临时冷却、首选换人，也不应让分层基准跌落——
    // 否则下个请求又切回小窗上游，压缩风暴跨请求复发。任何一次在小窗上游
    // 上的成功服务都会自然重置该值（小 → 大方向安全，无需干预）。
    let lastServedWindow = 0

    // 上下文窗口分层（压缩风暴根因 D）：基准 W = max(首选候选窗口, 粘性窗口)，
    // 窗口 >= W（或未知）的候选保持原优先序在前，窗口 < W 的候选整体沉底。
    // 动机：dsh 按上报窗口管理会话压缩，会话在大窗口上游上积累出较长上下文
    // 后，若故障转移直接切到小窗口上游，剩余上下文放不下 → 每步触发压缩 →
    // 压缩蒸发工作集 → 重读 → 再压缩（实测 71 分钟 82 次压缩、零净进展）。
    // 分层后只有同窗/更大窗候选全部失败才会降级到小窗口候选；候选只是沉底
    // 不是删除，全部大窗候选不可用时小窗候选仍按原顺序兜底。auto 上报窗口
    // 取分层后链首的窗口，与实际可用候选一致且跨请求稳定。
    let lastTierNote = ''
    function tierByContextWindow(cands) {
      if (cands.length < 2) return cands
      const base = Math.max(contextWindowOf(cands[0]), lastServedWindow)
      if (!base) return cands
      const same = []
      const smaller = []
      for (const c of cands) {
        const w = contextWindowOf(c)
        if (!w || w >= base) same.push(c)
        else smaller.push(c)
      }
      if (smaller.length === 0 || same.length === 0) return cands
      // 只有真的发生重排（小窗候选原本排在大窗候选之前）才记日志，且签名
      // 变化才记一次，避免每请求刷屏。
      let seenSame = false
      let changed = false
      for (const c of cands) {
        if (smaller.indexOf(c) >= 0) {
          if (seenSame) { changed = true; break }
        } else {
          seenSame = true
        }
      }
      if (changed) {
        const note = smaller.map(function (c) { return c.upstream.id + '/' + c.model + '(' + contextWindowOf(c) + ')' }).join(', ')
        const sig = base + '|' + note
        if (sig !== lastTierNote) {
          lastTierNote = sig
          log('[freeroute] 候选链按上下文窗口分层：基准 ' + base + '，小窗候选沉底 → ' + note + '（同窗候选全部失败才会降级到它们）')
        }
      }
      return same.concat(smaller)
    }

    async function candidatesFor(model, need) {
      const enabled = orderedUpstreams().filter(function (u) { return isEnabled(u.id) })
      const keyed = []
      for (const u of enabled) { if (await hasCredential(u)) keyed.push(u) }
      if (keyed.length === 0) return []
      const healthy = keyed.filter(function (u) { return !cooling(u.id) })
      const pool = healthy.length > 0 ? healthy : keyed.slice().sort(function (a, b) { return ((health.get(a.id) || {}).cooldownUntil || 0) - ((health.get(b.id) || {}).cooldownUntil || 0) })
      // 容量下限 floor = 本次请求粗估占用 与 粘性实际服务窗口 的较大值：
      // 前者防止把已经长大的会话塞进装不下的模型，后者防止跨请求抖动。
      const floor = Math.max(Number(need) || 0, lastServedWindow)
      if (model === 'auto') return autoChain(pool, floor)
      return tierByContextWindow(candidatesSync(pool, model))
    }

    // auto 的上报上下文窗口（根因 A）：让 dsh 按候选链实际首选模型管理会话，
    // 不再写死 32768。dsh 用该值决定何时压缩会话——之前 auto 恒报 32768，而
    // 实际首选模型多为 128K+，导致稍长会话就被压缩裁剪（上下文经常断、agent
    // 记不住进度、反复重做、看起来像死循环）。取首选候选的窗口；候选为空时
    // 回退到已就绪上游的最大窗口；仍未知才 32768。
    async function autoContextWindow() {
      try {
        const cands = await candidatesFor('auto')
        if (cands.length > 0) {
          const head = cands[0]
          for (const m of mergedModels(head.upstream)) {
            if (m.id === head.model && m.contextWindow) return m.contextWindow
          }
        }
        let max = 0
        for (const u of orderedUpstreams()) {
          if (!isEnabled(u.id)) continue
          if (!(await hasCredential(u))) continue
          for (const m of mergedModels(u)) {
            if (m.contextWindow && m.contextWindow > max) max = m.contextWindow
          }
        }
        return max || 32768
      } catch (e) {
        return 32768
      }
    }

    // 沿候选链逐个尝试：出字前失败换下一家，出字后失败直接上抛。
    async function* chaseChain(cands, options) {
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
            if (nxt0) log('[freeroute] 上游 ' + cand.upstream.id + ' 模型 ' + cand.model + ' 空响应(' + String(emptyFinish.code) + ')，切换到 ' + (sameUpNext ? '同上游备选 ' + nxt0.model : nxt0.upstream.id))
            continue
          }
          return
        } catch (e) {
          lastErr = e
          if (options.signal && options.signal.aborted) throw e
          if (produced) throw e
          const nxt = cands[i + 1]
          if (nxt) log('[freeroute] 上游 ' + cand.upstream.id + ' 模型 ' + cand.model + ' 失败(' + String(e && e.code) + ')，切换到 ' + (sameUpNext ? '同上游备选 ' + nxt.model : nxt.upstream.id))
          if (String((e && e.code) || '') === 'SERVER') scheduleReprobe(cand.upstream.id)
        }
      }
      throw lastErr || mkFail('全部候选上游均失败', 'NO_UPSTREAM')
    }

    async function* failoverStream(options) {
      const isAuto = options.model === 'auto'
      const need = estimateContextTokens(options)
      const cands = await candidatesFor(options.model, need)
      if (cands.length === 0 && isAuto) {
        throw mkFail('没有可用的免费上游：请先在 设置 → freeroute 中启用并配置至少一个 API Key', 'NO_UPSTREAM')
      }
      let primaryErr = null
      if (cands.length > 0) {
        let yielded = false
        try {
          for await (const ck of chaseChain(cands, options)) { yielded = true; yield ck }
          return
        } catch (e) {
          if (options.signal && options.signal.aborted) throw e
          // 已产出内容的中途失败不能降级（会重复输出），原样上抛
          if (yielded) throw e
          primaryErr = e
          // 请求本身的问题（取消/不支持的内容）换哪家上游也没用
          const code = String((e && e.code) || '')
          if (code === 'ABORTED' || code === 'UNSUPPORTED_CONTENT') throw e
          if (isAuto) throw e
        }
      }
      // 单模型兜底：候选全挂（提供同一模型的多家厂商同时故障并不少见）、
      // 或该模型的提供方全部在冷却而无候选时，降级到 auto 链继续跑。
      // 用户选单个模型表达的是「偏好」，不是「宁可失败也不用别家」。
      const tried = new Set()
      for (const c of cands) tried.add(c.upstream.id + '|' + c.model)
      const fb = (await candidatesFor('auto', need)).filter(function (c) { return !tried.has(c.upstream.id + '|' + c.model) })
      if (fb.length === 0) {
        // 原始错误比笼统的 NO_UPSTREAM 更有诊断价值
        if (primaryErr) throw primaryErr
        throw mkFail('没有可用的免费上游：当前没有任何已启用并配置 API Key 的上游（或全部候选都在冷却）。请先在 设置 → freeroute 中启用并配置至少一个 API Key', 'NO_UPSTREAM')
      }
      if (!isAuto) {
        // 固定模型降级时在日志里明确原因：无候选（通常该模型无上游提供/未配
        // Key/全在冷却）vs 全部候选失败，减少用户盲目试模型（根因 B 诊断）。
        const reason = cands.length === 0
          ? '无任何已启用且配 Key 的上游提供该模型'
          : '全部候选失败'
        log('[freeroute] 模型 ' + options.model + '：' + reason + '，降级 auto 兜底（' + fb.length + ' 个候选）')
      }
      for await (const ck of chaseChain(fb, options)) yield ck
    }

    const adapter = {
      providerInfo: function (provider) { return { id: provider, name: 'FreeRoute 免费模型' } },
      // 按 dsh 插件文档（@deepseek-ai/dsh-llm-retry）设置 per-provider 重试策略。
      // 适配器在 registerAdapter() 时通过 providerRetryPolicy(provider) 捕获一次，
      // 省略则退回 dsh-llm-retry 的 normal 默认（5 次、500ms→10s）。
      // normal mode + 显式 retryableCodes：只重试瞬时错误。freeroute 内部已有
      // 完整故障转移链（轮换 Key → 切上游 → auto 兜底），外层重试只需覆盖
      // 「整条链瞬时抖动」（限流/超时/5xx/空响应），maxRetries 取 2 避免请求量
      // 按候选数成倍放大。
      // 注意不要用 always mode：免费池耗尽（QUOTA/AUTH）或未配置 Key
      // （NO_UPSTREAM/MISSING_CREDENTIAL）时 freeroute 抛的是永久性错误码，
      // always 会无上限地重试这些不可能成功的请求，且冷却后候选为空，
      // 每轮快速失败成 NO_UPSTREAM 仍被无限重试，请求永远挂起且无报错 surfaced。
      providerRetryPolicy: function () {
        return {
          mode: 'normal',
          maxRetries: 2,
          retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'],
          backoff: { initialDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0.2 }
        }
      },
      listModels: async function () {
        // 只展示「免费且可用」：auto -> 免费模型（通用名，跨上游合并去重）。
        // 未配 Key 上游的模型不展示（选了也用不了）；付费模型不进选择器，
        // 但显式指定（freeroute/<id> 或通用名）仍可派发，见 candidatesSync。
        const readySet = await readyUpstreamIdSet()
        // 模态声明：auto 不声明（未知 = 允许附图，路由失败再自动切换）；
        // 单个免费模型仅在来源明确声明支持图片时带上 ['text','image']。
        const out = [{ provider: ROUTE, id: 'auto', name: '⚡ Auto（自动切换）', description: '按优先级在已启用的免费上游间自动选择与切换' }]
        const freeList = []
        for (const entry of buildAliasIndex().values()) {
          if (entry.free !== true) continue
          const viaReady = entry.via.filter(function (v) { return readySet.has(v.upstream) })
          if (viaReady.length === 0) continue
          freeList.push(withModalities({ provider: ROUTE, id: entry.id, name: entry.name || entry.id, description: '免费模型 · ' + viaReady.length + ' 家上游 · 失效自动切换' }, entry))
        }
        const byId = function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 }
        freeList.sort(byId)
        return out.concat(freeList)
      },
      resolveModel: async function (provider, model) {
        // auto 不再写死 32768：按当前候选链首选模型上报真实窗口（根因 A）。
        // 否则 dsh 永远按 32K 管理会话，稍长对话就被压缩裁剪、上下文经常断。
        // 模态不声明（未知）：用户在 auto 下发图不会被宿主拦下，具体上游不
        // 识图时由 4xx → 候选链自动换模型/换上游。
        if (model === 'auto') {
          return { provider: ROUTE, id: model, name: '⚡ Auto（自动切换）', context: { contextWindow: await autoContextWindow() } }
        }
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
          if (entry) {
            let cw = entry.contextWindow
            if (!cw && entry.via.length > 0) {
              // 目录未带窗口时，取各提供方实际窗口最大值上报，避免一律回退
              // 32768 把会话按 32K 过度压缩（根因 A 辅助路径）。
              for (const v of entry.via) {
                for (const u of orderedUpstreams()) {
                  if (u.id !== v.upstream) continue
                  for (const m of mergedModels(u)) {
                    if (m.id === v.model && m.contextWindow && m.contextWindow > (cw || 0)) cw = m.contextWindow
                  }
                }
              }
            }
            found = { name: entry.name, contextWindow: cw, free: entry.free, inputModalities: entry.inputModalities }
          }
        }
        if (!found) {
          for (const u of orderedUpstreams()) {
            for (const m of mergedModels(u)) { if (m.id === model) { found = m; break } }
            if (found) break
          }
        }
        if (found) {
          return withModalities({ provider: ROUTE, id: model, name: found.name || model, context: { contextWindow: found.contextWindow || 32768 } }, found)
        }
        return { provider: ROUTE, id: model, name: model, context: { contextWindow: 32768 } }
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
      const toolCalls = []
      async function run() {
        for await (const ck of gen) {
          if (ck.type === 'text-delta') text += ck.text
          if (ck.type === 'usage') usage = ck.usage
          if (ck.type === 'finish') finish = ck.reason
          if (ck.type === 'block-end' && ck.block && ck.block.type === 'tool-call') toolCalls.push(ck.block)
        }
        return { text: text, usage: usage, finish: finish, toolCalls: toolCalls }
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

