const VERSION = '0.8.2'
const ROUTE = 'freeroute'
const NS = 'free-proxy'
const UA = 'deepseek-harness/0.1.0-rc.6 (+https://github.com/deepseek-ai/deepseek-harness)'
const TRAILER = '\n__FREEROUTE_HTTP_%{http_code}__'

// 内置三上游：目录默认收录各家免费模型；配好 Key 后插件还会探测
// GET <baseUrl>/models 合并出完整可用模型列表（见 probeModels）。
const BUILTIN_UPSTREAMS = [
  {
    id: 'opencode', name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1', keyRef: 'FREEROUTE_OPENCODE_API_KEY',
    signupUrl: 'https://opencode.ai/zen',
    note: '模型列表公开可探测（无需 Key）；“-free”后缀模型免费。',
    // 默认序为 2026-08-25 实测稳定性排序：x-preview-f-free / hy3-free 多轮
    // 全程稳定；mimo-v2.5-free 快但免费额度易打满（FreeUsageLimit）；
    // nemotron 系间歇 503/400；deepseek-v4-flash-free / laguna-s-2.1-free 当时
    // 上游不可用；muse-spark 有地区限制（403）。探测（目录即真相）+ 模型级
    // 失败转移会自动绕开瞬时不可用，这里只影响首选拍序。
    defaultModel: 'x-preview-f-free',
    models: [
      { id: 'x-preview-f-free', name: 'X Preview (free)', contextWindow: 131072 },
      { id: 'hy3-free', name: 'Hunyuan 3 (free)', contextWindow: 131072 },
      { id: 'mimo-v2.5-free', name: 'MiMo v2.5 (free)', contextWindow: 131072 },
      { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning (free)', contextWindow: 131072 },
      { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (free)', contextWindow: 131072 },
      { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (free)', contextWindow: 131072 },
      { id: 'laguna-s-2.1-free', name: 'Laguna S 2.1 (free)', contextWindow: 131072 },
      { id: 'muse-spark-1.2-contributor-free', name: 'Muse Spark 1.2 Contributor (free)', contextWindow: 131072 }
    ]
  },
  {
    id: 'b-ai', name: 'B.AI',
    baseUrl: 'https://api.b.ai/v1', keyRef: 'FREEROUTE_BAI_API_KEY',
    signupUrl: 'https://chat.b.ai/chat?invite_code=2PLTB4',
    note: '注册送额度，4 个免费模型无需充值；大陆网络通常需 HTTP 代理（上游可配 proxy 字段）。',
    defaultModel: 'deepseek-v4-flash',
    // 这批模型名不含 “free”，用 freeModels 显式声明（服务端目录可随时改）
    freeModels: ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'hy3', 'mimo-v2.5'],
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 131072 },
      { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', contextWindow: 131072 },
      { id: 'hy3', name: 'Hunyuan 3', contextWindow: 131072 },
      { id: 'mimo-v2.5', name: 'MiMo v2.5', contextWindow: 131072 }
    ]
  },
  {
    id: 'openrouter', name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1', keyRef: 'FREEROUTE_OPENROUTER_API_KEY',
    signupUrl: 'https://openrouter.ai/settings/keys',
    note: '聚合网关，“:free”后缀模型免费；未充值账户约 50 次/天。',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    models: [
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', contextWindow: 163840 },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (free)', contextWindow: 163840 },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', contextWindow: 131072 },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (free)', contextWindow: 1048576 },
      { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen2.5 72B (free)', contextWindow: 32768 }
    ]
  },
  {
    id: 'sensenova', name: 'SenseNova 商汤日日新',
    baseUrl: 'https://token.sensenova.cn/v1', keyRef: 'FREEROUTE_SENSENOVA_API_KEY',
    signupUrl: 'https://console.sensenova.cn',
    note: 'OpenAI 兼容端点（token.sensenova.cn）。6.7/6.8-flash-lite 与 deepseek-v4-flash 实测免费；目录中的 u1 系列实际 404。',
    defaultModel: 'sensenova-6.8-flash-lite',
    freeModels: ['sensenova-6.8-flash-lite', 'sensenova-6.7-flash-lite', 'deepseek-v4-flash'],
    models: [
      { id: 'sensenova-6.8-flash-lite', name: 'SenseNova 6.8 Flash Lite', contextWindow: 262144 },
      { id: 'sensenova-6.7-flash-lite', name: 'SenseNova 6.7 Flash Lite', contextWindow: 262144 },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 1048576 }
    ]
  }
]

const TUTORIALS = {
  opencode: ['打开 opencode.ai/zen 注册/登录（支持 GitHub 登录）', '在 Zen 页面生成 API Key', '复制密钥粘贴到上方输入框保存', '带 -free 后缀的模型免费；其余为探测到的付费可用模型'],
  openrouter: ['打开 openrouter.ai 注册/登录（支持 GitHub 登录）', '进入 Settings → Keys，点 Create Key', '复制密钥（sk-or-v1-…）粘贴到上方输入框保存', '选 id 带 :free 的模型即免费；未充值约 50 次/天，用完自动切其他上游'],
  'b-ai': ['打开 chat.b.ai 注册/登录（点面板上的邀请链接注册，双方各得额度）', '在个人设置 / API 页面生成 API Key', '复制密钥粘贴到上方输入框保存', 'deepseek-v4-flash / hy3 / mimo-v2.5 等 4 个模型免费可用；大陆网络通常需在配置里给该上游设 proxy'],
  sensenova: ['打开 console.sensenova.cn 注册（商汤日日新）', '进入 API Key 管理创建密钥', '复制密钥粘贴到上方输入框保存', 'sensenova-6.8/6.7-flash-lite 与 deepseek-v4-flash 实测免费；glm-5.2 需工作区配额，u1 系列不可用']
}

const KNOWN_BASE = {
  opencode: 'https://opencode.ai/zen/v1',
  sensenova: 'https://api.sensenova.cn/compatible-mode/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
  siliconflow: 'https://api.siliconflow.cn/v1',
  modelscope: 'https://api-inference.modelscope.cn/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  novita: 'https://api.novita.ai/v3/openai',
  deepinfra: 'https://api.deepinfra.com/v1/openai'
}

function emsg(e) { return String((e && e.message) || e) }

function mkFail(message, code, status) {
  const err = new Error(message)
  err.code = code
  err.failure = status === undefined ? { message: message, code: code } : { message: message, code: code, status: status }
  if (status !== undefined) err.status = status
  return err
}

function sanitizeConfig(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  const out = { order: [], upstreams: {} }
  if (Array.isArray(src.order)) out.order = src.order.filter(function (x) { return typeof x === 'string' })
  // 全局代理（默认不开启）：作用于所有未单独配置代理的上游（对话 + 模型探测）。
  // 空串/非法值被丢弃 = 关闭；上游 custom.proxy 与目录 proxy 优先于全局。
  if (typeof src.proxy === 'string' && /^https?:\/\//.test(src.proxy)) out.proxy = src.proxy.trim()
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
  // 非标网关字段：chatPath 覆盖 /chat/completions；requestExtra 附加标量体字段
  const ex = {}
  if (e.requestExtra && typeof e.requestExtra === 'object' && !Array.isArray(e.requestExtra)) {
    for (const p of Object.entries(e.requestExtra)) {
      if (/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(p[0]) && (p[1] === null || typeof p[1] === 'string' || typeof p[1] === 'number' || typeof p[1] === 'boolean')) ex[p[0]] = p[1]
    }
  }
  return {
    id: id,
    name: providerName || id,
    baseUrl: api.trim().replace(/\/+$/, ''),
    keyRef: (typeof e.keyRef === 'string' && e.keyRef.length > 0) ? e.keyRef : ('FREEROUTE_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_KEY'),
    noAuth: e.noAuth === true,
    proxy: firstNonEmptyStr(e.proxy),
    chatPath: (typeof e.chatPath === 'string' && /^\/[\w\-./]*$/.test(e.chatPath)) ? e.chatPath : '',
    requestExtra: Object.keys(ex).length > 0 ? ex : undefined,
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
return {
  inject: ['llm', 'timer', 'settings', 'credentials', 'subprocess'],
  apply(ctx) {
    const llm = ctx.llm
    const timer = ctx.timer
    const settings = ctx.get('settings')
    const credentials = ctx.get('credentials')
    const subprocess = ctx.get('subprocess')
    // webServer/commands 可能晚于本插件启动（也可能在无 Web 的 profile 中始终缺席）：
    // 用 let + ensureHostBindings() 晚到自愈（先重读引用，再补挂一次性副作用）。
    let webServer = ctx.get('webServer')
    let commands = ctx.get('commands')

    // 内置默认远程目录源（主源）：用户未显式配置 catalog.remoteUrl 时回退到此源，
    // 让全新安装自动拉取免费模型目录（Cloudflare 新账号自定义域名）。
    const DEFAULT_CATALOG_URL = 'https://config.freetokenbox.com/freeroute.json'
    // 内置兜底备份源：主源不可达/不安全时自动回退（Cloudflare Pages 默认子域，
    // 不依赖自定义域名解析，仅作容灾，内容同主源）。
    const BACKUP_CATALOG_URL = 'https://freeroute-catalog.pages.dev/freeroute.json'

    let userConfig = { order: [], upstreams: {} }
    let takeoverDone = false
    let takeoverPrev = null // 自动接管前的原默认选择（关闭开关时恢复）
    const stats = new Map()
    const health = new Map()
    const remoteUpstreams = new Map()
    const catalogMeta = { lastSyncAt: null, lastError: '', lastCount: 0, lastFormat: null, lastSyncUrl: '', lastUsedFallback: false }
    let curlCache = null

    // ---- 配置持久化：独立 JSON 文件优先（迁移/替换只需拷一个文件），settings 兜底 ----
    // 静态构建在 apply 头部注入 __nodeFs/__nodeOs；动态沙箱无 fs 时退回 settings
    // 服务（行为同旧版）。JSON 模式：读走启动 + buildState 的 mtime 廉价检查
    // （外部替换文件 ≤5s 热生效），写走 tmp+rename 原子替换。可选 "keys" 字段
    // 仅作一次性导入：只在凭据未配置时写入 credentials，永不回写文件。
    const fsx = (typeof __nodeFs === 'object' && __nodeFs !== null) ? __nodeFs : null
    const osx = (typeof __nodeOs === 'object' && __nodeOs !== null) ? __nodeOs : null
    let configFileOk = false
    let configPath = ''
    let configMtimeMs = 0

// freeroute 本地日志：把运行时日志写到 $DSH_HOME/freeroute.log，
// 不再打印到控制台（避免污染 dsh 宿主进程输出）。
// 动态构建不注入 __nodeFs/__nodeOs，需用 typeof 守卫并优雅降级。
// 由 build-static.mjs 注入的 fs/os 导入在静态构建中天然可用。
// 仅依赖 build-static.mjs 白名单内的 mkdirSync/readFileSync/renameSync/
// statSync/writeFileSync，不使用 openSync/writeSync/closeSync。
// 本片段不走 module.exports：动态构建把所有 HOST_BODY 片段拼接进同一个
// apply() 函数作用域，直接把 log 声明为本作用域函数，供 router.js 等片段调用。

const LOG_DIR = 'freeroute'
const LOG_NAME = 'freeroute.log'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

let __logPath = null

function __freerouteFs () {
  return (typeof __nodeFs === 'object' && __nodeFs !== null) ? __nodeFs : null
}
function __freerouteOs () {
  return (typeof __nodeOs === 'object' && __nodeOs !== null) ? __nodeOs : null
}

function __freerouteResolveLogPath () {
  if (__logPath) return __logPath
  const fs = __freerouteFs()
  const os = __freerouteOs()
  if (!fs || !os) return null
  let base
  if (typeof process === 'object' && process !== null && typeof process.env === 'object') {
    base = process.env.DSH_HOME
  }
  if (!base) {
    try { base = os.homedir() } catch (e) { /* ignore */ }
  }
  if (!base) return null
  __logPath = base + '/.dsh/' + LOG_DIR + '/' + LOG_NAME
  return __logPath
}

function __freerouteRotateIfNeeded () {
  const fs = __freerouteFs()
  const path = __freerouteResolveLogPath()
  if (!fs || !path) return
  try {
    const st = fs.statSync(path)
    let rotated = false
    if (st.size > MAX_BYTES) rotated = true
    else {
      const age = Date.now() - (st.mtime && st.mtime.getTime ? st.mtime.getTime() : 0)
      if (age > MAX_AGE_MS) rotated = true
    }
    if (rotated) {
      try { fs.renameSync(path, path + '.1') } catch (e) { /* ignore */ }
    }
  } catch (e) { /* 文件不存在视为无需轮转 */ }
}

function log (message) {
  const fs = __freerouteFs()
  const path = __freerouteResolveLogPath()
  if (!fs || !path) return
  try {
    __freerouteRotateIfNeeded()
    const dir = path.slice(0, path.lastIndexOf('/'))
    try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { /* ignore */ }
    const line = new Date().toISOString() + ' ' + message + '\n'
    fs.writeFileSync(path, line, { flag: 'a' })
  } catch (e) { /* ignore */ }
}    function resolveConfigPath() {
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
        if (userConfig.proxy !== undefined) payload.proxy = userConfig.proxy
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
      // 全局代理兜底：上游未单独配置代理时回落到全局设置（默认无 = 直连）。
      // 优先级：custom.proxy > 目录声明的 proxy > 全局 proxy。
      if (userConfig.proxy) {
        for (const up of Array.from(map.values())) {
          if (!up.proxy) up.proxy = String(userConfig.proxy)
        }
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

    // ---- 多 Key 轮换 ----
    // 免费额度按账号计：同厂商多账号多把 Key 是常态。约定扩展引用
    // FREEROUTE_X_API_KEY / _2 / _3…（至多 8 把）：鉴权或限流失败换下一把
    // （Key 级冷却），全部失败才把失败上报给上游级熔断。
    const keyHealth = new Map() // ref -> cooldownUntil（Key 级冷却）
    const keyCursor = new Map() // upstreamId -> 轮转起始下标（成功后推进，均匀分摊配额）
    const keyFailNotes = new Map() // upstreamId -> 最近 Key 级失败 [{index, code, at}]（面板「第几把失效」提示）

    // 用户配置的第几把：ref 无 _N 后缀为第 1 把，_2/_3… 依此类推
    function keyNumber(ref) {
      const m = /_(\d+)$/.exec(ref || '')
      return m ? parseInt(m[1], 10) : 1
    }
    function noteKeyFail(id, index, code) {
      let arr = keyFailNotes.get(id)
      if (!arr) { arr = []; keyFailNotes.set(id, arr) }
      arr.unshift({ index: index, code: code, at: Date.now() })
      if (arr.length > 3) arr.length = 3
    }

    function keyRefsFor(up) {
      const refs = [up.keyRef]
      for (let i = 2; i <= 8; i++) refs.push(up.keyRef + '_' + i)
      return refs
    }

    async function keyRing(up) {
      if (up.noAuth) return [{ ref: null, key: '' }]
      if (credentials === undefined) return []
      const ring = []
      for (const ref of keyRefsFor(up)) {
        try {
          const hit = await credentials.resolve(ref)
          if (hit && typeof hit.value === 'string' && hit.value.trim().length > 0) ring.push({ ref: ref, key: hit.value.trim() })
        } catch (e) { }
      }
      return ring
    }

    function orderKeys(up, ring) {
      if (ring.length <= 1) return ring.slice()
      const start = ((keyCursor.get(up.id) || 0) % ring.length + ring.length) % ring.length
      const now = Date.now()
      const ordered = []
      for (let i = 0; i < ring.length; i++) {
        const ke = ring[(start + i) % ring.length]
        if ((keyHealth.get(ke.ref) || 0) <= now) ordered.push(ke)
      }
      if (ordered.length === 0) {
        // 全部在冷却：按轮转序全量使用（总比直接判死刑好）
        for (let i = 0; i < ring.length; i++) ordered.push(ring[(start + i) % ring.length])
      }
      return ordered
    }

    function coolKey(ref, err) {
      if (!ref) return
      const code = String((err && err.code) || '')
      const ms = code === 'AUTH' ? 1800000 : ((err && err.providerRetryAfterMs) || 300000)
      keyHealth.set(ref, Date.now() + ms)
    }

    async function maybeKey(up) {
      const ring = await keyRing(up)
      return ring.length > 0 ? ring[0].key : ''
    }

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

    async function ensureCurl() {
      if (curlCache) return curlCache
      if (subprocess === undefined) throw mkFail('subprocess 服务不可用，无法发起请求', 'CONFIG')
      try { curlCache = await subprocess.resolveExecutable('curl') } catch (e) { throw mkFail('找不到 curl：' + emsg(e), 'CONFIG') }
      return curlCache
    }

    function flattenText(blocks) {
      let out = ''
      for (const b of blocks || []) if (b && b.type === 'text' && typeof b.text === 'string') out += b.text
      return out
    }

    function contentBlocks(content) {
      // dsh 契约是块数组（content:[{type:'text',text:…}]）；防御性兼容
      // 裸字符串（OpenAI 原生形态），避免被展平成空串后「空消息」发往上游。
      if (typeof content === 'string') return content.length > 0 ? [{ type: 'text', text: content }] : []
      return Array.isArray(content) ? content : []
    }

    function serializeMessages(messages) {
      const wire = []
      for (const m of messages || []) {
        const blocks = contentBlocks(m.content)
        for (const b of blocks) { if (b && b.type === 'image') throw mkFail('FreeRoute 免费路由暂不支持图片内容', 'UNSUPPORTED_CONTENT') }
        if (m.role === 'system') { wire.push({ role: 'system', content: flattenText(blocks) }); continue }
        if (m.role === 'assistant') {
          const toolCalls = []
          for (const b of blocks) {
            if (b && b.type === 'tool-call') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: b.arguments } })
          }
          const msg = { role: 'assistant', content: flattenText(blocks) }
          if (toolCalls.length > 0) msg.tool_calls = toolCalls
          wire.push(msg)
          continue
        }
        const toolResults = []
        for (const b of blocks) { if (b && b.type === 'tool-result') toolResults.push(b) }
        const text = flattenText(blocks)
        if (text.length > 0 || toolResults.length === 0) wire.push({ role: 'user', content: text })
        for (const r of toolResults) wire.push({ role: 'tool', tool_call_id: r.toolCallId, content: flattenText(r.content) || '(no output)' })
      }
      return wire
    }

    function serializeRequest(options, model) {
      const messages = []
      if (options.system !== undefined && options.system !== null) messages.push({ role: 'system', content: String(options.system) })
      for (const w of serializeMessages(options.messages)) messages.push(w)
      const req = { model: model, messages: messages, stream: true, stream_options: { include_usage: true } }
      if (options.tools && options.tools.length > 0) {
        req.tools = options.tools.map(function (t) { return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } } })
      }
      if (options.temperature !== undefined) req.temperature = options.temperature
      if (options.maxTokens !== undefined) req.max_tokens = options.maxTokens
      if (options.stop !== undefined) req.stop = options.stop
      return req
    }

    function mapFinishReason(reason) {
      if (reason === 'stop') return { kind: 'stop' }
      if (reason === 'tool_calls' || reason === 'function_call') return { kind: 'tool-calls' }
      if (reason === 'length' || reason === 'max_tokens') return { kind: 'max-tokens' }
      return { kind: 'error', failure: { message: '模型停止: ' + reason, code: String(reason).toUpperCase() } }
    }
    function mapUsage(u) {
      let input = Number(u.prompt_tokens) || 0
      const output = Number(u.completion_tokens) || 0
      const cached = (u.prompt_tokens_details && Number(u.prompt_tokens_details.cached_tokens)) || 0
      if (cached > 0) input -= cached
      const out = { inputTokens: input, outputTokens: output }
      if (cached > 0) out.cacheReadTokens = cached
      return out
    }
    function wireError(e) {
      const msg = String((e && (e.message || e.type)) || '上游错误')
      const blob = (msg + ' ' + String((e && e.code) || '') + ' ' + String((e && e.type) || '')).toLowerCase()
      let code = 'SERVER'
      if (/rate|429|quota|配额|credit/i.test(blob)) code = 'RATE_LIMIT'
      else if (/auth|401|403|api key|apikey|unauthorized/.test(blob)) code = 'AUTH'
      else if (/context|token limit|too long/.test(blob)) code = 'CONTEXT_WINDOW_EXCEEDED'
      return mkFail(msg, code)
    }

    function createTranslator() {
      let nextIndex = 0
      let textBlock = null
      let reasoningBlock = null
      const toolBlocks = new Map()
      const order = []
      let pendingFinish = null
      let usageSeen = null
      let doneSeen = false
      let buf = ''
      let sawSse = false
      let httpStatus = 0
      let plain = ''
      const dec = new TextDecoder()
      function open(kind) {
        const b = { index: nextIndex++, kind: kind, text: '', callId: null, name: null }
        order.push(b)
        return b
      }
      function closeBlock(b) {
        if (b.kind === 'text') return { type: 'text', text: b.text }
        if (b.kind === 'reasoning') return { type: 'reasoning', text: b.text }
        return { type: 'tool-call', id: b.callId || ('call_' + b.index), name: b.name || '', arguments: b.text }
      }
      function finalize() {
        const out = []
        for (const b of order) out.push({ type: 'block-end', index: b.index, block: closeBlock(b) })
        if (usageSeen) out.push({ type: 'usage', usage: usageSeen })
        let reason = pendingFinish || { kind: 'stop' }
        if (reason.kind === 'stop' && order.length === 0) reason = { kind: 'error', failure: { message: '上游返回了空响应', code: 'EMPTY_RESPONSE' } }
        out.push({ type: 'finish', reason: reason })
        return out
      }
      function handlePayload(payload, out) {
        if (payload === '[DONE]') {
          doneSeen = true
          for (const c of finalize()) out.push(c)
          return
        }
        let chunk
        try { chunk = JSON.parse(payload) } catch (e) { throw mkFail('无法解析上游 SSE 数据: ' + payload.slice(0, 120), 'MALFORMED_RESPONSE') }
        if (chunk.error) throw wireError(chunk.error)
        const choice = (chunk.choices && chunk.choices[0]) || {}
        const delta = choice.delta || {}
        const reasoning = delta.reasoning_content !== undefined ? delta.reasoning_content : delta.reasoning
        if (typeof reasoning === 'string' && reasoning.length > 0) {
          if (!reasoningBlock) { reasoningBlock = open('reasoning'); out.push({ type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' }) }
          reasoningBlock.text += reasoning
          out.push({ type: 'reasoning-delta', index: reasoningBlock.index, text: reasoning })
        }
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          if (!textBlock) { textBlock = open('text'); out.push({ type: 'block-start', index: textBlock.index, blockType: 'text' }) }
          textBlock.text += delta.content
          out.push({ type: 'text-delta', index: textBlock.index, text: delta.content })
        }
        const calls = delta.tool_calls
        if (Array.isArray(calls)) {
          for (let i = 0; i < calls.length; i++) {
            const call = calls[i]
            const key = typeof call.index === 'number' ? String(call.index) : 'solo'
            let block = toolBlocks.get(key)
            if (!block) {
              block = open('tool-call')
              toolBlocks.set(key, block)
              out.push({ type: 'block-start', index: block.index, blockType: 'tool-call' })
            }
            if (call.id) block.callId = call.id
            if (call.function && typeof call.function.name === 'string' && call.function.name.length > 0) block.name = call.function.name
            const frag = (call.function && typeof call.function.arguments === 'string') ? call.function.arguments : ''
            block.text += frag
            const ev = { type: 'tool-call-delta', index: block.index, id: block.callId || ('call_' + block.index), argumentsDelta: frag }
            if (block.name) ev.name = block.name
            out.push(ev)
          }
        }
        if (typeof choice.finish_reason === 'string') pendingFinish = mapFinishReason(choice.finish_reason)
        if (chunk.usage) usageSeen = mapUsage(chunk.usage)
      }
      function handleLine(line, out) {
        if (line.length === 0) return
        if (line.charAt(0) === ':') { sawSse = true; return }
        const sm = /^__FREEROUTE_HTTP_(\d{3})__$/.exec(line)
        if (sm) { httpStatus = Number(sm[1]); return }
        if (line.lastIndexOf('data:', 0) === 0) {
          sawSse = true
          const payload = line.slice(5).trim()
          if (payload.length === 0) return
          handlePayload(payload, out)
          return
        }
        if (plain.length < 4096) plain += line + '\n'
      }
      function drain(final) {
        const out = []
        let idx = buf.indexOf('\n')
        while (idx >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '')
          buf = buf.slice(idx + 1)
          handleLine(line, out)
          idx = buf.indexOf('\n')
        }
        if (final && buf.length > 0) { handleLine(buf.replace(/\r$/, ''), out); buf = '' }
        return out
      }
      function plainTail() { return plain.trim().replace(/\s+/g, ' ').slice(0, 160) }
      function classifyPrematureEnd() {
        // 流未以 [DONE] 结束。若全程没有出现 SSE 行，多半是上游直接回了
        // 非 SSE 的 JSON 错误（或代理错误页）：按 HTTP 状态码与错误体分类，
        // 让 AUTH / RATE_LIMIT / SERVER 熔断能正确触发。
        if (!sawSse) {
          if (httpStatus === 401 || httpStatus === 403) throw mkFail('上游鉴权失败 (HTTP ' + httpStatus + ')' + (plainTail() ? '：' + plainTail() : '') + (httpStatus === 403 ? '（403 常见原因：Key 有效但账户未开通该模型 / 未完成实名，或免费额度不覆盖此模型）' : ''), 'AUTH')
          if (httpStatus === 429 || httpStatus === 402) throw mkFail('上游限流/额度 (HTTP ' + httpStatus + ')' + (plainTail() ? '：' + plainTail() : ''), 'RATE_LIMIT')
          if (httpStatus >= 400) throw mkFail('上游错误 (HTTP ' + httpStatus + ')' + (plainTail() ? '：' + plainTail() : ''), 'SERVER')
          const t = plain.trim()
          if (t.length > 0) {
            try {
              const o = JSON.parse(t)
              if (o && o.error) throw wireError(o.error)
            } catch (e) {
              if (e instanceof Error && e.code) throw e
            }
          }
        }
        throw mkFail('上游流在结束前中断' + (sawSse ? '' : ('：' + plainTail())), 'STREAM_CLOSED')
      }
      return {
        get done() { return doneSeen },
        get usage() { return usageSeen },
        feed: function (bytes) { buf += dec.decode(bytes, { stream: true }); return drain(false) },
        flush: function () { buf += dec.decode(); return drain(true) },
        finishOrThrow: function () { if (!doneSeen) classifyPrematureEnd(); return [] }
      }
    }

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
      const cands = await candidatesFor(options.model)
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
      const fb = (await candidatesFor('auto')).filter(function (c) { return !tried.has(c.upstream.id + '|' + c.model) })
      if (fb.length === 0) {
        // 原始错误比笼统的 NO_UPSTREAM 更有诊断价值
        throw primaryErr || mkFail('没有可用的免费上游：请先在 设置 → freeroute 中启用并配置至少一个 API Key', 'NO_UPSTREAM')
      }
      if (!isAuto) log('[freeroute] 模型 ' + options.model + (cands.length === 0 ? ' 无可用候选（冷却中）' : ' 的全部候选失败') + '，降级 auto 兜底（' + fb.length + ' 个候选）')
      for await (const ck of chaseChain(fb, options)) yield ck
    }

    const adapter = {
      providerInfo: function (provider) { return { id: provider, name: 'FreeRoute 免费模型' } },
      // 按 dsh 插件文档（@deepseek-ai/dsh-llm-retry）设置 per-provider 重试策略。
      // 适配器在 registerAdapter() 时通过 providerRetryPolicy(provider) 捕获一次，
      // 省略则退回 dsh-llm-retry 的 normal 默认（5 次、500ms→10s）。
      // always mode：无次数上限地重试每个模型请求失败，直到成功/取消/插件 dispose。
      providerRetryPolicy: function () {
        return {
          mode: 'always',
          backoff: { initialDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0.2 }
        }
      },
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

    async function rawGet(url, timeoutMs, headers, proxy) {
      const curl = await ensureCurl()
      return new Promise(function (resolve, reject) {
        let settled = false
        let proc = null
        const dispose = timer.timeout(function () {
          if (settled) return
          settled = true
          try { if (proc) proc.terminate() } catch (e) { }
          reject(mkFail('下载超时（' + timeoutMs + 'ms）', 'TIMEOUT'))
        }, timeoutMs)
        function finish(fn, value) {
          if (settled) return
          settled = true
          try { dispose() } catch (e) { }
          fn(value)
        }
        try {
          const argv = [curl, '-sS', '-L', '--connect-timeout', '12']
          // 代理参数必须在 URL 之前（argv 解析按顺序取最后一个 http 开头项）
          if (proxy) argv.push('--proxy', String(proxy))
          for (const pair of Object.entries(headers || {})) argv.push('-H', pair[0] + ': ' + pair[1])
          argv.push(url, '-w', TRAILER)
          proc = subprocess.spawn({ argv: argv, cwd: '/tmp', stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 2048 } }, graceMs: 3000 })
        } catch (e) {
          finish(reject, mkFail('curl 启动失败: ' + emsg(e), 'TRANSPORT'))
          return
        }
        const dec = new TextDecoder()
        let out = ''
        ;(async function () {
          try {
            for await (const b of proc.stdout) {
              out += dec.decode(b, { stream: true })
              if (out.length > 8388608) throw mkFail('目录超过 8MB 上限', 'INVALID_CATALOG')
            }
            out += dec.decode()
            let errTail = ''
            try {
              const r = proc.collected.stderr && proc.collected.stderr.readFrom(0)
              if (r) errTail = String(r.text || '').trim().slice(0, 200)
            } catch (e) { }
            let exit = null
            try { exit = await proc.done } catch (e) { exit = null }
            const m = /__FREEROUTE_HTTP_(\d{3})__/.exec(out)
            const status = m ? Number(m[1]) : 0
            const body = out.replace(/__FREEROUTE_HTTP_\d{3}__/, '').trim()
            finish(resolve, { status: status, body: body, errTail: errTail, exitCode: exit && exit.exitCode })
          } catch (e) {
            finish(reject, (e instanceof Error) ? e : mkFail(emsg(e), 'TRANSPORT'))
          }
        })()
      })
    }

    async function syncCatalog() {
      // 主源：用户显式配置的 remoteUrl，否则内置默认（config.freetokenbox.com）。
      // 仅在「使用内置默认主源」时挂备份源 freeroute-catalog.pages.dev：
      // 用户若显式配置其它源，则尊重其选择，失败时直接报错而不静默切换。
      const configured = userConfig.catalog && userConfig.catalog.remoteUrl
      const primary = configured || DEFAULT_CATALOG_URL
      const candidates = configured ? [primary] : [primary, BACKUP_CATALOG_URL]
      let lastErr = ''
      for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i]
        try {
          const r = await rawGet(url, 30000)
          if (r.status !== 0 && (r.status < 200 || r.status >= 300)) throw mkFail('目录下载失败 HTTP ' + r.status + (r.errTail ? ' · ' + r.errTail : ''), 'HTTP_' + r.status)
          const parsed = parseCatalog(r.body)
          // 增量合并（按厂商 id 逐家对比）：只更新远端有变更的条目，远端撤下的
          // 条目从远端层移除。同步永不写 userConfig —— 本地启停/隐藏/自定义
          // 上游原样保留，不会全量覆盖。
          const nextIds = new Set()
          for (const e of parsed.entries) nextIds.add(e.id)
          let added = 0
          let changed = 0
          for (const e of parsed.entries) {
            const prev = remoteUpstreams.get(e.id)
            if (prev === undefined) { remoteUpstreams.set(e.id, e); added += 1 }
            else if (JSON.stringify(prev) !== JSON.stringify(e)) { remoteUpstreams.set(e.id, e); changed += 1 }
          }
          let dropped = 0
          for (const id of Array.from(remoteUpstreams.keys())) {
            if (!nextIds.has(id)) { remoteUpstreams.delete(id); dropped += 1 }
          }
          // 目录自带 apikey 列表 -> 整环写入凭据（KEY / KEY_2 …，多余旧编号清掉）
          let imported = 0
          for (const e of parsed.entries) {
            if (!Array.isArray(e.apikeys) || e.apikeys.length === 0) continue
            try {
              const refs = keyRefsFor(e)
              for (let k = 0; k < e.apikeys.length; k++) await credentials.set(refs[k], e.apikeys[k])
              for (let k = e.apikeys.length; k < refs.length; k++) { try { await credentials.unset(refs[k]) } catch (e2) { } }
              imported += 1
            } catch (e2) { }
          }
          catalogMeta.lastSyncAt = Date.now()
          catalogMeta.lastCount = parsed.entries.length
          catalogMeta.lastFormat = parsed.format
          catalogMeta.lastError = ''
          catalogMeta.lastSyncUrl = url
          catalogMeta.lastUsedFallback = (i > 0)
          return { ok: true, count: parsed.entries.length, format: parsed.format, imported: imported, url: url, usedFallback: i > 0, added: added, changed: changed, dropped: dropped }
        } catch (e) {
          lastErr = emsg(e)
          // 还有备份源可试：记录并继续；否则在此源失败处收尾
          if (i < candidates.length - 1) {
            log('[freeroute] 主源 ' + url + ' 同步失败（' + lastErr + '），尝试备份源…')
            continue
          }
          catalogMeta.lastError = lastErr
          catalogMeta.lastSyncUrl = url
          catalogMeta.lastUsedFallback = false
          return { ok: false, error: lastErr }
        }
      }
      catalogMeta.lastError = lastErr || '未配置远程目录 URL'
      return { ok: false, error: catalogMeta.lastError }
    }

    async function anyReadyUpstream() {
      for (const u of orderedUpstreams()) {
        if (!isEnabled(u.id)) continue
        if (await hasCredential(u)) return true
      }
      return false
    }

    // ---- 就绪联动 ----
    // 任一已启用上游就绪（配好 Key 或免鉴权）即触发一次默认模型接管
    // （切到 ROUTE/auto）。设置 -> 模型 页的呈现由客户端完成：包装组件在
    // 标题/介绍之后插「默认 | 免费」页签（对齐插件设置页）；不再经
    // llm.registerConfigurableProviders 登记目录（那会在 DeepSeek 之后产生
    // 第二条行、编辑器还是死胡同）。
    //
    // v0.7.2 接管纪律（修复「安装后把用户原配置的默认模型清掉」）：
    // 1. 未经明确授权（explicit），只在用户从未显式配置过默认模型时接管
    //    ——settings 用户层没有 agent-default-model 时不打扰既有选择；
    // 2. 接管状态持久化（autoInjected + takeoverBackup 存入配置）：
    //    重启后关闭开关仍能恢复原默认；用户手动把默认改走则视为
    //    撤回授权，清除标记、之后不再自动接管；
    // 3. 显式把「自动接管」开关打开（explicit）= 明确授权覆盖当前默认，
    //    原值写入 takeoverBackup，关闭时恢复。
    const DEFAULT_MODEL_NS_NAME = 'agent-default-model'

    // settings 用户层是否已显式配置默认模型（settings.section 读原始用户层，
    // 与组合 base 默认无关：仅用户亲手写过才算「显式配置」）
    function userDefaultExplicit() {
      try {
        if (settings === undefined) return false
        const sec = settings.section(DEFAULT_MODEL_NS_NAME)
        return !!(sec && typeof sec.provider === 'string' && sec.provider.length > 0 && typeof sec.model === 'string' && sec.model.length > 0)
      } catch (e) { return false }
    }

    // 持久化接管标记与原值备份（JSON 文件模式 / settings 模式）
    function persistTakeoverState(injected, backup) {
      if (injected === true) userConfig.autoInjected = true
      else delete userConfig.autoInjected
      if (backup && typeof backup.provider === 'string' && typeof backup.model === 'string') userConfig.takeoverBackup = { provider: backup.provider, model: backup.model }
      else delete userConfig.takeoverBackup
      if (configFileOk) {
        writeConfigFile()
      } else if (settings !== undefined) {
        try {
          if (injected === true) {
            const patch = { autoInjected: true }
            if (userConfig.takeoverBackup) patch.takeoverBackup = userConfig.takeoverBackup
            settings.update(NS, patch).catch(function () { })
          } else {
            // 清除标记：unset 两个内部键（settings.update 是 merge，删不掉）
            settings.mutate(NS, [
              { op: 'unset', path: ['autoInjected'] },
              { op: 'unset', path: ['takeoverBackup'] }
            ]).catch(function () { })
          }
        } catch (e) { }
      }
    }

    // 撤销注入：清掉接管写进用户层的 provider/model（回落到组合 base 默认）。
    // 只 unset 这两个键，用户自己写过的其它键（如 reasoningEffort）不动。
    async function unsetInjectedDefault() {
      const s = settings
      if (s === undefined) return
      try {
        await s.mutate(DEFAULT_MODEL_NS_NAME, [
          { op: 'unset', path: ['provider'] },
          { op: 'unset', path: ['model'] }
        ])
      } catch (e) { }
    }

    async function checkTakeover(explicit) {
      try {
        if (userConfig.autoTakeover === false && explicit !== true) return
        // 调用时再取：该服务可能晚于本插件启动
        const defaultModelSvc = ctx.get('agentDefaultModel')
        if (defaultModelSvc === undefined) return
        const sel = defaultModelSvc.currentSelection()
        // 上次接管过（持久标记）而现在默认已改走：用户手动改回了自己的
        // 选择——尊重之，清除接管标记，此后不再自动接管（显式开关除外）
        if (userConfig.autoInjected && sel && sel.provider !== ROUTE) {
          persistTakeoverState(false, null)
          if (explicit !== true) return
        }
        if (sel && sel.provider === ROUTE) { takeoverDone = true; return }
        let ready = false
        try { ready = await anyReadyUpstream() } catch (e) { }
        if (!ready) return
        // 用户已显式配置默认模型：未经明确授权（开关显式打开）不打扰
        if (explicit !== true && userDefaultExplicit()) return
        const prev = (sel && sel.provider) ? sel : null
        await defaultModelSvc.saveSelection({ provider: ROUTE, model: 'auto' })
        takeoverDone = true
        takeoverPrev = prev
        persistTakeoverState(true, prev)
        log('[freeroute] 检测到免费上游就绪，已把默认模型切到 ' + ROUTE + '/auto' + (prev ? '（原默认 ' + prev.provider + '/' + prev.model + ' 已备份，关闭自动接管可恢复）' : '（未发现显式默认模型配置）'))
      } catch (e) { }
    }
    async function buildState() {
      ensureHostBindings()
      maybeReloadConfig()
      const list = []
      let injectedNow = false
      try {
        const dsvc = ctx.get('agentDefaultModel')
        const sel0 = dsvc ? dsvc.currentSelection() : null
        injectedNow = takeoverDone && !!sel0 && sel0.provider === ROUTE
      } catch (e) { }
      let priority = 0
      for (const u of orderedUpstreams()) {
        const h = health.get(u.id) || {}
        const s = stats.get(u.id) || {}
        const cfgEnabled = isEnabled(u.id)
        const merged = mergedModels(u)
        const probe = probeCache.get(u.id)
        let freeCount = 0
        for (const m of merged) { if (m.free) freeCount++ }
        let cred = { configured: !!u.noAuth, source: null, writable: false, keys: u.noAuth ? 1 : 0 }
        if (!u.noAuth && credentials !== undefined) {
          try {
            let keys = 0
            let first = null
            for (const ref of keyRefsFor(u)) {
              const d = await credentials.describe(ref)
              if (d && d.configured) { keys += 1; if (!first) first = d }
            }
            cred = { configured: keys > 0, source: first ? (first.source || null) : null, writable: first ? !!first.writable : false, keys: keys }
          } catch (e) { }
        }
        list.push({
          id: u.id,
          name: u.name,
          source: u.source || 'builtin',
          priority: priority++,
          note: u.note || '',
          signupUrl: u.signupUrl || '',
          tutorialUrl: u.tutorialUrl || '',
          keyRef: u.keyRef,
          noAuth: !!u.noAuth,
          defaultModel: defaultModelFor(u) || '',
          enabled: cfgEnabled,
          configured: cred.configured,
          keys: cred.keys || 0,
          credSource: cred.source,
          writable: cred.writable,
          modelsCount: merged.length,
          freeCount: freeCount,
          probedAt: (probe && probe.at) || null,
          probedError: (probe && probe.error) || '',
          tutorial: TUTORIALS[u.id] || null,
          health: {
            state: cooling(u.id) ? 'cooling' : ((h.consecutiveFailures || 0) > 0 ? 'degraded' : 'up'),
            cooldownMs: Math.max(0, (h.cooldownUntil || 0) - Date.now()),
            consecutiveFailures: h.consecutiveFailures || 0,
            lastError: h.lastError || null,
            lastErrorAt: h.lastErrorAt || null,
            keyFails: (keyFailNotes.get(u.id) || []).map(function (f) { return { index: f.index, code: f.code, at: f.at } })
          },
          stats: {
            requests: s.requests || 0, ok: s.ok || 0, failed: s.failed || 0,
            tokensIn: s.tokensIn || 0, tokensOut: s.tokensOut || 0,
            lastLatencyMs: s.lastLatencyMs || null, lastUsedAt: s.lastUsedAt || null
          }
        })
      }
      // 面板与选择器同源：通用模型名 + via 平台表（哪家上游提供哪个真实模型）。
      // 与 listModels 相同的「免费且可用」过滤：未就绪上游的模型不展示。
      const readySet = await readyUpstreamIdSet()
      const models = [{ id: 'auto', name: 'Auto（自动切换）', contextWindow: null, upstream: '_', via: [] }]
      for (const entry of buildAliasIndex().values()) {
        if (entry.free !== true) continue
        const viaReady = entry.via.filter(function (v) { return readySet.has(v.upstream) })
        if (viaReady.length === 0) continue
        models.push({ id: entry.id, name: entry.name || entry.id, contextWindow: entry.contextWindow, upstream: viaReady[0].upstream, free: true, via: viaReady })
      }
      let current = null
      const defaultModelSvc = ctx.get('agentDefaultModel')
      if (defaultModelSvc !== undefined) {
        try {
          const sel = defaultModelSvc.currentSelection()
          if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') current = { provider: sel.provider, model: sel.model }
        } catch (e) { }
      }
      let requests = 0, ok = 0, failed = 0, tokensIn = 0, tokensOut = 0
      for (const s of stats.values()) { requests += s.requests; ok += s.ok; failed += s.failed; tokensIn += s.tokensIn; tokensOut += s.tokensOut }
      // 本地隐藏的上游（removed 标记）：名字从原始来源（内置/远程/自定义）取，
      // 供面板「已隐藏 N 家 · 恢复」入口使用。
      const hidden = []
      {
        const uc = userConfig.upstreams || {}
        const nameOf = function (id) {
          for (const b of BUILTIN_UPSTREAMS) { if (b.id === id) return b.name }
          const r = remoteUpstreams.get(id)
          if (r) return r.name || id
          const c = uc[id] && uc[id].custom
          return (c && c.name) || id
        }
        for (const pair of Object.entries(uc)) {
          if (pair[1] && pair[1].removed) hidden.push({ id: pair[0], name: nameOf(pair[0]) })
        }
      }
      return {
        version: VERSION,
        route: ROUTE,
        configPath: configFileOk ? configPath : '',
        settingsNs: NS,
        persistence: settings !== undefined,
        autoTakeover: userConfig.autoTakeover !== false,
        autoInjected: injectedNow,
        globalProxy: userConfig.proxy || '',
        catalog: {
          remoteUrl: (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL,
          autoRefreshMs: (userConfig.catalog && userConfig.catalog.autoRefreshMs) || 1800000,
          lastSyncAt: catalogMeta.lastSyncAt,
          lastSyncError: catalogMeta.lastError || null,
          lastCount: catalogMeta.lastCount,
          lastFormat: catalogMeta.lastFormat,
          lastSyncUrl: catalogMeta.lastSyncUrl || null,
          lastUsedFallback: catalogMeta.lastUsedFallback
        },
        currentSelection: current,
        totals: { requests: requests, ok: ok, failed: failed, tokensIn: tokensIn, tokensOut: tokensOut },
        upstreams: list,
        hiddenUpstreams: hidden,
        models: models,
        endpoint: webServer !== undefined ? { base: 'http://127.0.0.1:' + webServer.port + '/freeroute/v1' } : null
      }
    }

    function requireSettings() {
      if (settings === undefined) throw mkFail('settings 服务不可用，配置无法持久化', 'CONFIG')
      return settings
    }

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
        if (k !== 'order' && k !== 'upstreams' && k !== 'catalog' && k !== 'autoTakeover' && k !== 'proxy') return '不允许的字段: ' + k
      }
      // 全局代理：空串 = 清除（sanitize 会丢弃）；非空需 http(s):// 开头
      if (p.proxy !== undefined) {
        if (typeof p.proxy !== 'string' || p.proxy.length > 512) return 'proxy 需为字符串（≤512 字符）'
        if (p.proxy.length > 0 && !/^https?:\/\//.test(p.proxy)) return 'proxy 无效（需 http(s):// 开头，留空清除）'
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
              if (['baseUrl', 'keyRef', 'noAuth', 'name', 'note', 'signupUrl', 'defaultModel', 'models', 'proxy', 'freeModels', 'chatPath', 'requestExtra'].indexOf(ck) < 0) return '不允许的字段: custom.' + ck
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
          // 关闭自动接管：撤销本次接管，恢复用户原默认模型选择。
          // 当前默认仍是本路由（接管在生效）才动它：用户已手动改走时
          // 只清标记，不再覆盖用户的最新选择。
          try {
            const defaultModelSvc = ctx.get('agentDefaultModel')
            const sel = defaultModelSvc ? defaultModelSvc.currentSelection() : null
            if (sel && sel.provider === ROUTE) {
              const backup = (userConfig.takeoverBackup && typeof userConfig.takeoverBackup.provider === 'string') ? userConfig.takeoverBackup : takeoverPrev
              if (defaultModelSvc !== undefined && backup) await defaultModelSvc.saveSelection(backup)
              else await unsetInjectedDefault()
            }
            takeoverDone = false
            takeoverPrev = null
            persistTakeoverState(false, null)
          } catch (e) { }
        } else if (p && p.autoTakeover === true) {
          // 显式打开开关 = 明确授权接管（可覆盖已有默认，原值已备份）
          checkTakeover(true).catch(function () { })
        } else if (configFileOk) {
          // settings 模式由 scope.watch 联动；JSON 模式显式触发
          checkTakeover().catch(function () { })
        }
        return { ok: true }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }
    // 删除上游。自定义上游 = 真删除（配置项整个移除）；
    // 内置/远程上游 = removed 标记（记住删除：远程同步不复活，可随时恢复）；
    // 任何来源都不存在的 id 一律报错（包括已删掉的自定义上游二次删除）。
    rpc['freeroute.remove-upstream'] = async function (args) {
      try {
        const id = args && args.id
        if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(id)) return { ok: false, error: 'id 无效' }
        const cur = (userConfig.upstreams && userConfig.upstreams[id]) || {}
        const isCustom = !!cur.custom
        if (!isCustom) {
          const known = BUILTIN_UPSTREAMS.some(function (b) { return b.id === id }) || remoteUpstreams.has(id)
          if (!known) return { ok: false, error: '未找到上游: ' + id }
        }
        const entry = { removed: true, enabled: cur.enabled }
        if (configFileOk) {
          const next = JSON.parse(JSON.stringify(userConfig))
          if (isCustom) {
            if (!(userConfig.upstreams && (id in userConfig.upstreams))) return { ok: false, error: '未找到上游: ' + id }
            delete next.upstreams[id]
          } else {
            if (!next.upstreams) next.upstreams = {}
            next.upstreams[id] = entry
          }
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
        if (!user.upstreams) user.upstreams = {}
        if (isCustom) {
          if (!(id in user.upstreams)) return { ok: false, error: '未找到上游: ' + id }
          delete user.upstreams[id]
        } else {
          user.upstreams[id] = entry
        }
        if (Array.isArray(user.order)) {
          const kept = []
          for (const x of user.order) { if (x !== id && typeof x === 'string') kept.push(x) }
          user.order = kept
        }
        await s.replace(NS, user)
        return { ok: true }
      } catch (e) { return { ok: false, error: emsg(e) } }
    }
    // 恢复被隐藏的上游（清掉 removed 标记；来源已消失则记录为无效操作）
    rpc['freeroute.restore-upstream'] = async function (args) {
      try {
        const id = args && args.id
        if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(id)) return { ok: false, error: 'id 无效' }
        const cur = (userConfig.upstreams && userConfig.upstreams[id]) || null
        if (!cur || cur.removed !== true) return { ok: false, error: '该上游未被隐藏: ' + id }
        if (configFileOk) {
          const next = JSON.parse(JSON.stringify(userConfig))
          const e2 = next.upstreams[id]
          if (e2) {
            delete e2.removed
            if (Object.keys(e2).length === 0) delete next.upstreams[id]
          }
          userConfig = sanitizeConfig(next)
          writeConfigFile()
          checkTakeover().catch(function () { })
          return { ok: true }
        }
        const s = requireSettings()
        let desc = null
        for (const d of s.describe()) { if (d.ns === NS) { desc = d; break } }
        if (!desc || !desc.user || typeof desc.user !== 'object') return { ok: false, error: '没有可用的用户配置' }
        const user = desc.user
        if (!user.upstreams || !user.upstreams[id]) return { ok: false, error: '该上游未被隐藏: ' + id }
        delete user.upstreams[id].removed
        if (Object.keys(user.upstreams[id]).length === 0) delete user.upstreams[id]
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

    function statusText() {
      const lines = ['FreeRoute 免费模型代理 v' + VERSION + '（路由: ' + ROUTE + '）']
      const ups = orderedUpstreams()
      const promises = []
      for (const u of ups) promises.push(hasCredential(u))
      return Promise.all(promises).then(function (flags) {
        let ready = 0
        for (let i = 0; i < ups.length; i++) {
          const en = isEnabled(ups[i].id)
          if (en && flags[i]) ready++
          const h = health.get(ups[i].id) || {}
          const mark = !en ? '○ 关闭' : (cooling(ups[i].id) ? '◐ 冷却' : (flags[i] ? '● 就绪' : '◌ 无Key'))
          lines.push(mark + ' ' + ups[i].id + (h.lastError ? '（最近错误: ' + String(h.lastError).slice(0, 60) + '）' : ''))
        }
        const catUrl = (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL
        const catNote = (userConfig.catalog && userConfig.catalog.remoteUrl) ? '' : '（内置默认）'
        const catSynced = catalogMeta.lastSyncUrl
          ? ((catalogMeta.lastUsedFallback ? '（已回退备份源 ' : '（源 ') + catalogMeta.lastSyncUrl + '）')
          : ''
        lines.push('就绪上游 ' + ready + '/' + ups.length + '；远程目录: ' + catUrl + catNote + catSynced + (catalogMeta.lastSyncAt ? '（上次同步 ' + new Date(catalogMeta.lastSyncAt).toISOString() + '）' : ''))
        lines.push('把默认模型切到 ' + ROUTE + '/auto 即可开始使用；外部工具可用 ' + (webServer !== undefined ? ('http://127.0.0.1:' + webServer.port + '/freeroute/v1') : '（webServer 未挂载）'))
        return { kind: 'success', text: lines.join('\n') }
      })
    }

    // 本地 OpenAI 兼容端点：供其他 agent / 客户端复用免费额度。按设计无需
    // 任何 API Key（聚合的是本机已配置的免费上游），并放通 CORS（浏览器端
    // 应用也能直连）。
    const CORS_HEADERS = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400'
    }

    function sendJson(res, status, obj) {
      const h = Object.assign({ 'content-type': 'application/json' }, CORS_HEADERS)
      res.writeHead(status, h)
      res.end(typeof obj === 'string' ? obj : JSON.stringify(obj))
    }

    function strContent(c) {
      if (typeof c === 'string') return c
      if (Array.isArray(c)) {
        let out = ''
        for (const p of c) { if (p && typeof p.text === 'string') out += p.text }
        return out
      }
      return ''
    }

    function inboundToInternal(messages) {
      const out = []
      for (const m of messages || []) {
        if (m.role === 'system') { out.push({ role: 'system', content: [{ type: 'text', text: strContent(m.content) }] }); continue }
        if (m.role === 'assistant') {
          const blocks = []
          const txt = strContent(m.content)
          if (txt.length > 0) blocks.push({ type: 'text', text: txt })
          for (const tc of (m.tool_calls || [])) {
            blocks.push({ type: 'tool-call', id: tc.id || ('call_' + Math.random().toString(36).slice(2)), name: (tc.function && tc.function.name) || '', arguments: (tc.function && tc.function.arguments) || '{}' })
          }
          out.push({ role: 'assistant', content: blocks }); continue
        }
        if (m.role === 'tool') {
          out.push({ role: 'user', content: [{ type: 'tool-result', toolCallId: m.tool_call_id || '', content: [{ type: 'text', text: strContent(m.content) || '(no output)' }] }] }); continue
        }
        out.push({ role: 'user', content: [{ type: 'text', text: strContent(m.content) }] })
      }
      return out
    }

    function wireFinishReason(kind) {
      if (kind === 'tool-calls') return 'tool_calls'
      if (kind === 'max-tokens') return 'length'
      return 'stop'
    }

    function routeHandler(req, res) {
      Promise.resolve().then(async function () {
        const path = String(req.url || '/').split('?')[0]
        if (req.method === 'OPTIONS') {
          res.writeHead(204, CORS_HEADERS)
          res.end()
          return
        }
        if (path === '/freeroute/health') {
          sendJson(res, 200, { ok: true, route: ROUTE, version: VERSION, time: new Date().toISOString() })
          return
        }
        if (path === '/freeroute/v1/models') {
          const st = await buildState()
          sendJson(res, 200, { object: 'list', data: st.models.map(function (m) { return { id: m.id, object: 'model', owned_by: m.upstream } }) })
          return
        }
        if (path === '/freeroute/v1/chat/completions') {
          const dec = new TextDecoder()
          let raw = ''
          for await (const c of req) raw += dec.decode(c, { stream: true })
          raw += dec.decode()
          let body
          try { body = JSON.parse(raw) } catch (e) {
            sendJson(res, 400, { error: { message: 'invalid JSON body' } })
            return
          }
          const opts = {
            provider: ROUTE,
            model: (typeof body.model === 'string' && body.model.length > 0) ? body.model : 'auto',
            messages: inboundToInternal(body.messages),
            maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
            temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
            stop: body.stop
          }
          if (Array.isArray(body.tools) && body.tools.length > 0) {
            opts.tools = []
            for (const t of body.tools) {
              if (t && t.type === 'function' && t.function) {
                opts.tools.push({ name: String(t.function.name || ''), description: t.function.description || '', parameters: t.function.parameters || { type: 'object', properties: {} } })
              }
            }
            if (opts.tools.length === 0) delete opts.tools
          }
          if (body.stream) {
            res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, CORS_HEADERS))
            try {
              for await (const ck of failoverStream(opts)) {
                if (ck.type === 'text-delta') res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: ck.text } }] }) + '\n\n')
                else if (ck.type === 'reasoning-delta') res.write('data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: ck.text } }] }) + '\n\n')
                else if (ck.type === 'tool-call-delta') {
                  const tc = { index: ck.index, id: ck.id, type: 'function', function: { name: ck.name || '', arguments: ck.argumentsDelta || '' } }
                  res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [tc] } }] }) + '\n\n')
                }
                else if (ck.type === 'usage') res.write('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: ck.usage.inputTokens, completion_tokens: ck.usage.outputTokens } }) + '\n\n')
                else if (ck.type === 'finish') res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: wireFinishReason(ck.reason && ck.reason.kind) }] }) + '\n\n')
              }
              res.write('data: [DONE]\n\n')
              res.end()
            } catch (e) {
              try {
                res.write('data: ' + JSON.stringify({ error: { message: emsg(e), code: String(e && e.code) } }) + '\n\n')
                res.end()
              } catch (e2) { }
            }
            return
          }
          const startedAt = Date.now()
          try {
            const r = await collectFrom(failoverStream(opts))
            const message = { role: 'assistant', content: r.text }
            if (r.toolCalls && r.toolCalls.length > 0) {
              message.tool_calls = r.toolCalls.map(function (b, i) {
                return { id: b.id || ('call_' + i), type: 'function', function: { name: b.name || '', arguments: b.arguments || '{}' } }
              })
            }
            sendJson(res, 200, {
              id: 'freeroute-' + startedAt,
              object: 'chat.completion',
              created: Math.floor(startedAt / 1000),
              model: opts.model,
              choices: [{ index: 0, message: message, finish_reason: wireFinishReason(r.finish && r.finish.kind) }],
              usage: { prompt_tokens: (r.usage && r.usage.inputTokens) || 0, completion_tokens: (r.usage && r.usage.outputTokens) || 0 }
            })
          } catch (e) {
            sendJson(res, 502, { error: { message: emsg(e), code: String(e && e.code) } })
          }
          return
        }
        sendJson(res, 404, { error: { message: 'unknown freeroute path' } })
      }).catch(function (e) {
        try {
          sendJson(res, 500, { error: { message: emsg(e) } })
        } catch (e2) { }
      })
    }

    configPath = resolveConfigPath()
    {
      const raw = readConfigFile()
      if (raw !== null) {
        configFileOk = true
        userConfig = sanitizeConfig(raw)
        importDeclaredKeys(raw).catch(function () { })
      } else if (settings !== undefined) {
        try {
          const scope = settings.register(NS, ConfigSchema)
          const seeded = sanitizeConfig(scope.get())
          // 一次性迁移：settings 里已有配置（或空配置）落成 JSON 文件，之后以文件为准
          if (configPath && fsx !== null) {
            userConfig = seeded
            if (writeConfigFile()) {
              configFileOk = true
              userConfig = sanitizeConfig(readConfigFile() || seeded)
            } else {
              userConfig = seeded
            }
          } else {
            userConfig = seeded
          }
          if (!configFileOk) {
            ctx.effect(function () {
              return scope.watch(function () {
                userConfig = sanitizeConfig(scope.get())
                // 上游增删/启停会改变「就绪」判定（如免鉴权自定义网关），
                // 联动默认模型接管；密钥保存路径另有显式触发。
                checkTakeover().catch(function () { })
              })
            })
          }
        } catch (e) { console.error('[freeroute] settings 注册失败:', emsg(e)) }
      }
    }
    if (configFileOk) log('[freeroute] 配置文件:', configPath)

    ctx.effect(function () { return llm.registerAdapter([ROUTE], adapter) })
    for (const pair of Object.entries(rpc)) {
      const name = pair[0]
      const handler = pair[1]
      ctx.effect(function () { return harness.handle(name, handler) })
    }
    // 晚到自愈：apply、每轮 tick、buildState 都会调它；已挂载过则幂等跳过。
    let disposeWebRoute = null
    let disposeCommand = null
    function ensureHostBindings() {
      if (webServer === undefined) webServer = ctx.get('webServer')
      if (webServer !== undefined && disposeWebRoute === null) {
        try {
          disposeWebRoute = webServer.register({ kind: 'prefix', path: '/freeroute', handler: routeHandler })
        } catch (e) { console.error('[freeroute] webServer 注册失败:', emsg(e)) }
      }
      if (commands === undefined) commands = ctx.get('commands')
      if (commands !== undefined && disposeCommand === null) {
        try {
          disposeCommand = commands.register({
            name: 'freeproxy',
            description: 'FreeRoute 免费模型代理状态',
            input: { hint: '[status]' },
            handler: function () { return statusText() }
          })
        } catch (e) { console.error('[freeroute] commands 注册失败:', emsg(e)) }
      }
    }
    ensureHostBindings()
    ctx.effect(function () {
      return function () {
        if (disposeWebRoute) { try { disposeWebRoute() } catch (e) { } }
        if (disposeCommand) { try { disposeCommand() } catch (e) { } }
      }
    })
    ctx.effect(function () {
      return timer.timeout(function () {
        const url = (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL
        if (url) syncCatalog().catch(function () { })
        probeAll().catch(function () { })
        ensureHostBindings()
        checkTakeover().catch(function () { })
      }, 4000)
    })
    ctx.effect(function () {
      const refreshMs = (userConfig.catalog && userConfig.catalog.autoRefreshMs >= 60000) ? userConfig.catalog.autoRefreshMs : 1800000
      return timer.interval(function () {
        const url = (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL
        if (url) syncCatalog().catch(function () { })
        ensureHostBindings()
      }, refreshMs)
    })
    ctx.effect(function () {
      return timer.interval(function () { ensureHostBindings(); checkTakeover().catch(function () { }) }, 8000)
    })
    ctx.effect(function () {
      // 免费目录 10 分钟强刷：目录即真相，静态列表只作种子
      return timer.interval(function () { probeAll().catch(function () { }) }, 600000)
    })
    log('[freeroute] v' + VERSION + ' 就绪：路由 ' + ROUTE + '，内置上游 ' + BUILTIN_UPSTREAMS.length + ' 个，支持模型探测与远程目录（Cloudflare JSON / models.dev 格式）')
  }
}
