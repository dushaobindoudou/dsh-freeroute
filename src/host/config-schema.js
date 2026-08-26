function sanitizeConfig(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  const out = { order: [], upstreams: {} }
  if (Array.isArray(src.order)) out.order = src.order.filter(function (x) { return typeof x === 'string' })
  if (src.upstreams && typeof src.upstreams === 'object') {
    for (const pair of Object.entries(src.upstreams)) {
      const k = pair[0]
      const v = pair[1]
      if (!v || typeof v !== 'object') continue
      const entry = {}
      if (typeof v.enabled === 'boolean') entry.enabled = v.enabled
      // 本地隐藏标记：内置/远程上游被用户删除时置 true（记住删除，远程同步不复活）
      if (v.removed === true) entry.removed = true
      if (v.custom && typeof v.custom === 'object') {
        const c = v.custom
        const cu = {}
        if (typeof c.baseUrl === 'string' && /^https?:\/\//.test(c.baseUrl)) cu.baseUrl = c.baseUrl.trim().replace(/\/+$/, '')
        // 非标网关：chatPath 覆盖 /chat/completions；requestExtra 附加标量体字段
        if (typeof c.chatPath === 'string' && /^\/[\w\-./]*$/.test(c.chatPath)) cu.chatPath = c.chatPath
        if (c.requestExtra && typeof c.requestExtra === 'object' && !Array.isArray(c.requestExtra)) {
          const ex = {}
          for (const p of Object.entries(c.requestExtra)) {
            if (/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(p[0]) && (p[1] === null || typeof p[1] === 'string' || typeof p[1] === 'number' || typeof p[1] === 'boolean')) ex[p[0]] = p[1]
          }
          if (Object.keys(ex).length > 0) cu.requestExtra = ex
        }
        if (typeof c.proxy === 'string' && /^https?:\/\//.test(c.proxy)) cu.proxy = c.proxy.trim()
        if (Array.isArray(c.freeModels) && c.freeModels.length > 0) cu.freeModels = pickModelIds(c.freeModels)
        if (typeof c.keyRef === 'string' && c.keyRef.length > 0) cu.keyRef = c.keyRef
        if (c.noAuth === true) cu.noAuth = true
        if (typeof c.name === 'string' && c.name.length > 0) cu.name = c.name
        if (typeof c.note === 'string') cu.note = c.note
        if (typeof c.signupUrl === 'string') cu.signupUrl = c.signupUrl
        if (typeof c.defaultModel === 'string' && c.defaultModel.length > 0) cu.defaultModel = c.defaultModel
        if (Array.isArray(c.models)) {
          const ms = []
          for (const m of c.models) {
            if (m && typeof m.id === 'string' && m.id.length > 0) {
              ms.push({ id: m.id, name: (typeof m.name === 'string' && m.name.length > 0) ? m.name : m.id, contextWindow: Number(m.contextWindow) > 0 ? Number(m.contextWindow) : 32768 })
            }
          }
          if (ms.length > 0) cu.models = ms
        }
        if (Object.keys(cu).length > 0) entry.custom = cu
      }
      out.upstreams[k] = entry
    }
  }
  if (typeof src.autoTakeover === 'boolean') out.autoTakeover = src.autoTakeover
  if (typeof src.autoInjected === 'boolean') out.autoInjected = src.autoInjected
  // 接管前的用户原默认（显式打开开关授权覆盖时备份，关闭时恢复）
  if (src.takeoverBackup && typeof src.takeoverBackup === 'object') {
    const tb = src.takeoverBackup
    if (typeof tb.provider === 'string' && tb.provider.length > 0 && typeof tb.model === 'string' && tb.model.length > 0) {
      out.takeoverBackup = { provider: tb.provider, model: tb.model }
    }
  }
  if (src.catalog && typeof src.catalog === 'object') {
    const c = {}
    if (typeof src.catalog.remoteUrl === 'string') c.remoteUrl = src.catalog.remoteUrl.trim()
    if (Number(src.catalog.autoRefreshMs) >= 60000) c.autoRefreshMs = Number(src.catalog.autoRefreshMs)
    if (Object.keys(c).length > 0) out.catalog = c
  }
  return out
}

function slugText(x) {
  return String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
}

// 目录条目统一归一。除完整 native 字段外，支持极简格式（一行一个厂商）：
//   { providerName, getkey, 教程, api }
//   providerName -> 显示名；getkey -> 申请 Key 链接；教程 -> 申请教程链接；
//   api -> baseUrl（模型列表无需写在目录里：保存 Key 后自动探测即真相）
function firstNonEmptyStr() {
  for (const v of arguments) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return ''
}

