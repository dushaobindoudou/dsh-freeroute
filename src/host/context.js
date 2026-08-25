    const llm = ctx.llm
    const timer = ctx.timer
    const settings = ctx.get('settings')
    const credentials = ctx.get('credentials')
    const subprocess = ctx.get('subprocess')
    // webServer/commands 可能晚于本插件启动（也可能在无 Web 的 profile 中始终缺席）：
    // 用 let + ensureHostBindings() 晚到自愈（先重读引用，再补挂一次性副作用）。
    let webServer = ctx.get('webServer')
    let commands = ctx.get('commands')

    // 内置默认远程目录源：用户未显式配置 catalog.remoteUrl 时回退到此源，
    // 让全新安装自动拉取免费模型目录（Cloudflare Pages 静态 JSON）。
    const DEFAULT_CATALOG_URL = 'https://config.freetokenbox.com/freeroute.json'

    let userConfig = { order: [], upstreams: {} }
    let takeoverDone = false
    let takeoverPrev = null // 自动接管前的原默认选择（关闭开关时恢复）
    const stats = new Map()
    const health = new Map()
    const remoteUpstreams = new Map()
    const catalogMeta = { lastSyncAt: null, lastError: '', lastCount: 0, lastFormat: null }
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

