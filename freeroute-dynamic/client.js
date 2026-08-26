const CSS = [
  '.frp { display: flex; flex-direction: column; gap: 14px; color: var(--dsw-alias-label-primary, inherit); font-size: 13px; }',
  '.frp-card { background: var(--dsw-alias-bg-layer-1, transparent); border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25)); border-radius: 10px; padding: 12px 14px; }',
  '.frp-title { font-size: 15px; font-weight: 600; margin: 0 0 6px; }',
  '.frp-muted { color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); }',
  '.frp-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border-radius: 6px; padding: 2px 6px; word-break: break-all; }',
  '.frp-up { display: flex; flex-direction: column; gap: 8px; }',
  '.frp-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }',
  '.frp-dot-up { background: var(--dsw-alias-state-success-primary, #34d399); }',
  '.frp-dot-cooling { background: var(--dsw-alias-state-warn-primary, #fbbf24); }',
  '.frp-dot-degraded { background: var(--dsw-alias-state-warn-primary, #fbbf24); }',
  '.frp-dot-off { background: var(--dsw-alias-border-l2, rgba(128,128,128,.5)); }',
  '.frp-name { font-weight: 600; font-size: 13.5px; }',
  '.frp-tag { font-size: 11px; border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3)); border-radius: 5px; padding: 0 6px; color: var(--dsw-alias-label-secondary, inherit); }',
  '.frp-btn { font: inherit; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4)); background: transparent; color: inherit; border-radius: 7px; padding: 3px 10px; cursor: pointer; }',
  '.frp-btn:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.1)); }',
  '.frp-btn:disabled { opacity: .45; cursor: default; }',
  '.frp-btn-primary { border-color: var(--dsw-alias-brand-primary, currentColor); }',
  '.frp-input { font: inherit; font-size: 12px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); color: inherit; border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3)); border-radius: 7px; padding: 4px 8px; width: 210px; }',
  '.frp-input-wide { width: 100%; box-sizing: border-box; }',
  '.frp-a { color: var(--dsw-alias-brand-primary, inherit); text-decoration: none; }',
  '.frp-a-sm { font-size: 12px; }',
  '.frp-a:hover { text-decoration: underline; }',
  '.frp-stats { font-size: 11.5px; color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); line-height: 1.6; }',
  '.frp-err { color: var(--dsw-alias-state-error-primary, #f87171); font-size: 12px; white-space: pre-wrap; word-break: break-all; }',
  '.frp-warn { color: var(--dsw-alias-state-warn-primary, #fbbf24); font-size: 12px; white-space: pre-wrap; word-break: break-all; }',
  '.frp-ok { color: var(--dsw-alias-state-success-primary, #34d399); font-size: 12px; }',
  '.frp-models { display: flex; flex-direction: column; max-height: 300px; overflow: auto; }',
  '.frp-mrow { display: flex; align-items: center; gap: 9px; padding: 8px 2px; cursor: pointer; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12)); white-space: nowrap; overflow: hidden; }',
  '.frp-mrow:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.06)); }',
  '.frp-models > div:last-child .frp-mrow, .frp-models > div:last-child .frp-mdetail { border-bottom: none; }',
  '.frp-mdetail { display: flex; flex-direction: column; gap: 5px; padding: 8px 2px 12px 13px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12)); font-size: 12px; }',
  '.frp-mk { color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); display: inline-block; min-width: 52px; }',
  '.frp-prow-solo:only-child { border-bottom: none; }',
  '.frp-keyrow { display: flex; gap: 8px; align-items: flex-start; }',
  '.frp-keyrow .frp-input { flex: 1; min-width: 0; width: auto; box-sizing: border-box; }',
  '.frp-keytoggle { flex: none; align-self: flex-start; margin-top: 1px; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; padding: 0; }',
  '.frp-eye { display: block; }',
  '.frp-keymask { flex: 1; min-width: 0; box-sizing: border-box; display: inline-flex; align-items: center; font: inherit; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 1.5px; color: var(--dsw-alias-label-secondary, inherit); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3)); border-radius: 7px; padding: 6px 9px; cursor: pointer; user-select: none; min-height: 26px; }',
  '.frp-keymask:hover { border-color: var(--dsw-alias-border-l2, rgba(128,128,128,.5)); }',
  '.frp-hiddenrow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 10px 2px 12px; font-size: 12px; }',
  '.frp-hiddenchip { font-size: 12px; }',
  '.frp-pre { margin: 0; padding: 8px 10px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2)); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.6; overflow: auto; }',
  '.frp-model-id { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }',
  // ---- 原生风格：头部 / 开关 / 供应商列表（点击展开）----
  '.frp-head { display: flex; flex-direction: column; gap: 4px; }',
  '.frp-headrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
  '.frp-headtitle { font-size: 16px; font-weight: 600; margin: 0; }',
  '.frp-headspace { flex: 1; }',
  '.frp-headline { font-size: 12px; display: flex; flex-wrap: wrap; row-gap: 2px; }',
  '.frp-headline span { word-break: break-all; }',
  '.frp-input[readonly] { opacity: .7; cursor: default; }',
  '.frp-switch { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; user-select: none; position: relative; }',
  '.frp-switch input { position: absolute; opacity: 0; width: 0; height: 0; }',
  '.frp-slider { width: 32px; height: 17px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.35)); position: relative; transition: background .15s; flex: none; }',
  ".frp-slider:after { content: ''; position: absolute; width: 13px; height: 13px; border-radius: 50%; top: 2px; left: 2px; background: var(--dsw-alias-bg-base, #fff); transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }",
  '.frp-switch input:checked + .frp-slider { background: var(--dsw-alias-brand-primary, rgba(64,128,255,.85)); }',
  '.frp-switch input:checked + .frp-slider:after { transform: translateX(15px); }',
  '.frp-switch input:focus-visible + .frp-slider { outline: 2px solid currentColor; outline-offset: 2px; }',
  '.frp-switch input:disabled + .frp-slider { opacity: .45; }',
  '.frp-switchtext { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }',
  '.frp-plist { padding: 2px 12px; }',
  '.frp-prow { display: flex; align-items: center; gap: 9px; padding: 11px 2px; cursor: pointer; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.15)); }',
  '.frp-prow:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.06)); }',
  '.frp-plist > div:last-child .frp-prow, .frp-plist > div:last-child .frp-pdetail { border-bottom: none; }',
  '.frp-pname { font-weight: 500; white-space: nowrap; }',
  '.frp-pctl { display: inline-flex; align-items: center; gap: 3px; flex: none; }',
  '.frp-iconbtn { padding: 2px 6px; line-height: 1; }',
  '.frp-pmeta { margin-left: auto; color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 12px; }',
  ".frp-chev { color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); transition: transform .15s; flex: none; font-size: 14px; }",
  '.frp-chev-open { transform: rotate(90deg); }',
  '.frp-pdetail { display: flex; flex-direction: column; gap: 10px; padding: 8px 2px 14px 23px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.15)); }',
  '.frp-drow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
  '.frp-keyarea { flex: 1; min-width: 220px; width: auto; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }',
  '.frp-btn-ghost { border-color: transparent; color: var(--dsw-alias-label-secondary, inherit); }',
  '.frp-check { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }',
  '.frp-form-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }',
  // 页签条与面板：视觉与交互对齐宿主「设置 -> 插件」页（下划线页签 + aria + 方向键）。
  '.frp-tabpage { max-width: 720px; color: var(--dsw-alias-label-primary, inherit); flex-direction: column; gap: 12px; display: flex; }',
  '.frp-tabs { border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); align-items: flex-end; gap: 22px; margin-top: 2px; display: flex; }',
  '.frp-tab { color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.9)); font: inherit; cursor: pointer; background: 0 0; border: 0; padding: 7px 1px 9px; font-size: 13px; line-height: 20px; position: relative; }',
  '.frp-tab:hover, .frp-tab[data-active=true] { color: var(--dsw-alias-label-primary, inherit); }',
  '.frp-tab[data-active=true]:after, .frp-tab:focus-visible:after { background: var(--dsw-alias-label-primary, currentColor); content: ""; border-radius: 2px 2px 0 0; height: 2px; position: absolute; bottom: -1px; left: 0; right: 0; }',
  '.frp-tab:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, currentColor); outline-offset: 2px; color: var(--dsw-alias-label-primary, inherit); border-radius: 2px; }',
  '.frp-panel { min-width: 0; padding-top: 2px; }',
  // 原模型页包裹层：不生成盒子，让内置 section 直接参与 frp-tabpage 布局。
  '.frp-models-scope { display: contents; }'
].join('\n')

// ctx 是 apply(ctx) 的参数，组件渲染时不在作用域内；用模块级引用转交。
// （styles / host / React 是 client 求值环境提供的全局，ctx 不是。）
let ctxRef = null

// ---- i18n：面板文案跟随 dsh 的 locale 服务（zh/en），缺服务时回落 zh ----
// locale 服务（dsh-client-locale 提供）含 subscribe(fn) 与 snapshot.revision；
// useSyncExternalStore 订阅 revision，语言切换或字典注册都会触发面板重渲染。
const STRINGS = {
  zh: {
    tabDefault: '默认',
    tabFree: '免费',
    tablistAria: '模型设置页签',
    loading: '正在加载 FreeRoute 免费模型代理状态…',
    stateBad: '状态数据格式异常（宿主与客户端版本不匹配，请重启 dsh web 后刷新）',
    loadFail: '加载失败: ',
    headEndpoint: '端点',
    headDefault: '默认',
    notSet: '未设置',
    endpointNone: '未挂载（webServer 不可用）',
    statRequests: '请求',
    statOk: '成功',
    statFailed: '失败',
    takenOver: '已接管',
    takenOverTitle: '本次进程已自动把默认模型切到 {route}/auto',
    autoTakeover: '自动接管',
    autoTakeoverTitle: '自动接管：检测到可用的免费上游时，自动把默认模型切到 {route}/auto（申请教程见各供应商详情）',
    disabled: '已停用',
    freeModels: '免费',
    noAuth: '免鉴权',
    keyX: 'Key ×',
    keyConfigured: 'Key 已配置',
    keyNeeded: '待配置 Key',
    cooling: '冷却',
    coolingUnit: 's',
    degraded: '状态不佳',
    probed: '探测',
    notProbed: '未探测',
    moveUp: '上移',
    moveDown: '下移',
    enableTitle: '启用 / 停用该上游',
    hideUpstream: '不显示该上游',
    hideUpstreamTitle: '从列表隐藏该上游（远程目录同步不会复活，可在下方恢复）',
    restore: '恢复',
    hiddenPrefix: '已隐藏',
    hiddenUnit: ' 家上游',
    test: '测试连通',
    testing: '测试中…',
    probe: '探测模型',
    probing: '探测中…',
    save: '保存',
    phConfigured: '输入新值可覆盖已配置的 Key；多把用换行/逗号分隔',
    phEmpty: '粘贴 {name} 的 API Key（多把用换行/逗号分隔，自动轮换）',
    eyeShow: '显示已配置的完整密钥',
    eyeHide: '隐藏密钥内容',
    triedModels: '（已试 {n} 个模型）',
    fail: '失败',
    keyFailWarn: '⚠ 第 {i} 把 Key 失效({code})，已自动轮换',
    applyKey: '申请 Key ↗',
    tutorial: '申请教程 ↗',
    modelsTitle: '模型',
    countUnit: ' 个',
    providersUnit: ' 家平台',
    detail: '详情',
    provider: '供应商',
    modelName: '名称',
    contextWindow: '上下文',
    unknown: '未知',
    advancedTitle: '高级设置',
    remoteCatalog: '远程目录 JSON',
    proxyTitle: '全局代理（默认关闭）',
    proxyPlaceholder: 'http://127.0.0.1:7890',
    proxySave: '保存代理',
    proxyClear: '清除',
    proxyOn: '已启用',
    proxyOff: '未启用（直连）',
    proxyHint1: '· 所有未单独配置代理的上游共用此代理（对话请求与模型探测）',
    proxyHint2: '· 上游自定义 / 目录声明的 proxy 优先于全局；远程目录同步始终直连',
    catTitle: '远程目录（JSON）',
    configFile: '配置文件：',
    settingsFallback: 'settings.yaml（JSON 文件不可用时兜底）',
    copyHint: '拷贝该文件即迁移/替换 · 改动约 5 秒自动生效 · 可选 "keys" 字段一次性导入密钥（仅补空位，不覆盖已保存的 Key）',
    saveSync: '保存并同步',
    syncOnly: '仅同步',
    syncFailed: '同步失败',
    lastSync: '上次同步',
    notSynced: '尚未同步',
    providersUnit2: ' 个厂商',
    formatUnit: ' 格式',
    errorLabel: ' · 错误: ',
    catHint1: '目录 JSON 一行一个厂商（字段见下）：',
    catHint2: '· apikey 可选：多把 Key 同步时整环导入并参与轮换',
    catHint3: '· freeModels 可选：模型名不带 free 字样时声明免费名单',
    catHint4: '· proxy 可选：该上游需走代理时填',
    catHint5: '模型列表无需写死——同步后自动探测；也兼容 models.dev 的 api.json。',
    catPlaceholder: 'https://<你的域名>/freeroute.json',
    modelsMissing: '未找到内置模型设置页组件（dsh 版本不兼容？）。请用「免费」页签配置免费模型。'
  },
  en: {
    tabDefault: 'Default',
    tabFree: 'Free',
    tablistAria: 'Model settings tabs',
    loading: 'Loading FreeRoute free-model proxy state…',
    stateBad: 'Unexpected state shape (host/client version mismatch — restart dsh web and reload)',
    loadFail: 'Load failed: ',
    headEndpoint: 'Endpoint',
    headDefault: 'Default',
    notSet: 'not set',
    endpointNone: 'not mounted (webServer unavailable)',
    statRequests: 'Requests',
    statOk: 'OK',
    statFailed: 'Failed',
    takenOver: 'Taken over',
    takenOverTitle: 'Default model switched to {route}/auto automatically in this process',
    autoTakeover: 'Auto takeover',
    autoTakeoverTitle: 'Auto takeover: switch the default model to {route}/auto once a free upstream is usable (see each provider for key guides)',
    disabled: 'Disabled',
    freeModels: 'Free',
    noAuth: 'No auth',
    keyX: 'Key ×',
    keyConfigured: 'Key configured',
    keyNeeded: 'Key needed',
    cooling: 'Cooldown',
    coolingUnit: 's',
    degraded: 'Degraded',
    probed: 'Probed',
    notProbed: 'Not probed',
    moveUp: 'Move up',
    moveDown: 'Move down',
    enableTitle: 'Enable / disable this upstream',
    hideUpstream: 'Hide',
    hideUpstreamTitle: 'Hide this upstream from the list (remote sync will not resurrect it; restore below)',
    restore: 'Restore',
    hiddenPrefix: 'Hidden',
    hiddenUnit: ' upstreams',
    test: 'Test',
    testing: 'Testing…',
    probe: 'Probe models',
    probing: 'Probing…',
    save: 'Save',
    phConfigured: 'Type to replace the configured keys; separate multiples with newlines/commas',
    phEmpty: 'Paste your {name} API key (multiples separated by newlines/commas — auto rotation)',
    eyeShow: 'Show configured keys',
    eyeHide: 'Hide key contents',
    triedModels: ' ({n} models tried)',
    fail: 'failed',
    keyFailWarn: '⚠ Key #{i} failed ({code}), rotated automatically',
    applyKey: 'Get key ↗',
    tutorial: 'Key guide ↗',
    modelsTitle: 'Models',
    countUnit: ' entries',
    providersUnit: ' providers',
    detail: 'Details',
    provider: 'Provider',
    modelName: 'Name',
    contextWindow: 'Context',
    unknown: 'unknown',
    advancedTitle: 'Advanced',
    remoteCatalog: 'Remote catalog JSON',
    proxyTitle: 'Global proxy (off by default)',
    proxyPlaceholder: 'http://127.0.0.1:7890',
    proxySave: 'Save proxy',
    proxyClear: 'Clear',
    proxyOn: 'Enabled',
    proxyOff: 'Disabled (direct)',
    proxyHint1: '· Applies to every upstream without its own proxy (chat + model probing)',
    proxyHint2: '· Per-upstream / catalog proxy wins over global; catalog sync is always direct',
    catTitle: 'Remote catalog (JSON)',
    configFile: 'Config file: ',
    settingsFallback: 'settings.yaml (fallback when JSON file unavailable)',
    copyHint: 'Copy this file to migrate/replace · edits apply in ~5s · optional "keys" field imports secrets once (fills empty slots only)',
    saveSync: 'Save & sync',
    syncOnly: 'Sync only',
    syncFailed: 'Sync failed',
    lastSync: 'Last sync',
    notSynced: 'Not synced yet',
    providersUnit2: ' providers',
    formatUnit: ' format',
    errorLabel: ' · error: ',
    catHint1: 'One provider per line in the catalog JSON (fields below):',
    catHint2: '· apikey optional: full key ring imported on sync and joins rotation',
    catHint3: '· freeModels optional: declare the free list when model ids lack a "free" marker',
    catHint4: '· proxy optional: set when this upstream needs a proxy',
    catHint5: 'Model lists are probed after sync — also accepts models.dev api.json.',
    catPlaceholder: 'https://<your-domain>/freeroute.json',
    modelsMissing: 'Built-in models settings component not found (dsh version incompatible?). Use the "Free" tab to configure free models.'
  }
}

const useLang = function () {
  const locale = (ctxRef && typeof ctxRef.get === 'function') ? ctxRef.get('locale') : null
  const sub = React.useCallback(function (cb) {
    if (!locale || typeof locale.subscribe !== 'function') return function () { }
    return locale.subscribe(cb)
  }, [locale])
  const snap = React.useCallback(function () {
    if (!locale || !locale.snapshot) return 'zh'
    return locale.snapshot.active === 'en' ? 'en' : 'zh'
  }, [locale])
  return React.useSyncExternalStore(sub, snap, function () { return 'zh' })
}

// tr(key, params)：按当前语言取文案，zh 缺项回落 en，再缺回落 key 本身。
const makeT = function (lang) {
  return function (key, params) {
    let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key
    if (params) {
      for (const k of Object.keys(params)) {
        s = s.split('{' + k + '}').join(String(params[k]))
      }
    }
    return s
  }
}

// ---- 眼睛图标（密钥显示/隐藏切换；描边随 currentColor 适配主题） ----
const EYE_ON_ICON = React.createElement('svg', {
  viewBox: '0 0 24 24', width: '15', height: '15', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  className: 'frp-eye', 'aria-hidden': 'true'
},
  React.createElement('path', { d: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z' }),
  React.createElement('circle', { cx: '12', cy: '12', r: '3' }))
const EYE_OFF_ICON = React.createElement('svg', {
  viewBox: '0 0 24 24', width: '15', height: '15', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  className: 'frp-eye', 'aria-hidden': 'true'
},
  React.createElement('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
  React.createElement('line', { x1: '1', y1: '1', x2: '23', y2: '23' }))
function Section(props) {
  const st0 = React.useState(null)
  const stateVal = st0[0]
  const setState = st0[1]
  // 面板文案语言：跟随 dsh 的 locale 服务（zh/en），切换即时重渲染
  const lang = useLang()
  const tr = makeT(lang)
  const er0 = React.useState('')
  const error = er0[0]
  const setError = er0[1]
  const bs0 = React.useState('')
  const busy = bs0[0]
  const setBusy = bs0[1]
  const dr0 = React.useState({})
  const drafts = dr0[0]
  const setDrafts = dr0[1]
  const ts0 = React.useState({})
  const tests = ts0[0]
  const setTests = ts0[1]
  const op0 = React.useState(null)
  const openId = op0[0]
  const setOpenId = op0[1]
  const ad0 = React.useState(false)
  const advOpen = ad0[0]
  const setAdvOpen = ad0[1]
  const ca0 = React.useState(null)
  const catUrl = ca0[0]
  const setCatUrl = ca0[1]
  // 全局代理草稿（与 catUrl 同理：hook 必须在无条件区声明，片段里只引用）
  const px0 = React.useState(null)
  const pxDraft = px0[0]
  const setPxDraft = px0[1]
  const mo0 = React.useState(false)
  const modelsOpen = mo0[0]
  const setModelsOpen = mo0[1]
  const om0 = React.useState(null)
  const openModel = om0[0]
  const setOpenModel = om0[1]
  const sk0 = React.useState({})
  const showKeys = sk0[0]
  const setShowKeys = sk0[1]
  const kv0 = React.useState({})
  const keyViews = kv0[0]
  const setKeyViews = kv0[1]

  React.useEffect(function () {
    let alive = true
    const tick = function () {
      host.call('freeroute.state').then(function (v) { if (alive) setState(v) }).catch(function (e) { if (alive) setError(String((e && e.message) || e)) })
    }
    tick()
    const d = ctxRef.interval(tick, 5000)
    return function () { alive = false; d() }
  }, [])

  const refresh = function () {
    host.call('freeroute.state').then(function (v) { setState(v) }).catch(function (e) { })
  }
  const act = function (method, args, tag, after) {
    setBusy(tag)
    host.call(method, args).then(function (r) {
      setBusy('')
      if (r && r.ok === false) { setError(r.error || '操作失败'); return }
      setError('')
      if (after) after(r)
      refresh()
    }).catch(function (e) { setBusy(''); setError(String((e && e.message) || e)) })
  }
  const setDraft = function (k, v) {
    const n = {}
    n[k] = v
    setDrafts(Object.assign({}, drafts, n))
  }

  // 形状守卫：state 必须是含 totals/upstreams 的完整对象。任何非预期形状
  // （如未解包的信封、纯文本错误页）都降级为错误卡，绝不炸掉整个设置槽。
  const stBad = !stateVal || typeof stateVal !== 'object' || !stateVal.totals || !Array.isArray(stateVal.upstreams)
  if (stBad) {
    const hint = error
      ? (tr('loadFail') + error)
      : (stateVal ? tr('stateBad') : tr('loading'))
    return React.createElement('div', { className: 'frp' },
      React.createElement('div', { className: 'frp-card frp-muted' }, hint))
  }

  const st = stateVal
  const cur = st.currentSelection
  const self = []

  // 写入约定：沙箱侧 settings.update 只接受宿主对象，所以由客户端构造完整
  // patch，经 RPC（JSON 边界）送达后由 host 只读校验并原样透传。
  const patchUpstream = function (id, entry) {
    const ups = {}
    ups[id] = entry
    return { upstreams: ups }
  }
  const movePatch = function (direction, id) {
    const ids = st.upstreams.map(function (x) { return x.id })
    const i = ids.indexOf(id)
    const j = direction === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return null
    const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp
    return { order: ids }
  }
  // ---- 头部：名字 + 版本 + 自动接管开关 + 一行关键信息（对齐原生设置页风格）----
  const headBits = [tr('headEndpoint') + ' ' + (st.endpoint ? st.endpoint.base : tr('endpointNone'))]
  headBits.push(tr('headDefault') + ' ' + (cur ? (cur.provider + '/' + cur.model) : tr('notSet')))
  headBits.push(tr('statRequests') + ' ' + st.totals.requests + ' · ' + tr('statOk') + ' ' + st.totals.ok + ' · ' + tr('statFailed') + ' ' + st.totals.failed)
  if (st.totals.tokensIn || st.totals.tokensOut) headBits.push('tokens ↑' + st.totals.tokensIn + ' ↓' + st.totals.tokensOut)
  self.push(React.createElement('div', { className: 'frp-head', key: 'head' },
    React.createElement('div', { className: 'frp-headrow', key: 'row' },
      React.createElement('h3', { className: 'frp-headtitle' }, 'freeroute'),
      React.createElement('span', { className: 'frp-tag', key: 'v' }, 'v' + st.version),
      React.createElement('span', { className: 'frp-headspace', key: 'sp' }),
      st.autoInjected ? React.createElement('span', { className: 'frp-ok', key: 'inj', title: tr('takenOverTitle', { route: st.route }) }, tr('takenOver')) : null,
      React.createElement('label', {
        key: 'tk', className: 'frp-switch',
        title: tr('autoTakeoverTitle', { route: st.route })
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: st.autoTakeover,
          disabled: busy === 'tk',
          onChange: function (e) {
            const p = {}
            p.autoTakeover = !!e.target.checked
            act('freeroute.apply-patch', { patch: p }, 'tk')
          }
        }),
        React.createElement('span', { className: 'frp-slider' }),
        React.createElement('span', { className: 'frp-switchtext' }, tr('autoTakeover')))),
    React.createElement('div', { className: 'frp-muted frp-headline', key: 'line' },
      headBits.map(function (b, i) { return React.createElement('span', { key: 'b' + i }, (i > 0 ? ' · ' : '') + b) }))))

  if (error) {
    self.push(React.createElement('div', { className: 'frp-err', key: 'err' }, error))
  }

  // ---- 供应商列表：行只放核心内容，点击展开详情与编辑（对齐原生模型页交互）----
  const rows = []
  for (let i = 0; i < st.upstreams.length; i++) {
    const u = st.upstreams[i]
    const open = openId === u.id
    const dotClass = !u.enabled
      ? 'frp-dot-off'
      : (u.health.state === 'cooling'
        ? 'frp-dot-cooling'
        : (u.health.state === 'degraded' ? 'frp-dot-degraded' : (u.configured || u.noAuth ? 'frp-dot-up' : 'frp-dot-off')))
    const draftKey = 'draft-' + u.id
    const testInfo = tests[u.id]
    const metaBits = []
    if (!u.enabled) {
      metaBits.push(tr('disabled'))
    } else {
      metaBits.push(tr('freeModels') + ' ' + (u.freeCount || 0) + '/' + (u.modelsCount || 0))
      if (u.noAuth) metaBits.push(tr('noAuth'))
      else if (u.keys > 1) metaBits.push(tr('keyX') + u.keys)
      else if (u.configured) metaBits.push(tr('keyConfigured'))
      else metaBits.push(tr('keyNeeded'))
      if (u.health.state === 'cooling') metaBits.push(tr('cooling') + ' ' + Math.ceil(u.health.cooldownMs / 1000) + tr('coolingUnit'))
      else if (u.health.state === 'degraded') metaBits.push(tr('degraded'))
      metaBits.push(u.probedAt ? (tr('probed') + ' ' + new Date(u.probedAt).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US')) : tr('notProbed'))
    }
    const kids = []
    kids.push(React.createElement('div', {
      key: 'row', className: 'frp-prow',
      onClick: function () { setOpenId(open ? null : u.id) }
    },
      React.createElement('span', { className: 'frp-dot ' + dotClass, key: 'dot', title: u.health.state }),
      React.createElement('span', { className: 'frp-pname' + (u.enabled ? '' : ' frp-muted'), key: 'nm' }, u.name),
      React.createElement('span', { className: 'frp-pmeta', key: 'meta' }, metaBits.join(' · ')),
      React.createElement('span', { key: 'ctl', className: 'frp-pctl' },
        React.createElement('button', {
          key: 'up', className: 'frp-btn frp-btn-ghost frp-iconbtn', title: tr('moveUp'),
          disabled: busy === 'mv-' + u.id || u.priority === 0,
          onClick: function (e) { e.stopPropagation(); act('freeroute.apply-patch', { patch: movePatch('up', u.id) }, 'mv-' + u.id) }
        }, '↑'),
        React.createElement('button', {
          key: 'dn', className: 'frp-btn frp-btn-ghost frp-iconbtn', title: tr('moveDown'),
          disabled: busy === 'mv-' + u.id || u.priority === st.upstreams.length - 1,
          onClick: function (e) { e.stopPropagation(); act('freeroute.apply-patch', { patch: movePatch('down', u.id) }, 'mv-' + u.id) }
        }, '↓'),
        React.createElement('label', {
          key: 'en', className: 'frp-switch', title: tr('enableTitle'),
          onClick: function (e) { e.stopPropagation() }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: u.enabled,
            disabled: busy === 'en-' + u.id,
            onChange: function (e) { act('freeroute.apply-patch', { patch: patchUpstream(u.id, { enabled: !!e.target.checked }) }, 'en-' + u.id) }
          }),
          React.createElement('span', { className: 'frp-slider' })),
        React.createElement('span', { className: 'frp-chev' + (open ? ' frp-chev-open' : ''), key: 'chev' }, '›'))))

    if (open) {
      const dk = []

      // 密钥显示/隐藏：隐藏态 = span 内 14 个星号（已配置时）；显示态 =
      // 多行输入框（一行一把，可编辑保存）。未配置时无需掩码，直接多行输入。
      // 切换按钮用 睁眼/闭眼 图标（aria-label + title 同步本地化）。
      if (!u.noAuth) {
        const shown = !!showKeys[u.id]
        const ph = u.configured
          ? tr('phConfigured')
          : tr('phEmpty', { name: u.name })
        // 显示密钥：切换为「显示」态；编辑框为空时预填完整 Key 环（一行一把）
        const revealKeys = function () {
          const n = {}
          n[u.id] = true
          setShowKeys(Object.assign({}, showKeys, n))
          const v = keyViews[u.id]
          const fill = function (keys) {
            if (!(drafts[draftKey] || '').trim() && Array.isArray(keys) && keys.length > 0) {
              setDraft(draftKey, keys.join('\n'))
            }
          }
          if (v && v.loaded) { fill(v.keys); return }
          host.call('freeroute.get-keys', { id: u.id }).then(function (r) {
            const keys = (r && r.ok && Array.isArray(r.keys)) ? r.keys : []
            const nv = {}
            nv[u.id] = { loaded: true, keys: keys }
            setKeyViews(Object.assign({}, keyViews, nv))
            fill(keys)
          }).catch(function () {
            const nv = {}
            nv[u.id] = { loaded: true, keys: [] }
            setKeyViews(Object.assign({}, keyViews, nv))
          })
        }
        const keyKids = []
        if (shown || !u.configured) {
          keyKids.push(React.createElement('textarea', {
            key: 'in', className: 'frp-input frp-keyarea', rows: 2, spellCheck: false, autoComplete: 'off',
            placeholder: ph,
            value: drafts[draftKey] || '',
            onChange: function (e) { setDraft(draftKey, e.target.value) }
          }))
        } else {
          // 已配置且隐藏：span + 星号掩码（点击掩码即显示）
          keyKids.push(React.createElement('span', {
            key: 'mask', className: 'frp-keymask',
            title: tr('eyeShow'),
            onClick: revealKeys
          }, '**************'))
        }
        keyKids.push(React.createElement('button', {
          key: 'tg', className: 'frp-btn frp-btn-ghost frp-iconbtn frp-keytoggle',
          title: shown ? tr('eyeHide') : tr('eyeShow'),
          'aria-label': shown ? tr('eyeHide') : tr('eyeShow'),
          'aria-pressed': shown ? 'true' : 'false',
          onClick: function () {
            if (shown) {
              const n = {}
              n[u.id] = false
              setShowKeys(Object.assign({}, showKeys, n))
            } else {
              revealKeys()
            }
          }
        }, shown ? EYE_OFF_ICON : EYE_ON_ICON))
        dk.push(React.createElement('div', { className: 'frp-keyrow', key: 'key' }, keyKids))
      }

      // 底部操作组：隐藏 / 测试连通 / 探测模型 / 保存 + 最右侧小字链接（申请 Key / 申请教程）
      const actRow = []
      actRow.push(React.createElement('button', {
        key: 'hide', className: 'frp-btn frp-btn-ghost',
        title: tr('hideUpstreamTitle'),
        disabled: busy === 'rm-' + u.id,
        onClick: function (e) { e.stopPropagation(); act('freeroute.remove-upstream', { id: u.id }, 'rm-' + u.id) }
      }, tr('hideUpstream')))
      actRow.push(React.createElement('button', {
        key: 'btn', className: 'frp-btn',
        disabled: busy === 't-' + u.id,
        onClick: function () {
          const n = {}
          n[u.id] = { pending: true }
          setTests(Object.assign({}, tests, n))
          host.call('freeroute.test', { id: u.id }).then(function (r) {
            const n2 = {}
            n2[u.id] = r
            setTests(Object.assign({}, tests, n2))
            refresh()
          }).catch(function (e) {
            const n3 = {}
            n3[u.id] = { ok: false, error: String((e && e.message) || e) }
            setTests(Object.assign({}, tests, n3))
          })
        }
      }, busy === 't-' + u.id ? tr('testing') : tr('test')))
      actRow.push(React.createElement('button', {
        key: 'probe', className: 'frp-btn',
        disabled: busy === 'pb-' + u.id,
        onClick: function (e) { e.stopPropagation(); act('freeroute.probe', { id: u.id }, 'pb-' + u.id) }
      }, busy === 'pb-' + u.id ? tr('probing') : tr('probe')))
      if (!u.noAuth) {
        actRow.push(React.createElement('button', {
          key: 'save', className: 'frp-btn frp-btn-primary',
          disabled: busy === 'key-' + u.id || !(drafts[draftKey] || '').trim(),
          onClick: function () { act('freeroute.set-key', { id: u.id, key: drafts[draftKey] }, 'key-' + u.id, function () {
            setDraft(draftKey, '')
            const nv = {}; nv[u.id] = { loaded: false, keys: null }
            setKeyViews(Object.assign({}, keyViews, nv))
            // 保存成功：直接回到隐藏掩码态（不再停留在「显示」的明文编辑态）
            const nh = {}; nh[u.id] = false
            setShowKeys(Object.assign({}, showKeys, nh))
          }) }
        }, tr('save')))
      }
      // 最右侧小字：申请 Key / 申请教程（href；极简目录的教程是 URL，内置教程步骤放悬停提示）
      const links = []
      if (u.signupUrl) {
        links.push(React.createElement('a', { key: 'reg', className: 'frp-a frp-a-sm', href: u.signupUrl, target: '_blank', rel: 'noreferrer' }, tr('applyKey')))
      }
      if (u.tutorialUrl) {
        links.push(React.createElement('a', { key: 'tut', className: 'frp-a frp-a-sm', href: u.tutorialUrl, target: '_blank', rel: 'noreferrer' }, tr('tutorial')))
      } else if (u.signupUrl && u.tutorial && u.tutorial.length > 0) {
        links.push(React.createElement('a', {
          key: 'tut', className: 'frp-a frp-a-sm', href: u.signupUrl, target: '_blank', rel: 'noreferrer',
          title: u.tutorial.map(function (x, si) { return (si + 1) + '. ' + x }).join('\n')
        }, tr('tutorial')))
      }
      if (links.length > 0) {
        actRow.push(React.createElement('span', { className: 'frp-headspace', key: 'sp2' }))
        for (const lk of links) actRow.push(lk)
      }
      dk.push(React.createElement('div', { className: 'frp-drow', key: 'act' }, actRow))

      // 结果反馈（瞬时信息，不常驻文案）
      if (testInfo) {
        const triedNote = Array.isArray(testInfo.tried) && testInfo.tried.length > 1 ? tr('triedModels', { n: testInfo.tried.length }) : ''
        if (testInfo.pending) {
          dk.push(React.createElement('div', { className: 'frp-muted', key: 'pend' }, '…'))
        } else if (testInfo.ok) {
          dk.push(React.createElement('div', { className: 'frp-ok', key: 'ok' }, '✓ ' + testInfo.model + (triedNote ? ' ' + triedNote : '') + ' · ' + testInfo.latencyMs + 'ms'))
        } else {
          dk.push(React.createElement('div', { className: 'frp-err', key: 'bad' }, '✗ ' + (testInfo.error || tr('fail')) + triedNote))
        }
      }
      if (u.health.lastError) {
        dk.push(React.createElement('div', { className: 'frp-err', key: 'lerr' }, String(u.health.lastError).slice(0, 160)))
      }
      if (Array.isArray(u.health.keyFails) && u.health.keyFails.length > 0) {
        dk.push(React.createElement('div', { className: 'frp-warn', key: 'kf' },
          u.health.keyFails.map(function (f) {
            return tr('keyFailWarn', { i: f.index, code: f.code })
          }).join('\n')))
      }

      kids.push(React.createElement('div', { className: 'frp-pdetail', key: 'detail' }, dk))
    }
    rows.push(React.createElement('div', { key: u.id }, kids))
  }
  // ---- 已隐藏上游（removed 标记）：一行汇总 + 逐家恢复 ----
  const hiddenList = Array.isArray(st.hiddenUpstreams) ? st.hiddenUpstreams : []
  if (hiddenList.length > 0) {
    const hk = []
    hk.push(React.createElement('span', { className: 'frp-muted', key: 'lbl' },
      tr('hiddenPrefix') + ' ' + hiddenList.length + tr('hiddenUnit') + '：'))
    hiddenList.forEach(function (h, hi) {
      hk.push(React.createElement('button', {
        key: 'r' + hi, className: 'frp-btn frp-btn-ghost frp-hiddenchip',
        title: tr('restore') + ' ' + h.name,
        disabled: busy === 'rs-' + h.id,
        onClick: function () { act('freeroute.restore-upstream', { id: h.id }, 'rs-' + h.id) }
      }, h.name + ' ↩'))
    })
    rows.push(React.createElement('div', { className: 'frp-hiddenrow', key: 'hidden' }, hk))
  }
  self.push(React.createElement('div', { className: 'frp-card frp-plist', key: 'ups' }, rows))

  // 全局代理卡：输入框 + 保存/清除。留空保存 = 清除（回到直连）。
  // pxDraft/setPxDraft 声明在 panel-state.js 顶部（hook 规则：不可条件执行）。
  const pxValue = pxDraft === null ? (st.globalProxy || '') : pxDraft
  const pxKids = []
  pxKids.push(React.createElement('h3', { className: 'frp-title', key: 't' }, tr('proxyTitle')))
  pxKids.push(React.createElement('div', { className: 'frp-stats', key: 'st' },
    (st.globalProxy ? (tr('proxyOn') + ' · ' + st.globalProxy) : tr('proxyOff'))))
  const pxRow = []
  pxRow.push(React.createElement('input', {
    key: 'url',
    className: 'frp-input frp-input-wide',
    type: 'text',
    placeholder: tr('proxyPlaceholder'),
    value: pxValue,
    onChange: function (e) { setPxDraft(e.target.value) }
  }))
  pxRow.push(React.createElement('button', {
    key: 'save',
    className: 'frp-btn frp-btn-primary',
    disabled: busy === 'px',
    onClick: function () {
      act('freeroute.apply-patch', { patch: { proxy: pxValue.trim() } }, 'px', function () { setPxDraft(null) })
    }
  }, tr('proxySave')))
  pxRow.push(React.createElement('button', {
    key: 'clear',
    className: 'frp-btn',
    disabled: busy === 'px' || !st.globalProxy,
    onClick: function () {
      setPxDraft('')
      act('freeroute.apply-patch', { patch: { proxy: '' } }, 'px', function () { setPxDraft(null) })
    }
  }, tr('proxyClear')))
  pxKids.push(React.createElement('div', { className: 'frp-form-row', key: 'row' }, pxRow))
  pxKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h1' }, tr('proxyHint1')))
  pxKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h2' }, tr('proxyHint2')))
  const pxCard = React.createElement('div', { className: 'frp-card' }, pxKids)

  const catKids = []
  catKids.push(React.createElement('h3', { className: 'frp-title', key: 't' }, tr('catTitle')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'cfg1' },
    tr('configFile') + (st.configPath || tr('settingsFallback'))))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'cfg2' }, tr('copyHint')))
  const catRow = []
  catRow.push(React.createElement('input', {
    key: 'url',
    className: 'frp-input frp-input-wide',
    type: 'text',
    placeholder: tr('catPlaceholder'),
    value: catUrl === null ? st.catalog.remoteUrl : catUrl,
    onChange: function (e) { setCatUrl(e.target.value) }
  }))
  catRow.push(React.createElement('button', {
    key: 'save',
    className: 'frp-btn frp-btn-primary',
    disabled: busy === 'cat',
    onClick: function () {
      const url = (catUrl === null ? st.catalog.remoteUrl : catUrl).trim()
      const cat = {}
      cat.catalog = { remoteUrl: url }
      act('freeroute.apply-patch', { patch: cat }, 'cat', function () {
        host.call('freeroute.catalog.sync').then(function (r) {
          if (r && r.ok) setError('')
          else setError((r && r.error) || tr('syncFailed'))
          refresh()
        }).catch(function (e) { setError(String((e && e.message) || e)) })
      })
    }
  }, tr('saveSync')))
  catRow.push(React.createElement('button', {
    key: 'sync', className: 'frp-btn',
    disabled: busy === 'catsync',
    onClick: function (e) { e.stopPropagation(); act('freeroute.catalog.sync', {}, 'catsync') }
  }, tr('syncOnly')))
  catKids.push(React.createElement('div', { className: 'frp-form-row', key: 'row' }, catRow))
  catKids.push(React.createElement('pre', { className: 'frp-pre', key: 'fmt' },
    '[\n' +
    '  {\n' +
    '    "providerName": "B.AI",\n' +
    '    "getkey": "https://chat.b.ai/chat?invite_code=…",\n' +
    '    "tutorial": "https://your.site/bai-tutorial",\n' +
    '    "api": "https://api.b.ai/v1",\n' +
    '    "apikey": ["sk-xxx"],\n' +
    '    "freeModels": ["deepseek-v4-flash", "hy3"],\n' +
    '    "proxy": "http://127.0.0.1:7890"\n' +
    '  }\n' +
    ']'))
  const catStatus = st.catalog.lastSyncAt
    ? (tr('lastSync') + ' ' + new Date(st.catalog.lastSyncAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') + ' · ' + st.catalog.lastCount + tr('providersUnit2') + ' · ' + st.catalog.lastFormat + tr('formatUnit'))
    : tr('notSynced')
  catKids.push(React.createElement('div', { className: 'frp-stats', key: 's' },
    catStatus + (st.catalog.lastSyncError ? (tr('errorLabel') + st.catalog.lastSyncError) : '')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h1' },
    tr('catHint1')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h2' },
    tr('catHint2')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h3' },
    tr('catHint3')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h4' },
    tr('catHint4')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h5' },
    tr('catHint5')))
  const catCard = React.createElement('div', { className: 'frp-card' }, catKids)
  const plainModels = st.models.filter(function (m) { return m.id !== 'auto' })
  const upName = {}
  for (const u of st.upstreams) upName[u.id] = u.name || u.id
  const modelRows = []
  for (let i = 0; i < plainModels.length; i++) {
    const m = plainModels[i]
    const via = Array.isArray(m.via) ? m.via : []
    const mOpen = openModel === m.id
    const rowKids = []
    rowKids.push(React.createElement('div', {
      key: 'row', className: 'frp-mrow',
      onClick: function () { setOpenModel(mOpen ? null : m.id) }
    },
      React.createElement('span', { className: 'frp-model-id', key: 'id' }, m.id),
      React.createElement('span', { className: 'frp-muted frp-pmeta', key: 'meta' }, via.length + tr('providersUnit')),
      React.createElement('span', { key: 'ctl', className: 'frp-pctl' },
        React.createElement('button', {
          key: 'dt', className: 'frp-btn frp-btn-ghost frp-iconbtn',
          onClick: function (e) { e.stopPropagation(); setOpenModel(mOpen ? null : m.id) }
        }, tr('detail')))))
    if (mOpen) {
      const viaRows = via.map(function (v, vi) {
        return React.createElement('div', { key: 'v' + vi },
          React.createElement('span', { className: 'frp-mk' }, vi === 0 ? tr('provider') : ''),
          (upName[v.upstream] || v.upstream) + '（' + v.model + '）')
      })
      rowKids.push(React.createElement('div', { className: 'frp-mdetail', key: 'detail' },
        React.createElement('div', { key: 'nm' },
          React.createElement('span', { className: 'frp-mk' }, tr('modelName')), m.name && m.name !== m.id ? m.name : m.id),
        React.createElement('div', { key: 'ctx' },
          React.createElement('span', { className: 'frp-mk' }, tr('contextWindow')), m.contextWindow ? (String(m.contextWindow) + ' tokens') : tr('unknown')),
        viaRows.length > 0
          ? React.createElement('div', { key: 'via', style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, viaRows)
          : React.createElement('div', { key: 'via-none' },
              React.createElement('span', { className: 'frp-mk' }, tr('provider')), tr('unknown'))))
    }
    modelRows.push(React.createElement('div', { key: m.id }, rowKids))
  }
  self.push(React.createElement('div', {
    key: 'models', className: 'frp-card frp-plist',
    onClick: function () { setModelsOpen(!modelsOpen) }
  },
    React.createElement('div', { className: 'frp-prow frp-prow-solo' },
      React.createElement('span', { className: 'frp-pname' }, tr('modelsTitle')),
      React.createElement('span', { className: 'frp-pmeta' }, plainModels.length + tr('countUnit')),
      React.createElement('span', { className: 'frp-chev' + (modelsOpen ? ' frp-chev-open' : '') }, '›')),
    modelsOpen ? React.createElement('div', { className: 'frp-models', key: 'list' }, modelRows) : null))

  // ---- 高级设置：远程目录 JSON（低频配置，折叠收纳）----
  self.push(React.createElement('div', {
    key: 'adv', className: 'frp-card frp-plist',
    onClick: function () { setAdvOpen(!advOpen) }
  },
    React.createElement('div', { className: 'frp-prow frp-prow-solo' },
      React.createElement('span', { className: 'frp-pname' }, tr('advancedTitle')),
      React.createElement('span', { className: 'frp-pmeta' }, tr('remoteCatalog')),
      React.createElement('span', { className: 'frp-chev' + (advOpen ? ' frp-chev-open' : '') }, '›'))))
  if (advOpen) {
    self.push(pxCard)
    self.push(catCard)
  }
  // ---- 高级设置：远程目录 / 自定义上游（低频配置，折叠收纳）----

  return React.createElement('div', { className: 'frp' }, self)
}

// ---------------------------------------------------------------- 设置 -> 模型 页内嵌
// dsh 的「模型」设置页（settings.section id 'models'）没有给第三方的子插槽，
// 导航行又由原始条目表直接生成--再注册一个同名条目会产生两个「模型」行。
// 因此这里采用「单属性换血」：把内置 models 条目的 component 换成下面的包装
// 组件（options/label/order 原样保留，导航仍是一行「模型」），结构对齐宿主
// 「设置 -> 插件」页：标题与介绍保持原位不动，页签条插在介绍之后、内容之前。
// 页签条是纯 DOM 节点（不归 React 管，插入内置页内部不会破坏其
// reconciliation），两个页签「默认 | 免费」：
//   - 默认：内置模型页原样展示（DeepSeek 等提供方行、添加区）；
//   - 免费：隐藏页签之后的内置内容，下方渲染完整 freeroute 面板（Section）。
// 访问过的面板保持挂载（轮询与表单状态不丢）；插件停止时换回原组件、移除
// 页签条并还原可见性，完全可逆。渲染端 SlotOutlet 每次渲染都从活条目读
// entry.component，bump 一次 slot 版本即可让内容出口重新取件。
let wrappedOriginalComponent = null

function ModelsSectionWithFreeRoute(props) {
  const tabsId = (typeof React.useId === 'function' ? React.useId() : 'frp-models-tabs')
  // 页签文案跟随 dsh 语言；语言切换时下方 effect 会重建页签条
  const lang = useLang()
  const tr = makeT(lang)
  const scopeRef = React.useRef(null)
  const barRef = React.useRef(null)
  const activeRef = React.useRef('default')
  const a0 = React.useState('default')
  const active = a0[0]
  const setActive = a0[1]
  const v0 = React.useState(function () { return { default: true } })
  const visited = v0[0]
  const setVisited = v0[1]
  const select = function (id) {
    setActive(id)
    setVisited(function (v) { if (v[id]) return v; const n = Object.assign({}, v); n[id] = true; return n })
  }

  // 页签条落位 + 常驻守护（React 重渲染挪走后自动归位）。只动自己创建的节点。
  React.useEffect(function () {
    const root = scopeRef.current
    if (!root || typeof document !== 'object' || document === null) return undefined
    const view = root.ownerDocument && root.ownerDocument.defaultView
    let mo = null

    function sectionOf() {
      const h2 = root.querySelector('h2')
      return h2 && h2.parentElement ? h2.parentElement : null
    }

    function buildBar() {
      const bar = document.createElement('div')
      bar.setAttribute('data-frp', 'tabbar')
      bar.className = 'frp-tabs'
      bar.setAttribute('role', 'tablist')
      bar.setAttribute('aria-label', tr('tablistAria'))
      const defs = [
        { id: 'default', label: tr('tabDefault') },
        { id: 'free', label: tr('tabFree') }
      ]
      const btns = []
      defs.forEach(function (d, index) {
        const b = document.createElement('button')
        b.type = 'button'
        b.setAttribute('role', 'tab')
        b.id = tabsId + '-tab-' + d.id
        b.className = 'frp-tab'
        b.setAttribute('aria-controls', tabsId + '-panel-' + d.id)
        b.textContent = d.label
        b.addEventListener('click', function () { select(d.id) })
        b.addEventListener('keydown', function (event) {
          let next
          if (event.key === 'ArrowRight') next = (index + 1) % defs.length
          else if (event.key === 'ArrowLeft') next = (index - 1 + defs.length) % defs.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = defs.length - 1
          else return
          event.preventDefault()
          select(defs[next].id)
          const t = btns[next]
          if (t && typeof t.focus === 'function') t.focus()
        })
        btns.push(b)
        bar.appendChild(b)
      })
      return bar
    }

    function place() {
      try {
        const sec = sectionOf()
        if (!sec) return
        if (barRef.current === null || !barRef.current.isConnected) {
          const bar = buildBar()
          const h2 = sec.querySelector('h2')
          const intro = h2 ? h2.nextElementSibling : null
          const anchor = (intro && intro.tagName === 'P') ? intro : h2
          if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling)
          barRef.current = bar
          syncBar()
        }
      } catch (e) { }
    }

    function syncBar() {
      const bar = barRef.current
      if (!bar || !bar.isConnected) return
      const cur = activeRef.current
      const btns = bar.children
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i]
        const selected = (i === 0) === (cur === 'default')
        b.setAttribute('aria-selected', selected ? 'true' : 'false')
        b.setAttribute('data-active', selected ? 'true' : 'false')
        b.tabIndex = selected ? 0 : -1
      }
    }

    function syncVisibility() {
      const sec = sectionOf()
      if (!sec) return
      const bar = barRef.current
      const h2 = sec.querySelector('h2')
      const intro = h2 ? h2.nextElementSibling : null
      const free = activeRef.current === 'free'
      for (const el of Array.prototype.slice.call(sec.children)) {
        if (el === h2 || el === intro) continue
        if (bar && el === bar) continue
        if (el.getAttribute && el.getAttribute('data-frp')) continue
        if (free) {
          if (el.style.display !== 'none') {
            el.setAttribute('data-frp-hidden', '1')
            el.style.display = 'none'
          }
        } else if (el.getAttribute && el.getAttribute('data-frp-hidden') === '1') {
          el.removeAttribute('data-frp-hidden')
          el.style.display = ''
        }
      }
    }

    const sync = function () { syncBar(); syncVisibility() }
    place()
    sync()
    if (view && typeof view.MutationObserver === 'function') {
      mo = new view.MutationObserver(function () { place(); sync() })
      mo.observe(root, { childList: true, subtree: true })
    }
    return function () {
      if (mo) mo.disconnect()
      if (barRef.current) {
        if (barRef.current.parentNode) barRef.current.parentNode.removeChild(barRef.current)
        barRef.current = null
      }
      const sec = sectionOf()
      if (sec) {
        for (const el of Array.prototype.slice.call(sec.children)) {
          if (el.getAttribute && el.getAttribute('data-frp-hidden') === '1') {
            el.removeAttribute('data-frp-hidden')
            el.style.display = ''
          }
        }
      }
    }
  }, [lang])

  React.useEffect(function () {
    activeRef.current = active
    const root = scopeRef.current
    if (!root || typeof document !== 'object' || document === null) return
    const bar = barRef.current
    if (!bar || !bar.isConnected) return
    const btns = bar.children
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i]
      const selected = (i === 0) === (active === 'default')
      b.setAttribute('aria-selected', selected ? 'true' : 'false')
      b.setAttribute('data-active', selected ? 'true' : 'false')
      b.tabIndex = selected ? 0 : -1
    }
    const sec = (function () {
      const h2 = root.querySelector('h2')
      return h2 && h2.parentElement ? h2.parentElement : null
    })()
    if (!sec) return
    const h2 = sec.querySelector('h2')
    const intro = h2 ? h2.nextElementSibling : null
    const free = active === 'free'
    for (const el of Array.prototype.slice.call(sec.children)) {
      if (el === h2 || el === intro) continue
      if (el === bar) continue
      if (el.getAttribute && el.getAttribute('data-frp')) continue
      if (free) {
        if (el.style.display !== 'none') {
          el.setAttribute('data-frp-hidden', '1')
          el.style.display = 'none'
        }
      } else if (el.getAttribute && el.getAttribute('data-frp-hidden') === '1') {
        el.removeAttribute('data-frp-hidden')
        el.style.display = ''
      }
    }
  }, [active])

  const kids = []
  kids.push(React.createElement('div', {
    className: 'frp-models-scope',
    key: 'orig',
    ref: scopeRef,
    id: tabsId + '-panel-default',
    role: 'tabpanel',
    'aria-labelledby': tabsId + '-tab-default'
  },
    wrappedOriginalComponent
      ? React.createElement(wrappedOriginalComponent, Object.assign({}, props, { key: 'models-orig' }))
      : React.createElement('div', { className: 'frp-card frp-muted', key: 'models-missing' },
          tr('modelsMissing'))))
  if (visited.free) {
    kids.push(React.createElement('div', {
      key: 'panel-free',
      id: tabsId + '-panel-free',
      className: 'frp-panel',
      role: 'tabpanel',
      'aria-labelledby': tabsId + '-tab-free',
      hidden: active !== 'free'
    }, React.createElement(Section, { key: 'freeroute' })))
  }
  return React.createElement('div', { className: 'frp-tabpage' }, kids)
}


function freerouteModelsIntegration(slots) {
  let disposed = false
  let wrapped = null
  let fallbackDispose = null

  function bump() {
    // 注册后立即注销：两次变更在同一微任务 flush 前完成，导航不会看到临时行，
    // 但 slot 版本前进，内容出口（uSES 按 version 订阅）会重新读取 component。
    try {
      const d = slots.register({ name: 'settings.section', id: 'freeroute-bump' }, function () { return null })
      d()
    } catch (e) { }
  }

  function readModelsEntry() {
    try {
      const all = slots.entries('settings.section') || []
      for (const e of all) {
        if (e && e.options && e.options.id === 'models') return e
      }
    } catch (e) { }
    return null
  }

  function attempt() {
    if (disposed) return
    const models = readModelsEntry()
    if (models) {
      if (fallbackDispose) { try { fallbackDispose() } catch (e2) { } fallbackDispose = null }
      if (!models.__freerouteWrap) {
        wrapped = { entry: models, component: models.component }
        wrappedOriginalComponent = models.component
        try { models.__freerouteWrap = true } catch (e3) { }
        models.component = ModelsSectionWithFreeRoute
        bump()
        console.log('[freeroute] 已在 设置 → 模型 页内嵌「免费模型」入口（可逆包装内置模型页）')
      }
      return
    }
    // 宿主没有可包装的 models 条目（id 变更/模块缺失）时，退回独立设置页，
    // 保证面板永远可达；models 条目稍后出现的话上面分支会撤掉它。
    if (!fallbackDispose) {
      try {
        fallbackDispose = slots.register({ name: 'settings.section', id: 'freeroute-proxy', order: 11, label: 'freeroute' }, Section)
      } catch (e4) { fallbackDispose = null }
    }
  }

  function dispose() {
    disposed = true
    if (wrapped) {
      if (wrapped.entry.component === ModelsSectionWithFreeRoute) wrapped.entry.component = wrapped.component
      try { wrapped.entry.__freerouteWrap = false } catch (e) { }
      wrapped = null
      wrappedOriginalComponent = null
      bump()
    }
    if (fallbackDispose) { try { fallbackDispose() } catch (e) { } fallbackDispose = null }
  }

  return { attempt: attempt, dispose: dispose }
}

return {
  inject: ['slots', 'timer'],
  apply(ctx) {
    ctxRef = ctx
    const slots = ctx.slots
    styles.insert(CSS)
    slots.inject('settings.section', function () {
      const integ = freerouteModelsIntegration(slots)
      const stop = slots.subscribe('settings.section', integ.attempt)
      integ.attempt()
      return [stop, integ.dispose]
    })
  }
}
