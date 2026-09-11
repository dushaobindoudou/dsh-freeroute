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

console.log('\nclient-integration: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1) }
console.log('ALL PASS')
