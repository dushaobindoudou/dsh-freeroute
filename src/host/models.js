    function mergedModels(u) {
      // 目录即真相：探测拿到过列表就只用探测结果（免费模型轮换频繁，固定
      // 列表必然腐化）；静态表只作无 /models 端点（如 SenseNova）或首探前
      // 的种子。探测每 10 分钟强刷 + 失败触发重探，见 scheduleReprobe/probeAll。
      const probe = probeCache.get(u.id)
      if (probe && probe.models.length > 0) {
        return applyFreeModels(probe.models.slice(), u)
      }
      const out = []
      const seen = {}
      for (const m of (u.models || [])) {
        if (seen[m.id]) continue
        seen[m.id] = true
        out.push({ id: m.id, name: m.name || m.id, contextWindow: m.contextWindow || 32768, free: isFreeModelId(m.id) })
      }
      return applyFreeModels(out, u)
    }

    // 声明式免费标记：模型名不含 “free” 时（如 B.AI 的 hy3 / mimo-v2.5），
    // 由内置表或服务端目录的 freeModels 列表指定；标记后免费在前排序。
    function applyFreeModels(list, u) {
      const declared = Array.isArray(u.freeModels) ? u.freeModels : []
      if (declared.length === 0) {
        list.sort(function (a, b) { return (b.free ? 1 : 0) - (a.free ? 1 : 0) })
        return list
      }
      const set = new Set(declared)
      for (const m of list) { if (set.has(m.id)) m.free = true }
      list.sort(function (a, b) { return (b.free ? 1 : 0) - (a.free ? 1 : 0) })
      return list
    }

    function defaultModelFor(u) {
      const list = mergedModels(u)
      if (list.length === 0) return ''
      // 优先用「最近真正出过字的模型」：上游目录里有 id 但实际不可用的单点
      // 故障（如 OpenCode 免费款轮换）很常见，学到的可用默认最可靠。
      const learned = goodModel.get(u.id)
      if (learned && list.some(function (m) { return m.id === learned })) return learned
      if (u.defaultModel && list.some(function (m) { return m.id === u.defaultModel })) return u.defaultModel
      for (const m of list) { if (m.free) return m.id }
      return list[0].id
    }

    // 模型级候选：默认模型 + 同上游最多 2 个备选免费模型（auto 派发与连通
    // 测试用）。某单个模型「Model is unavailable」时先换模型，再换上游。
    function modelCandidatesFor(u) {
      const out = []
      const first = defaultModelFor(u)
      if (first) out.push(first)
      for (const m of mergedModels(u)) {
        if (out.length >= 3) break
        if (m.free === true && out.indexOf(m.id) < 0) out.push(m.id)
      }
      return out
    }

    // ---- 通用模型名（对外）与平台映射（对内）----
    // 对外只暴露通用 id（如 deepseek-3.5-flash）：取路径末段、去掉组织前缀、
    // 去掉 :free/-free 免费标记、统一小写与连字符——不向上暴露具体路由。
    // 对内用别名索引记录「通用名 -> 各平台真实模型」，请求时按上游优先级在
    // 提供同一模型的多家平台间自动故障转移；索引随探测/目录/配置变化自动重建
    // （每次调用即时计算，量级为几百条字符串操作，无陈旧缓存问题）。
    function canonicalModelId(raw) {
      let out = String(raw || '').trim().toLowerCase()
      const slash = out.lastIndexOf('/')
      if (slash >= 0) out = out.slice(slash + 1)
      out = out.replace(/:free$/, '').replace(/-free$/, '')
      out = out.replace(/[_\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      return out
    }

    function buildAliasIndex() {
      const byId = new Map()
      for (const u of orderedUpstreams()) {
        if (!isEnabled(u.id)) continue
        for (const m of mergedModels(u)) {
          const cid = canonicalModelId(m.id)
          if (!cid || cid === 'auto') continue
          let entry = byId.get(cid)
          if (!entry) {
            entry = { id: cid, name: m.name && m.name !== m.id ? m.name : '', contextWindow: m.contextWindow || null, free: false, via: [] }
            byId.set(cid, entry)
          }
          if (m.free === true) entry.free = true
          if (!entry.contextWindow && m.contextWindow) entry.contextWindow = m.contextWindow
          if (!entry.name && m.name && m.name !== m.id) entry.name = m.name
          if (!entry.via.some(function (v) { return v.upstream === u.id && v.model === m.id })) {
            entry.via.push({ upstream: u.id, model: m.id })
          }
        }
      }
      return byId
    }

    function validateLearned(u) {
      const g = goodModel.get(u.id)
      if (g && !mergedModels(u).some(function (m) { return m.id === g })) goodModel.delete(u.id)
    }

    async function probeAll() {
      const ups = orderedUpstreams().filter(function (u) { return isEnabled(u.id) })
      await Promise.all(ups.map(function (u) {
        return probeModels(u, true).then(function () { validateLearned(u) }).catch(function () { })
      }))
    }

    // 失败触发重探：模型级 SERVER 错误（如 "Model is unavailable"）后强制刷新
    // 该上游目录，让下一轮派发直接用上新列表。每上游 60s 内至多一次。
    const reprobeAt = new Map()
    function scheduleReprobe(id) {
      const now = Date.now()
      if (now - (reprobeAt.get(id) || 0) < 60000) return
      reprobeAt.set(id, now)
      const u = orderedUpstreams().find(function (x) { return x.id === id })
      if (!u) return
      probeModels(u, true).then(function () { validateLearned(u) }).catch(function () { })
    }

