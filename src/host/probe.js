    async function probeModels(u, force) {
      const cached = probeCache.get(u.id)
      if (!force && cached && Date.now() - cached.at < 1800000) return cached
      const result = { models: (cached && cached.models) || [], at: Date.now(), error: '' }
      try {
        if (subprocess === undefined) throw mkFail('subprocess 服务不可用', 'CONFIG')
        const key = await maybeKey(u)
        const url = String(u.baseUrl).replace(/\/+$/, '') + '/models'
        const headers = { accept: 'application/json' }
        if (key) headers.authorization = 'Bearer ' + key
        const r = await rawGet(url, 15000, headers, u.proxy)
        if (r.status !== 0 && (r.status < 200 || r.status >= 300)) throw mkFail('HTTP ' + r.status, 'HTTP_' + r.status)
        const parsed = JSON.parse(r.body)
        const data = parsed && Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed) ? parsed : [])
        const seen = {}
        const free = []
        const paid = []
        // 声明式免费标记要在截断前生效：B.AI 这类免费款不含 “free” 字样
        // 且排在目录后段，若先截断再标记会把免费模型裁掉
        const declaredSet = new Set(Array.isArray(u.freeModels) ? u.freeModels : [])
        for (const m of data) {
          const id = m && typeof m.id === 'string' ? m.id.trim() : ''
          if (!id || seen[id]) continue
          seen[id] = true
          const cw = Number(m.context_window || m.context_length || m.max_context_window)
          const entry = {
            id: id,
            name: (typeof m.name === 'string' && m.name.length > 0) ? m.name : id,
            contextWindow: cw > 0 ? cw : 0,
            free: isFreeModelId(id) || declaredSet.has(id)
          }
          if (entry.free) free.push(entry)
          else paid.push(entry)
        }
        // 免费模型全收；付费可用模型收前 24 个，避免选择列表爆炸
        result.models = free.concat(paid.slice(0, 24))
        result.at = Date.now()
        result.error = ''
      } catch (e) { result.error = emsg(e) }
      probeCache.set(u.id, result)
      return result
    }

