    function resolveConfigPath() {
      const env = (typeof process === 'object' && process !== null && process.env) ? process.env : {}
      if (env.FREEROUTE_CONFIG) return String(env.FREEROUTE_CONFIG)
      const home = env.DSH_HOME || (osx !== null ? String(osx.homedir()).replace(/\/+$/, '') + '/.dsh' : '')
      return home ? home + '/freeroute.json' : ''
    }

    function readConfigFile() {
      if (fsx === null || !configPath) return null
      try {
        const st = fsx.statSync(configPath)
        if (typeof st.isFile === 'function' && !st.isFile()) return null
        const raw = JSON.parse(fsx.readFileSync(configPath, 'utf8'))
        configMtimeMs = Number(st.mtimeMs) || Date.now()
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
      } catch (e) { return null }
    }

    function writeConfigFile() {
      if (fsx === null || !configPath) return false
      try {
        const cut = configPath.lastIndexOf('/')
        if (cut > 0) { try { fsx.mkdirSync(configPath.slice(0, cut), { recursive: true }) } catch (e2) { } }
        const tmp = configPath + '.tmp'
        const payload = { order: userConfig.order || [], upstreams: userConfig.upstreams || {} }
        if (userConfig.autoTakeover !== undefined) payload.autoTakeover = userConfig.autoTakeover
        if (userConfig.autoInjected !== undefined) payload.autoInjected = userConfig.autoInjected
        if (userConfig.takeoverBackup !== undefined) payload.takeoverBackup = userConfig.takeoverBackup
        if (userConfig.catalog !== undefined) payload.catalog = userConfig.catalog
        fsx.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8')
        fsx.renameSync(tmp, configPath)
        configMtimeMs = Number(fsx.statSync(configPath).mtimeMs) || Date.now()
        return true
      } catch (e) {
        console.error('[freeroute] 配置文件写入失败:', emsg(e))
        return false
      }
    }

    async function importDeclaredKeys(raw) {
      const declared = (raw && raw.keys && typeof raw.keys === 'object' && !Array.isArray(raw.keys)) ? raw.keys : null
      if (!declared || credentials === undefined) return
      for (const pair of Object.entries(declared)) {
        const list = Array.isArray(pair[1]) ? pair[1] : (typeof pair[1] === 'string' ? String(pair[1]).split(/[\n,]+/) : [])
        const cleaned = list.map(function (x) { return String(x).trim() }).filter(function (x) { return x.length > 0 }).slice(0, 8)
        if (cleaned.length === 0) continue
        const up = effectiveMap().get(pair[0])
        if (!up) continue
        try {
          const refs = keyRefsFor(up)
          for (let i = 0; i < cleaned.length && i < refs.length; i++) {
            const hit = await credentials.describe(refs[i])
            if (hit && hit.configured) break
            await credentials.set(refs[i], cleaned[i])
          }
        } catch (e) { }
      }
    }

    function maybeReloadConfig() {
      if (!configFileOk) return
      try {
        const m = Number(fsx.statSync(configPath).mtimeMs) || 0
        if (m === configMtimeMs) return
      } catch (e) { return }
      const raw = readConfigFile()
      if (raw === null) return
      userConfig = sanitizeConfig(raw)
      importDeclaredKeys(raw).catch(function () { })
      checkTakeover().catch(function () { })
    }

    function mergePatch(base, p) {
      const out = JSON.parse(JSON.stringify(base))
      for (const k of Object.keys(p || {})) {
        const v = p[k]
        if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = mergePatch(out[k], v)
        else out[k] = JSON.parse(JSON.stringify(v))
      }
      return out
    }

    const ConfigSchema = function (raw) { return sanitizeConfig(raw) }
    ConfigSchema.toJSON = function () { return { type: 'object' } }

    function cfgOf(id) { return (userConfig.upstreams && userConfig.upstreams[id]) || {} }
    function isEnabled(id) { return cfgOf(id).enabled !== false }

    function effectiveMap() {
      const map = new Map()
      for (const b of BUILTIN_UPSTREAMS) {
        const c = Object.assign({}, b)
        c.source = 'builtin'
        map.set(b.id, c)
      }
      for (const rp of Array.from(remoteUpstreams.entries())) {
        const r = Object.assign({}, rp[1])
        delete r.apikeys
        r.source = 'remote'
        map.set(r.id, r)
      }
      const uc = userConfig.upstreams || {}
      for (const pair of Object.entries(uc)) {
        const id = pair[0]
        const c = pair[1]
        if (!c || !c.custom) continue
        const base = map.get(id) || { id: id, name: id, models: [], baseUrl: '', keyRef: 'FREEROUTE_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_KEY' }
        const cu = c.custom
        const merged = Object.assign({}, base)
        merged.source = 'custom'
        if (cu.baseUrl) merged.baseUrl = cu.baseUrl
        if (cu.chatPath) merged.chatPath = cu.chatPath
        if (cu.requestExtra) merged.requestExtra = cu.requestExtra
        if (cu.keyRef) merged.keyRef = cu.keyRef
        if (cu.noAuth) merged.noAuth = true
        if (cu.proxy) merged.proxy = String(cu.proxy)
        if (cu.freeModels) merged.freeModels = pickModelIds(cu.freeModels)
        if (cu.name) merged.name = cu.name
        if (cu.note !== undefined) merged.note = cu.note
        if (cu.signupUrl !== undefined) merged.signupUrl = cu.signupUrl
        if (cu.models) merged.models = cu.models
        if (cu.defaultModel) merged.defaultModel = cu.defaultModel
        if (!merged.defaultModel && merged.models && merged.models.length > 0) merged.defaultModel = merged.models[0].id
        if (!merged.baseUrl) continue
        map.set(id, merged)
      }
      // 本地隐藏（removed 标记）优先于一切来源：同名内置/远程/自定义一并移除，
      // 远程同步永不写 userConfig，被删除的上游不会被同步复活。
      for (const pair of Object.entries(uc)) {
        if (pair[1] && pair[1].removed) map.delete(pair[0])
      }
      return map
    }

    function orderedUpstreams() {
      const map = effectiveMap()
      const known = Array.from(map.keys())
      const ord = (userConfig.order || []).filter(function (id) { return map.has(id) })
      const rest = known.filter(function (id) { return ord.indexOf(id) < 0 })
      return ord.concat(rest).map(function (id) { return map.get(id) })
    }

    // ---- 模型探测：GET <baseUrl>/models（OpenAI 格式）合并出完整可用列表 ----
    // 目录里默认只收录各家免费模型；探测把其余可用模型补进来（免费在前）。
    const probeCache = new Map() // id -> { models: [{id,name,contextWindow,free}], at, error }
    const goodModel = new Map() // upstreamId -> 最近一次真正出字的模型（学习到的可用默认）

    function isFreeModelId(id) { return /(^|[^a-z])free($|[^a-z])/i.test(String(id)) }

