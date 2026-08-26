    function statsFor(id) {
      let s = stats.get(id)
      if (!s) { s = { requests: 0, ok: 0, failed: 0, tokensIn: 0, tokensOut: 0, lastLatencyMs: null, lastUsedAt: null }; stats.set(id, s) }
      return s
    }
    function healthFor(id) {
      let h = health.get(id)
      if (!h) { h = { consecutiveFailures: 0, cooldownUntil: 0, lastError: null, lastErrorAt: null }; health.set(id, h) }
      return h
    }
    function cooling(id) { const h = health.get(id); return !!(h && h.cooldownUntil > Date.now()) }

    function recordSuccess(id, usage, latencyMs) {
      const s = statsFor(id)
      s.ok += 1
      s.lastLatencyMs = latencyMs
      s.lastUsedAt = Date.now()
      if (usage) { s.tokensIn += usage.inputTokens || 0; s.tokensOut += usage.outputTokens || 0 }
      const h = healthFor(id)
      h.consecutiveFailures = 0
      h.cooldownUntil = 0
    }
    function recordFailure(id, err, suppressCooldown) {
      const s = statsFor(id)
      s.failed += 1
      s.lastUsedAt = Date.now()
      const h = healthFor(id)
      const code = String((err && err.code) || 'UNKNOWN')
      // 所有失败都计入 consecutiveFailures：冷却到期后 health.state 仍显示
      // degraded（而非误判回 up），直到下一次成功请求才会复位。
      h.consecutiveFailures += 1
      // suppressCooldown：同一次派发里还会尝试该上游的其他模型（模型级故障
      // 转移），此时不进入冷却——真正判死刑要等所有备选模型都失败。
      if (!suppressCooldown) {
        let cd
        if (code === 'AUTH' || code === 'MISSING_CREDENTIAL' || code === 'CONFIG') cd = Date.now() + 600000
        else if (code === 'RATE_LIMIT') cd = Date.now() + ((err && err.providerRetryAfterMs) || 60000)
        else cd = Date.now() + Math.min(30000 * Math.pow(2, h.consecutiveFailures - 1), 600000)
        h.cooldownUntil = cd
      }
      h.lastError = emsg(err)
      h.lastErrorAt = Date.now()
    }

    async function hasCredential(up) {
      return (await keyRing(up)).length > 0
    }

    // 就绪上游集合：已启用且凭据可用（配了 Key 或免鉴权）。
    // 模型列表只展示「免费且可用」的模型：没 Key 的上游其模型点了也用不了。
    async function readyUpstreamIdSet() {
      const set = new Set()
      for (const u of orderedUpstreams()) {
        if (!isEnabled(u.id)) continue
        if (await hasCredential(u)) set.add(u.id)
      }
      return set
    }

