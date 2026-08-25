// 目录自带 Key 环（apikey: ["sk-…", "sk-…"]，至多 8 把）：同步时整环写入
// 凭据并参与轮换；不写该字段的厂商不动用户手工保存的 Key。
function pickApiKeys(v) {
  const out = []
  if (Array.isArray(v)) {
    for (const k of v) {
      if (typeof k === 'string' && k.trim().length > 0) out.push(k.trim())
      if (out.length >= 8) break
    }
  }
  return out
}

function pickModelIds(v) {
  const out = []
  if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === 'string' && x.trim().length > 0) out.push(x.trim())
      if (out.length >= 64) break
    }
  }
  return out
}

function normalizeCatalogEntry(e) {
  if (!e || typeof e !== 'object') return null
  const api = (typeof e.api === 'string' && e.api.length > 0) ? e.api : (typeof e.baseUrl === 'string' ? e.baseUrl : '')
  if (!/^https?:\/\//.test(api)) return null
  const providerName = (typeof e.providerName === 'string' && e.providerName.length > 0) ? e.providerName : (typeof e.name === 'string' ? e.name : '')
  let id = (typeof e.id === 'string' && /^[a-z][a-z0-9-]{1,31}$/.test(e.id)) ? e.id : ''
  if (!id) {
    const host = (/^https?:\/\/([^/]+)/.exec(api) || [])[1] || ''
    id = slugText(providerName) || slugText(host)
  }
  if (!id || !/^[a-z][a-z0-9-]{1,31}$/.test(id)) return null
  const models = []
  const raw = Array.isArray(e.models) ? e.models : []
  for (const m of raw) {
    if (m && typeof m.id === 'string' && m.id.length > 0) {
      models.push({ id: m.id, name: (typeof m.name === 'string' && m.name.length > 0) ? m.name : m.id, contextWindow: Number(m.contextWindow) > 0 ? Number(m.contextWindow) : 32768 })
    }
  }
  models.sort(function (a, b) { return b.contextWindow - a.contextWindow })
  const capped = models.slice(0, 24)
  return {
    id: id,
    name: providerName || id,
    baseUrl: api.trim().replace(/\/+$/, ''),
    keyRef: (typeof e.keyRef === 'string' && e.keyRef.length > 0) ? e.keyRef : ('FREEROUTE_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_KEY'),
    noAuth: e.noAuth === true,
    proxy: firstNonEmptyStr(e.proxy),
    freeModels: pickModelIds(e.freeModels),
    // 字段别名全英文：getkey/signup 均指申请 Key 的页面；教程字段以 tutorial
    // 为准（旧目录的中文字段名继续兼容，仅不再对外展示）。
    signupUrl: firstNonEmptyStr(e.getkey, e.signup, e.signupUrl),
    tutorialUrl: firstNonEmptyStr(e.tutorial, e['教程'], e.tutorialUrl),
    apikeys: pickApiKeys(e.apikey),
    note: (typeof e.note === 'string' && e.note.length > 0) ? e.note : '来自远程目录',
    defaultModel: (typeof e.defaultModel === 'string' && e.defaultModel.length > 0) ? e.defaultModel : (capped.length > 0 ? capped[0].id : ''),
    models: capped
  }
}

function parseModelsDev(d) {
  const provs = (d && d.providers) || {}
  const entries = []
  for (const pair of Object.entries(provs)) {
    const pid = pair[0]
    const p = pair[1]
    if (!p || typeof p !== 'object') continue
    if (p.api && p.api !== 'openai') continue
    const base = (typeof p.base_url === 'string' && p.base_url.length > 0) ? p.base_url : KNOWN_BASE[pid]
    if (!base) continue
    const free = []
    const models = (p.models && typeof p.models === 'object') ? p.models : {}
    for (const mp of Object.entries(models)) {
      const mid = mp[0]
      const m = mp[1]
      const c = (m && m.cost) || {}
      if (Number(c.input) === 0 && Number(c.output) === 0) {
        const ctx = (m && m.limit && Number(m.limit.context) > 0) ? Number(m.limit.context) : 32768
        free.push({ id: mid, name: (m && typeof m.name === 'string' && m.name.length > 0) ? m.name : mid, contextWindow: ctx })
      }
    }
    if (free.length === 0) continue
    free.sort(function (a, b) { return b.contextWindow - a.contextWindow })
    const capped = free.slice(0, 12)
    entries.push({
      id: pid,
      name: (typeof p.name === 'string' && p.name.length > 0) ? p.name : pid,
      baseUrl: String(base).replace(/\/+$/, ''),
      keyRef: 'FREEROUTE_' + pid.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_KEY',
      freeModels: capped.map(function (m) { return m.id }),
      signupUrl: '',
      note: '远程目录（models.dev 格式）· ' + free.length + ' 个免费模型',
      defaultModel: capped[0].id,
      models: capped
    })
    if (entries.length >= 64) break
  }
  return entries
}

function parseCatalog(text) {
  let data
  try { data = JSON.parse(text) } catch (e) { throw mkFail('目录 JSON 解析失败: ' + emsg(e), 'INVALID_CATALOG') }
  if (Array.isArray(data)) {
    const entries = []
    for (const e of data) {
      const n = normalizeCatalogEntry(e)
      if (n) entries.push(n)
      if (entries.length >= 64) break
    }
    return { entries: entries, format: 'native' }
  }
  if (data && typeof data === 'object' && Array.isArray(data.upstreams)) {
    const entries = []
    for (const e of data.upstreams) {
      const n = normalizeCatalogEntry(e)
      if (n) entries.push(n)
      if (entries.length >= 64) break
    }
    return { entries: entries, format: 'native' }
  }
  if (data && typeof data === 'object' && data.providers && typeof data.providers === 'object') {
    return { entries: parseModelsDev(data), format: 'models.dev' }
  }
  throw mkFail('无法识别的目录格式（支持 native {upstreams:[…]} 或 models.dev {providers:{…}}）', 'INVALID_CATALOG')
}

// settings/credentials/subprocess 是核心依赖：必须进 inject，否则本插件先于
// 它们启动时 ctx.get 会永久快照成 undefined（实测 persistence:false、无外部端点）。
