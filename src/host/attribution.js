    // ---- 逐条回复的模型归属 ------------------------------------------------
    // 数据流：适配器出字成功时拿到「本次真正服务的上游 + 模型」，按
    // (sessionId, turn, step) 暂存 → 宿主的 assistant/message 落地时把这份归属
    // 绑到那条消息的 messageId 上 → 客户端按 messageId 取回并显示在回复时间
    // 右侧。宿主拿不到 messageId（适配器在消息落盘前就被调用），所以必须等
    // assistant/message 事件来对齐键。
    const SERVED_PENDING_MAX = 64 // 每个会话最多暂存多少步（兜底防泄漏）
    const SERVED_SESSION_MAX = 32 // 最多跟踪多少个会话

    function servedKey(turn, step) { return String(turn) + ':' + String(step) }

    // 长期只开新会话不销毁时，turn/step 表也要有上限（丢掉最老的一个会话，
    // 只影响该会话的标注，不影响历史与对话本身）。
    function trimSessions(map, keep, max) {
      while (map.size > max) {
        const oldest = map.keys().next()
        if (oldest.done || oldest.value === keep) break
        map.delete(oldest.value)
      }
    }

    function touchServedSession(sid) {
      if (servedSessionIds.has(sid)) return
      servedSessionIds.set(sid, new Set())
      while (servedSessionIds.size > SERVED_SESSION_MAX) {
        const oldest = servedSessionIds.keys().next()
        if (oldest.done || oldest.value === sid) break
        forgetServed(oldest.value)
      }
    }

    function forgetServed(sessionId) {
      const sid = sessionId === undefined || sessionId === null ? '' : String(sessionId)
      if (sid.length === 0) return
      const ids = servedSessionIds.get(sid)
      if (ids) { for (const mid of ids) servedByMessage.delete(mid) }
      servedSessionIds.delete(sid)
      servedPending.delete(sid)
      sessionTurns.delete(sid)
    }

    // 适配器成功出字后调用：只记「会话消息」的归属，compaction / 会话标题这类
    // 内部调用（options.purpose 有值）不参与展示。
    function noteServed(options, upstream, model) {
      if (!options || options.purpose) return
      const sid = options.sessionId === undefined || options.sessionId === null ? '' : String(options.sessionId)
      if (sid.length === 0) return
      const at = sessionTurns.get(sid)
      if (!at) return
      let pending = servedPending.get(sid)
      if (!pending) { pending = new Map(); servedPending.set(sid, pending) }
      if (pending.size >= SERVED_PENDING_MAX) {
        const oldest = pending.keys().next()
        if (!oldest.done) pending.delete(oldest.value)
      }
      touchServedSession(sid)
      pending.set(servedKey(at.turn, at.step), {
        model: String(model || ''),
        upstream: String((upstream && upstream.id) || ''),
        upstreamName: String((upstream && (upstream.name || upstream.id)) || ''),
        requested: String(options.model || '')
      })
    }

    // assistant/message 落地时按 (turn, step) 把暂存的归属绑到消息 id 上。
    function bindServed(session, event) {
      const sid = session && session.id !== undefined && session.id !== null ? String(session.id) : ''
      if (sid.length === 0) return
      const pending = servedPending.get(sid)
      if (!pending || pending.size === 0) return
      const data = event && event.data
      const message = data && data.message
      const mid = message && message.id !== undefined && message.id !== null ? String(message.id) : ''
      if (mid.length === 0) return
      const key = servedKey(data.turn, data.step)
      const record = pending.get(key)
      if (!record) return
      pending.delete(key)
      servedByMessage.set(mid, record)
      touchServedSession(sid)
      servedSessionIds.get(sid).add(mid)
    }

    // 读一个会话的归属表（客户端 RPC 用）。返回普通对象，跨 JSON 边界安全。
    function servedForSession(sessionId) {
      const sid = sessionId === undefined || sessionId === null ? '' : String(sessionId)
      const out = {}
      const ids = servedSessionIds.get(sid)
      if (!ids) return out
      for (const mid of ids) {
        const record = servedByMessage.get(mid)
        if (record) out[mid] = record
      }
      return out
    }

    // 订阅会话事件：跟踪 turn/step（适配器只知道 sessionId，不知道自己在第几步），
    // 并在 assistant/message 落地时完成 messageId 绑定。测试夹具没有 ctx.on 时静默跳过。
    function watchServed() {
      if (typeof ctx.on !== 'function') return
      try {
        ctx.effect(function () {
          const offEvent = ctx.on('session/event', function (session, event) {
            if (!event || typeof event.type !== 'string') return
            const sid = session && session.id !== undefined && session.id !== null ? String(session.id) : ''
            if (sid.length === 0) return
            if (event.type === 'turn/start') {
              sessionTurns.set(sid, { turn: event.data.turn, step: 0 })
              trimSessions(sessionTurns, sid, SERVED_PENDING_MAX)
              return
            }
            if (event.type === 'step/start') {
              sessionTurns.set(sid, { turn: event.data.turn, step: event.data.step })
              trimSessions(sessionTurns, sid, SERVED_PENDING_MAX)
              return
            }
            if (event.type === 'assistant/message') bindServed(session, event)
          })
          const offDisposed = ctx.on('session/disposed', function (session) {
            forgetServed(session && session.id)
          })
          return function () {
            try { offEvent() } catch (e) { }
            try { offDisposed() } catch (e) { }
          }
        })
      } catch (e) {
        // 订阅失败只影响标注，绝不能拖垮整个插件（设置面板与路由照常可用）
        console.error('[freeroute] 会话事件订阅失败（逐条模型标注不可用）:', emsg(e))
      }
    }
