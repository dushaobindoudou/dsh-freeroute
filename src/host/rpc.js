    const rpc = {}
    rpc['freeroute.state'] = async function () { return buildState() }
    rpc['freeroute.set-key'] = async function (args) {
      if (credentials === undefined) return { ok: false, error: 'credentials 服务不可用' }
      const id = args && args.id
      const key = args && typeof args.key === 'string' ? args.key.trim() : ''
      if (!id || key.length === 0) return { ok: false, error: '参数不完整' }
      let target = null
      for (const u of orderedUpstreams()) { if (u.id === id) { target = u; break } }
      if (!target) return { ok: false, error: '未知上游: ' + id }
      // 多 Key 支持：换行/逗号/分号分隔的多把 Key 依次存入
      // KEY / KEY_2 / KEY_3…（至多 8 把，多账号轮换免费额度）
      const parts = key.split(/[\n,;]+/).map(function (x) { return x.trim() }).filter(function (x) { return x.length > 0 }).slice(0, 8)
      if (parts.length === 0) return { ok: false, error: '参数不完整' }
      try {
        const refs = keyRefsFor(target)
        for (let i = 0; i < parts.length; i++) await credentials.set(refs[i], parts[i])
        // 之前存过更多把的残留要清掉（set-key 整体替换 Key 环）
        for (let i = parts.length; i < refs.length; i++) { try { await credentials.unset(refs[i]) } catch (e) { } }
        // 密钥就位后立刻探测一次模型列表，让面板尽快显示完整可用模型
        try { await probeModels(target, true) } catch (e) { }
        try { await checkTakeover() } catch (e) { }
        return { ok: true, keys: parts.length }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }
    rpc['freeroute.clear-key'] = async function (args) {
      if (credentials === undefined) return { ok: false, error: 'credentials 服务不可用' }
      const id = args && args.id
      let target = null
      for (const u of orderedUpstreams()) { if (u.id === id) { target = u; break } }
      if (!target) return { ok: false, error: '未知上游: ' + id }
      try {
        for (const ref of keyRefsFor(target)) { try { await credentials.unset(ref) } catch (e) { } }
        try { await checkTakeover() } catch (e) { }
        return { ok: true }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }
    // 沙箱 realm 限制：settings.update/replace 只接受宿主 realm 的普通对象，
    // 沙箱内构造的对象字面量会被 isPlainObject 拒绝。因此所有配置写入都由
    // 客户端构造完整 patch（RPC args 跨 JSON 边界后即宿主对象），这里只做
    // 只读校验后原样透传；删除类操作则取 describe().user（宿主可变副本）
    // 原地改造后 replace。
    function validatePatch(p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return 'patch 需为对象'
      for (const k of Object.keys(p)) {
        if (k !== 'order' && k !== 'upstreams' && k !== 'catalog' && k !== 'autoTakeover') return '不允许的字段: ' + k
      }
      if (p.order !== undefined) {
        if (!Array.isArray(p.order)) return 'order 需为数组'
        const seen = {}
        for (const x of p.order) {
          if (typeof x !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(x)) return 'order 项无效: ' + x
          if (seen[x]) return 'order 含重复项: ' + x
          seen[x] = true
        }
      }
      if (p.upstreams !== undefined) {
        if (!p.upstreams || typeof p.upstreams !== 'object' || Array.isArray(p.upstreams)) return 'upstreams 需为对象'
        for (const pair of Object.entries(p.upstreams)) {
          const id = pair[0]
          const e = pair[1]
          if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) return '上游 id 无效: ' + id
          if (!e || typeof e !== 'object' || Array.isArray(e)) return 'upstreams.' + id + ' 需为对象'
          for (const ek of Object.keys(e)) {
            if (ek !== 'enabled' && ek !== 'custom') return '不允许的字段: upstreams.' + id + '.' + ek
          }
          if (e.enabled !== undefined && typeof e.enabled !== 'boolean') return 'enabled 需为布尔值'
          if (e.custom !== undefined) {
            const c = e.custom
            if (!c || typeof c !== 'object' || Array.isArray(c)) return 'custom 需为对象'
            for (const ck of Object.keys(c)) {
              if (['baseUrl', 'keyRef', 'noAuth', 'name', 'note', 'signupUrl', 'defaultModel', 'models', 'proxy', 'freeModels'].indexOf(ck) < 0) return '不允许的字段: custom.' + ck
            }
            if (c.baseUrl !== undefined && (typeof c.baseUrl !== 'string' || !/^https?:\/\//.test(c.baseUrl) || c.baseUrl.length > 2048)) return 'custom.baseUrl 无效（需 http(s):// 开头）'
            if (c.keyRef !== undefined && (typeof c.keyRef !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(c.keyRef))) return 'custom.keyRef 无效（需大写字母/数字/下划线）'
            if (c.noAuth !== undefined && typeof c.noAuth !== 'boolean') return 'custom.noAuth 需为布尔值'
            if (c.proxy !== undefined && (typeof c.proxy !== 'string' || !/^https?:\/\//.test(c.proxy) || c.proxy.length > 512)) return 'custom.proxy 无效（需 http(s):// 开头）'
            if (c.freeModels !== undefined) {
              if (!Array.isArray(c.freeModels) || c.freeModels.length > 64) return 'custom.freeModels 需为至多 64 项数组'
              for (const fm of c.freeModels) { if (typeof fm !== 'string' || fm.length > 200) return 'custom.freeModels[] 项无效' }
            }
            for (const sk of ['name', 'note', 'signupUrl', 'defaultModel']) {
              if (c[sk] !== undefined && (typeof c[sk] !== 'string' || c[sk].length > 512)) return 'custom.' + sk + ' 无效'
            }
            if (c.models !== undefined) {
              if (!Array.isArray(c.models) || c.models.length === 0 || c.models.length > 64) return 'custom.models 需为 1-64 项数组'
              for (const m of c.models) {
                if (!m || typeof m !== 'object' || Array.isArray(m)) return 'custom.models[] 需为对象'
                if (typeof m.id !== 'string' || m.id.length === 0 || m.id.length > 200) return 'custom.models[].id 无效'
                if (m.name !== undefined && typeof m.name !== 'string') return 'custom.models[].name 无效'
                if (m.contextWindow !== undefined && !(Number(m.contextWindow) > 0)) return 'custom.models[].contextWindow 无效'
              }
            }
          }
        }
      }
      if (p.catalog !== undefined) {
        const c = p.catalog
        if (!c || typeof c !== 'object' || Array.isArray(c)) return 'catalog 需为对象'
        for (const ck of Object.keys(c)) {
          if (ck !== 'remoteUrl' && ck !== 'autoRefreshMs') return '不允许的字段: catalog.' + ck
        }
        if (c.remoteUrl !== undefined && (typeof c.remoteUrl !== 'string' || c.remoteUrl.length > 2048)) return 'catalog.remoteUrl 无效'
        if (c.autoRefreshMs !== undefined && !(Number(c.autoRefreshMs) >= 60000)) return 'catalog.autoRefreshMs 需 ≥ 60000'
      }
      if (p.autoTakeover !== undefined && typeof p.autoTakeover !== 'boolean') return 'autoTakeover 需为布尔值'
      return null
    }
    rpc['freeroute.apply-patch'] = async function (args) {
      try {
        const p = args && args.patch
        const err = validatePatch(p)
        if (err) return { ok: false, error: err }
        if (configFileOk) {
          userConfig = sanitizeConfig(mergePatch(userConfig, p))
          writeConfigFile()
        } else {
          await requireSettings().update(NS, p)
        }
        if (p && p.autoTakeover === false) {
          // 关闭自动接管：若本次进程接过管，恢复用户原先的默认模型选择
          try {
            if (takeoverDone) {
              takeoverDone = false
              const defaultModelSvc = ctx.get('agentDefaultModel')
              if (defaultModelSvc !== undefined && takeoverPrev) await defaultModelSvc.saveSelection(takeoverPrev)
              takeoverPrev = null
            }
          } catch (e) { }
        } else if (p && p.autoTakeover === true) {
          checkTakeover().catch(function () { })
        } else if (configFileOk) {
          // settings 模式由 scope.watch 联动；JSON 模式显式触发
          checkTakeover().catch(function () { })
        }
        return { ok: true }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }
    rpc['freeroute.remove-upstream'] = async function (args) {
      try {
        const id = args && args.id
        if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(id)) return { ok: false, error: 'id 无效' }
        if (configFileOk) {
          if (!userConfig.upstreams || !(id in userConfig.upstreams)) return { ok: false, error: '未找到上游: ' + id }
          const next = JSON.parse(JSON.stringify(userConfig))
          delete next.upstreams[id]
          if (Array.isArray(next.order)) next.order = next.order.filter(function (x) { return x !== id })
          userConfig = sanitizeConfig(next)
          writeConfigFile()
          checkTakeover().catch(function () { })
          return { ok: true }
        }
        const s = requireSettings()
        let desc = null
        for (const d of s.describe()) { if (d.ns === NS) { desc = d; break } }
        if (!desc || !desc.user || typeof desc.user !== 'object') return { ok: false, error: '没有可删除的用户配置' }
        const user = desc.user
        if (!user.upstreams || !(id in user.upstreams)) return { ok: false, error: '未找到上游: ' + id }
        delete user.upstreams[id]
        if (Array.isArray(user.order)) {
          const kept = []
          for (const x of user.order) { if (x !== id && typeof x === 'string') kept.push(x) }
          user.order = kept
        }
        await s.replace(NS, user)
        return { ok: true }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }
    rpc['freeroute.get-keys'] = async function (args) {
      try {
        const id = args && args.id
        const u = effectiveMap().get(id)
        if (!u) return { ok: false, error: '未找到上游: ' + id }
        if (u.noAuth) return { ok: true, keys: [] }
        const ring = await keyRing(u)
        return { ok: true, keys: ring.map(function (k) { return k.key }) }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }
    rpc['freeroute.catalog.sync'] = async function () { return syncCatalog() }
    rpc['freeroute.probe'] = async function (args) {
      const id = args && args.id
      const targets = id
        ? orderedUpstreams().filter(function (u) { return u.id === id })
        : orderedUpstreams().filter(function (u) { return isEnabled(u.id) })
      if (targets.length === 0) return { ok: false, error: id ? ('未知上游: ' + id) : '没有可探测的上游' }
      const results = []
      for (const u of targets) {
        const r = await probeModels(u, true)
        results.push({ id: u.id, count: r.models.length, free: r.models.filter(function (m) { return m.free }).length, error: r.error })
      }
      return { ok: true, results: results }
    }
    rpc['freeroute.test'] = async function (args) {
      const id = args && args.id
      if (!id) return { ok: false, error: '参数不完整' }
      return testUpstream(id)
    }
    rpc['freeroute.set-default'] = async function (args) {
      try {
        // 调用时再取：该服务可能晚于本插件启动
      const defaultModelSvc = ctx.get('agentDefaultModel')
      if (defaultModelSvc === undefined) return { ok: false, error: 'agentDefaultModel 服务不可用' }
        const model = args && args.model
        if (typeof model !== 'string' || model.length === 0) return { ok: false, error: '参数不完整' }
        await defaultModelSvc.saveSelection({ provider: ROUTE, model: model })
        return { ok: true }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }

