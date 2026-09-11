// FreeRoute 客户端（设置 → 模型 页集成）集成测试 —— node 原生运行，无需浏览器。
//
// 被测对象是 ../../client.js 的真实源码（与 cordis_define 提交的内容一致）。
// 客户端半边只依赖注入的全局：React / styles / host（useLang/makeT 在体内定义）。
// 页签形态的集成方式是「单属性换血」：把内置 models 条目的 component 换成包装
// 组件（options 原样保留，导航仍是一行「模型」），无 models 条目时退独立设置页。
// 本测试覆盖：
//   1) 有内置 models 条目 → component 被换血且可渲染（默认面板承载原组件）；
//   2) 无 models 条目 → 退回独立 freeroute-proxy 设置页；
//   3) models 条目晚出现 → 兜底页撤销、换血接管；
//   4) 重复 attempt 幂等（不双重换血）；
//   5) 停止（slots.inject 释放）→ component 还原、页签条守护与订阅全部撤销；
//   6) 源码契约：页签结构、role=tablist、无反引号。
//
// 运行：node freeroute-dynamic/test/client-integration.mjs

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const body = readFileSync(path.join(here, '..', 'client.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name) }
  else { failed++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')) }
}
const section = (t) => console.log('\n■ ' + t)

// ---------------------------------------------------------------- 客户端全局替身
const React = {
  // 与 React 一致地展平数组子节点（组件用 kids.push(...) + 数组传参）。
  createElement: function (type, props) {
    const raw = Array.prototype.slice.call(arguments, 2)
    const children = []
    const flatten = function (list) {
      for (const c of list) {
        if (Array.isArray(c)) flatten(c)
        else if (c !== null && c !== undefined && c !== false) children.push(c)
      }
    }
    flatten(raw)
    return { type: type, props: props || {}, children: children }
  },
  useState: function (init) { return [typeof init === 'function' ? init() : init, function () { }] },
  useRef: function (init) { return { current: init } },
  useEffect: function () { },
  useCallback: function (fn) { return fn },
  useId: function () { return 'frp-test' },
  useSyncExternalStore: function (subscribe, snapshot) { return snapshot() }
}
const styles = { insert: function () { return function () { } } }
const host = { call: function () { return Promise.resolve(null) } }

// ---------------------------------------------------------------- slots 服务替身
function makeSlots(modelsEntry) {
  const declared = new Set(['settings.section'])
  const registrations = []
  const injections = []
  const subscribers = []
  const entries = modelsEntry ? [modelsEntry] : []
  return {
    declared: declared,
    registrations: registrations,
    injections: injections,
    subscribers: subscribers,
    stock: entries,
    // 宿主侧条目表（内置 models 条目 + 我们的注册）——entries() 只读内置部分
    entries: function (key) { return key === 'settings.section' ? entries.slice() : [] },
    register: function (options, component) {
      const entry = { options: options, component: component, disposed: false }
      registrations.push(entry)
      return function () { entry.disposed = true }
    },
    inject: function (key, cb) {
      const rec = { key: key, cb: cb, ran: false, disposed: false, off: null }
      injections.push(rec)
      if (declared.has(key)) { rec.ran = true; rec.off = cb() }
      rec.stopFn = function () {
        rec.disposed = true
        const off = rec.off
        if (Array.isArray(off)) { for (const o of off) { if (typeof o === 'function') o() } }
        else if (typeof off === 'function') off()
      }
      return rec.stopFn
    },
    subscribe: function (key, fn) {
      const rec = { key: key, fn: fn, stopped: false }
      subscribers.push(rec)
      return function () { rec.stopped = true }
    },
    // 模拟宿主条目表变化（models 条目出现/消失）后通知订阅者
    notify: function () {
      for (const rec of subscribers) { if (!rec.stopped) rec.fn() }
    }
  }
}

function makeCtx(slots) {
  return {
    slots: slots,
    get: function () { return undefined },
    timeout: function () { return function () { } },
    interval: function () { return function () { } }
  }
}

function mount(slots) {
  const factory = new Function('React', 'styles', 'host', body)
  const plugin = factory(React, styles, host)
  const ctx = makeCtx(slots)
  plugin.apply(ctx)
  return ctx
}

// 内置「模型」设置页条目的替身：真实宿主里来自 dsh-client-ui-settings-models
function builtinModelsEntry() {
  function OriginalModels() { return { type: 'div', props: { className: 'dsw-stock' }, children: [] } }
  return { options: { id: 'models', label: '模型', order: 5 }, component: OriginalModels }
}

// ---------------------------------------------------------------- 1. 换血正常路径
section('1. 有内置 models 条目：component 被换血，默认面板承载原组件')
{
  const models = builtinModelsEntry()
  const orig = models.component
  const slots = makeSlots(models)
  mount(slots)
  check('models 条目 component 已被替换为包装组件', typeof models.component === 'function' && models.component !== orig && models.component.name === 'ModelsSectionWithFreeRoute')
  check('换血标记就位（防二次包装）', models.__freerouteWrap === true)
  check('条目 options 原样保留（导航仍是一行「模型」）', models.options.id === 'models' && models.options.label === '模型' && models.options.order === 5)
  const live = slots.registrations.filter((r) => !r.disposed && r.options.id !== 'freeroute-bump')
  check('不注册独立 freeroute 设置页', live.every((r) => r.options.id !== 'freeroute-proxy'), JSON.stringify(live.map((r) => r.options.id)))
  const bumps = slots.registrations.filter((r) => r.options.id === 'freeroute-bump')
  check('slot 版本已 bump（注册后立即注销）', bumps.length === 1 && bumps[0].disposed === true)
  // 渲染形态：frp-tabpage + 默认面板（tabpanel，内含原组件）
  const tree = models.component({})
  check('渲染 frp-tabpage 容器', tree && tree.props && tree.props.className === 'frp-tabpage', JSON.stringify(tree && tree.props))
  check('默认面板是 role=tabpanel 的 frp-models-scope', tree.children[0].props.role === 'tabpanel' && tree.children[0].props.className === 'frp-models-scope')
  check('面板 id/aria-labelledby 用 useId 前缀', tree.children[0].props.id === 'frp-test-panel-default' && tree.children[0].props['aria-labelledby'] === 'frp-test-tab-default')
  check('默认面板承载内置原组件', tree.children[0].children.length === 1 && tree.children[0].children[0].type === orig)
  check('未访问「免费」前不挂载免费面板（懒挂载）', tree.children.length === 1, String(tree.children.length))
}

// ---------------------------------------------------------------- 2. 无条目兜底
section('2. 宿主没有 models 条目：退回独立 freeroute-proxy 设置页')
{
  const slots = makeSlots(null)
  mount(slots)
  const fb = slots.registrations.filter((r) => !r.disposed && r.options.id === 'freeroute-proxy')
  check('注册 1 个独立设置页', fb.length === 1, String(fb.length))
  check('兜底页 label=freeroute + order 11（排在模型页之后）', fb[0] && fb[0].options.label === 'freeroute' && fb[0].options.order === 11)
  check('兜底页承载完整 Section 面板', typeof fb[0].component === 'function')
}

// ---------------------------------------------------------------- 3. 条目晚出现
section('3. models 条目晚出现：兜底页撤销，换血接管')
{
  const slots = makeSlots(null)
  mount(slots)
  const models = builtinModelsEntry()
  slots.stock.push(models)
  slots.notify()
  check('兜底页已撤销', slots.registrations.filter((r) => !r.disposed && r.options.id === 'freeroute-proxy').length === 0)
  check('models 条目已换血', models.__freerouteWrap === true && typeof models.component === 'function')
}

// ---------------------------------------------------------------- 4. 幂等
section('4. 重复 attempt 不双重换血')
{
  const models = builtinModelsEntry()
  const slots = makeSlots(models)
  mount(slots)
  const wrapped = models.component
  slots.notify()
  slots.notify()
  check('component 保持同一个包装函数', models.component === wrapped)
  check('仍只有一次 bump', slots.registrations.filter((r) => r.options.id === 'freeroute-bump').length === 1, String(slots.registrations.filter((r) => r.options.id === 'freeroute-bump').length))
}

// ---------------------------------------------------------------- 5. 可逆性
section('5. 停止：component 还原、订阅撤销、注册全部注销')
{
  const models = builtinModelsEntry()
  const orig = models.component
  const slots = makeSlots(models)
  mount(slots)
  check('停止前处于换血状态', models.__freerouteWrap === true && typeof models.component === 'function' && models.component !== orig)
  // 插件停止 = slots.inject 的释放（宿主在 fiber 停止时回调）
  const inj = slots.injections[0]
  check('settings.section 注入已运行', inj && inj.ran === true)
  inj.stopFn()
  check('component 已还原为内置原组件', models.component === orig)
  check('换血标记已清除', models.__freerouteWrap === false)
  check('条目订阅已停止', slots.subscribers.every((r) => r.stopped), JSON.stringify(slots.subscribers.map((r) => r.stopped)))
  check('注册全部注销', slots.registrations.every((r) => r.disposed))
  // 再触发一次通知也不应复活换血
  slots.notify()
  check('停止后条目表变化不复活换血', models.component === orig && models.__freerouteWrap === false)
}

// ---------------------------------------------------------------- 6. 源码契约
section('6. 源码契约：页签结构就位')
{
  check('页签条容器 frp-tabs + role=tablist', body.includes("'frp-tabs'") && body.includes("'tablist'"))
  check('两个页签「默认 | 免费」', body.includes("tabDefault") && body.includes("tabFree") && body.includes("'默认'") && body.includes("'免费'"))
  check('换血守卫与原组件还原都在', body.includes('__freerouteWrap') && body.includes('wrappedOriginalComponent'))
  check('页签条由 MutationObserver 常驻守护（React 重渲染挪走后自动归位）', body.includes('new view.MutationObserver'))
  check('无反引号（动态沙箱包裹约束）', !body.includes('`'))
}

// ---------------------------------------------------------------- 7. 面板渲染
// 「免费」面板全量渲染：带状态的 React 替身 + 完整 state，验证插件页同款
// 可展开卡片（卡片头 名称+描述+chevron，点击/键盘就地展开）。
function makeStatefulReact() {
  const st = { slots: [], cursor: 0, effects: [] }
  return {
    st: st,
    R: {
      createElement: React.createElement,
      useState: function (init) {
        const i = st.cursor++
        if (!(i in st.slots)) st.slots[i] = typeof init === 'function' ? init() : init
        return [st.slots[i], function (v) { st.slots[i] = typeof v === 'function' ? v(st.slots[i]) : v }]
      },
      useRef: function (init) {
        const i = st.cursor++
        if (!(i in st.slots)) st.slots[i] = { current: init }
        return st.slots[i]
      },
      useEffect: function (fn) { st.effects.push(fn) },
      useCallback: function (fn) { return fn },
      useId: function () { return 'frp-test' },
      useSyncExternalStore: function (subscribe, snapshot) { return snapshot() }
    },
    begin: function () { st.cursor = 0; st.effects = [] }
  }
}

const HOST_STATE = {
  version: '0.8.10-test', route: 'freeroute',
  endpoint: { base: 'http://127.0.0.1:3080/freeroute/v1' },
  currentSelection: { provider: 'freeroute', model: 'auto' },
  autoTakeover: true, autoInjected: false, globalProxy: '',
  totals: { requests: 12, ok: 10, failed: 2, tokensIn: 100, tokensOut: 200 },
  catalog: { remoteUrl: 'https://config.freetokenbox.com/freeroute.json', lastSyncAt: 1757000000000, lastCount: 10, lastFormat: 'native', lastSyncError: '' },
  models: [
    { id: 'auto', name: 'auto', contextWindow: 131072, via: [] },
    { id: 'vision-1', name: 'Vision One', contextWindow: 131072, via: [{ upstream: 'mod-vision', model: 'vision-1' }] }
  ],
  upstreams: [
    { id: 'mod-vision', name: 'Vision Up', priority: 0, enabled: true, configured: true, noAuth: false, keys: 2, modelsCount: 3, freeCount: 2, probedAt: 1757000000000,
      health: { state: 'ok', cooldownMs: 0, lastError: '', keyFails: [] },
      signupUrl: 'https://example.com/signup', tutorialUrl: '', tutorial: ['步骤一', '步骤二'] },
    { id: 'plain-1', name: 'Plain Up', priority: 1, enabled: false, configured: false, noAuth: true, keys: 0, modelsCount: 1, freeCount: 1, probedAt: 0,
      health: { state: 'cooling', cooldownMs: 30000, lastError: 'boom', keyFails: [{ index: 1, code: 401 }] },
      signupUrl: '', tutorialUrl: '', tutorial: [] }
  ],
  hiddenUpstreams: [{ id: 'gone-1', name: 'Gone Up' }]
}

await (async function () {
  section('7. 面板渲染：插件页同款可展开卡片')
  {
    const sr = makeStatefulReact()
    const host2 = {
      call: function (method) {
        if (method === 'freeroute.state') return Promise.resolve(HOST_STATE)
        return Promise.resolve({ ok: true })
      }
    }
    const factory = new Function('React', 'styles', 'host', body)
    const plugin = factory(sr.R, styles, host2)
    const slots = makeSlots(null)
    plugin.apply(makeCtx(slots))
    const fb = slots.registrations.filter((r) => !r.disposed && r.options.id === 'freeroute-proxy')[0]
    check('独立设置页承载 Section 面板', fb && typeof fb.component === 'function')

    // 第一遍：state 未到，形状守卫降级为加载卡（不炸设置槽）
    sr.begin()
    const loading = fb.component()
    check('state 未到时渲染守卫卡', loading && loading.props && loading.props.className === 'frp')

    // 跑 effect → host.call('freeroute.state') → 微任务回填 → 重渲染
    for (const fn of sr.st.effects) fn()
    await Promise.resolve()
    await Promise.resolve()
    sr.begin()
    const tree = fb.component()
    check('面板根节点 frp', tree && tree.props.className === 'frp')

    const kids = tree.children
    check('头部状态块在最前', kids[0].props.className === 'frp-head')
    const stack = kids[1]
    check('上游列表是卡片栈 frp-cards', stack.props.className === 'frp-cards', stack.props.className)
    const cards = stack.children
    check('每家上游一张卡（2 家）+ 隐藏恢复行', cards.length === 3, String(cards.length))
    const up0 = cards[0]
    check('上游卡类名 frp-ucard（未展开）', up0.props.className === 'frp-ucard', up0.props.className)
    const head0 = up0.children[0]
    check('卡片头 role=button + aria-expanded=false + tabIndex', head0.props.className === 'frp-ucard-head' && head0.props.role === 'button' && head0.props['aria-expanded'] === 'false' && head0.props.tabIndex === 0)
    check('卡片头：圆点 + 名称/摘要两行 + 操作 + chevron', head0.children.length === 4 && head0.children[0].props.className.indexOf('frp-dot') === 0 && head0.children[1].props.className === 'frp-ucard-text' && head0.children[1].children[0].children[0] === 'Vision Up' && String(head0.children[1].children[1].children[0]).indexOf('免费') >= 0 && head0.children[2].props.className === 'frp-pctl' && head0.children[3].props.className === 'frp-chev')
    check('未展开不渲染卡身', up0.children.length === 1)
    check('隐藏恢复行在卡片栈末尾', cards[2].props.className === 'frp-hiddenrow')

    // 点击卡片头 → 展开 → 卡身就位（密钥/测试/探测）
    head0.props.onClick()
    sr.begin()
    const tree2 = fb.component()
    const up0b = tree2.children[1].children[0]
    check('展开后卡类名 frp-ucard-open', up0b.props.className === 'frp-ucard frp-ucard-open', up0b.props.className)
    check('aria-expanded 同步为 true', up0b.children[0].props['aria-expanded'] === 'true')
    check('chevron 旋转态类名', up0b.children[0].children[3].props.className === 'frp-chev frp-chev-open')
    check('卡身 frp-ucard-body 承载详情', up0b.children[1].props.className === 'frp-ucard-body' && up0b.children[1].children[0].props.className === 'frp-pdetail')

    // 键盘可达：Enter 展开「模型」卡
    const modelsCard = tree2.children[2]
    check('模型卡同款形态', modelsCard.props.className === 'frp-ucard' && modelsCard.children[0].children[0].children[0].children[0] === '模型')
    modelsCard.children[0].props.onKeyDown({ key: 'Enter', preventDefault: function () { } })
    sr.begin()
    const tree3 = fb.component()
    const modelsCard3 = tree3.children[2]
    check('键盘 Enter 展开模型卡', modelsCard3.props.className === 'frp-ucard frp-ucard-open' && modelsCard3.children[1].props.className === 'frp-ucard-body')

    // 高级设置卡：展开后是字段分组（fgroup），非嵌套卡
    tree3.children[3].children[0].props.onClick()
    sr.begin()
    const tree4 = fb.component()
    const adv = tree4.children[3]
    check('高级设置展开为字段分组', adv.children[1].props.className === 'frp-ucard-body' && adv.children[1].children[0].props.className === 'frp-fgroup' && adv.children[1].children[1].props.className === 'frp-fgroup')
    check('面板收尾不再有独立 frp-card 块', tree4.children.every(function (k) { return k.props.className !== 'frp-card' }))
  }
})()

console.log('\nclient-integration: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1) }
console.log('ALL PASS')
