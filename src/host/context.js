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

    // ---- 逐条回复的模型归属（「这条回复实际是哪家上游的哪个模型答的」）----
    // 只存宿主内存，不写会话日志：dsh 的持久化读路径会拒绝未登记的未知事件
    // 类型（写进去会话就读不回来了），而合法的 plugin record 需要与宿主同一份
    // dsh-session 模块实例，插件拿不到。代价是宿主进程重启后历史消息不再标注。
    const servedByMessage = new Map() // messageId -> { model, upstream, upstreamName, requested }
    const servedSessionIds = new Map() // sessionId -> Set<messageId>（会话销毁时清理用）
    const servedPending = new Map() // sessionId -> Map<'turn:step' -> 归属>（等 assistant/message 绑定）
    const sessionTurns = new Map() // sessionId -> { turn, step }（取自 turn/start、step/start）

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

