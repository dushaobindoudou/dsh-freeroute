// FreeRoute 客户端（设置 → 模型 页集成）集成测试 —— node 原生运行，无需浏览器。
//
// 被测对象是 ../../client.js 的真实源码（与 cordis_define 提交的内容一致）。
// 客户端半边只依赖注入的全局：React / useLang / makeT / styles / host。这里
// 用最小等价实现替换它们，验证「官方 settings.models.footer 子插槽」集成的
// 三条路径：
//   1) 宿主已声明 footer 子槽 → 直接注册 footer 条目，不再注册独立设置页；
//   2) 宿主没有该声明 → 宽限期后回落独立设置页；
//   3) footer 声明晚到 → 兜底页被撤销，footer 条目接管（不会出现两个入口）。
// 另外断言已彻底移除 0.8.7 的 DOM 换血（MutationObserver / removeChild /
// entry.component 改写）——那是本次 UI 兼容性优化的核心。
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
  // 与 React 一致地展平数组子节点（面板用 kids.push(...) + 数组传参）。
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
const useLang = function () { return 'zh' }
const makeT = function () { return function (key) { return key } }
const styles = { insert: function () { return function () { } } }
const host = { call: function () { return Promise.resolve(null) } }

// ---------------------------------------------------------------- slots 服务替身
function makeSlots() {
  const declared = new Set()
  const registrations = []
  const injections = []
  return {
    declared: declared,
    registrations: registrations,
    injections: injections,
    register: function (options, component) {
      const entry = { options: options, component: component, disposed: false }
      registrations.push(entry)
      return function () { entry.disposed = true }
    },
    inject: function (key, cb) {
      const rec = { key: key, cb: cb, dispose: null, ran: false, disposed: false }
      injections.push(rec)
      if (declared.has(key)) { rec.ran = true; rec.dispose = cb() }
      return function () {
        rec.disposed = true
        if (rec.dispose) rec.dispose()
      }
    },
    // 模拟宿主稍后声明子插槽：等待中的 inject 回调按契约同步运行。
    declare: function (key) {
      declared.add(key)
      for (const rec of injections) {
        if (rec.key === key && !rec.ran && !rec.disposed) { rec.ran = true; rec.dispose = rec.cb() }
      }
    }
  }
}

function makeCtx(slots) {
  const disposers = []
  const timers = []
  return {
    slots: slots,
    timers: timers,
    disposers: disposers,
    timeout: function (fn, ms) { timers.push({ fn: fn, ms: ms, cancelled: false }); return function () { } },
    interval: function () { return function () { } },
    get: function () { return undefined },
    effect: function (fn) { const d = fn(); if (d) disposers.push(d); return function () { } },
    runTimers: function () { for (const t of timers) t.fn() }
  }
}

function loadPlugin() {
  // 客户端半边自带的 i18n（useLang/makeT/STRINGS）与图标都在函数体内定义，
  // 注入的全局只有三样：React、styles、host。
  const factory = new Function('React', 'styles', 'host', body)
  return factory(React, styles, host)
}

const mount = (slots) => {
  const ctx = makeCtx(slots)
  const plugin = loadPlugin()
  plugin.apply(ctx)
  return ctx
}

// ---------------------------------------------------------------- 1. 正常路径
section('1. 宿主已声明 settings.models.footer：直接注册官方扩展区')
{
  const slots = makeSlots()
  slots.declared.add('settings.models.footer')
  const ctx = mount(slots)
  const footer = slots.registrations.filter((r) => r.options.name === 'settings.models.footer')
  check('注册 1 个 footer 条目', footer.length === 1, String(footer.length))
  check('footer 条目 id=freeroute', footer[0] && footer[0].options.id === 'freeroute')
  check('footer 条目带 order', footer[0] && typeof footer[0].options.order === 'number')
  check('不再注册独立设置页（旧兜底）', slots.registrations.every((r) => r.options.name !== 'settings.section'))
  // 宽限期到点也不该再挂兜底页
  ctx.runTimers()
  check('宽限期到点后依然只有一个入口', slots.registrations.every((r) => r.options.name !== 'settings.section'))
  // 组件可渲染：返回 frp-footer 树
  const tree = footer[0].component({})
  check('footer 组件渲染 frp-footer 容器', tree && tree.props && tree.props.className === 'frp-footer', JSON.stringify(tree && tree.props))
  const head = tree.children[0]
  check('标题行 role=button + aria-expanded', head && head.props && head.props.role === 'button' && head.props['aria-expanded'] === 'true')
  check('面板随插槽内容渲染（含完整 Section）', tree.children.length === 2 && typeof tree.children[1].children[0].type === 'function')
}

// ---------------------------------------------------------------- 2. 兜底路径
section('2. 宿主没有 footer 子槽：宽限期后回落独立设置页')
{
  const slots = makeSlots()
  const ctx = mount(slots)
  check('启动时不注册任何条目（等待父插槽声明）', slots.registrations.length === 0, String(slots.registrations.length))
  check('挂起了 footer 声明的等待', slots.injections.length === 1 && slots.injections[0].key === 'settings.models.footer')
  check('宽限期 2.5s', ctx.timers.length === 1 && ctx.timers[0].ms === 2500, JSON.stringify(ctx.timers))
  ctx.runTimers()
  const fb = slots.registrations.filter((r) => r.options.name === 'settings.section')
  check('回落注册 1 个独立设置页', fb.length === 1, String(fb.length))
  check('兜底页 id=freeroute + label', fb[0] && fb[0].options.id === 'freeroute' && fb[0].options.label === 'freeroute')
}

// ---------------------------------------------------------------- 3. 晚到声明
section('3. footer 声明晚到：兜底页撤销，footer 条目接管')
{
  const slots = makeSlots()
  const ctx = mount(slots)
  ctx.runTimers()
  const before = slots.registrations.filter((r) => r.options.name === 'settings.section' && !r.disposed)
  check('先有 1 个兜底设置页', before.length === 1)
  slots.declare('settings.models.footer')
  check('兜底页已被撤销', slots.registrations.filter((r) => r.options.name === 'settings.section' && !r.disposed).length === 0)
  check('footer 条目已注册', slots.registrations.filter((r) => r.options.name === 'settings.models.footer' && !r.disposed).length === 1)
}

// ---------------------------------------------------------------- 4. 可逆性
section('4. 插件停止：所有注册随 fiber 撤销')
{
  const slots = makeSlots()
  slots.declared.add('settings.models.footer')
  const ctx = mount(slots)
  check('停止前 footer 条目在册', slots.registrations.some((r) => r.options.name === 'settings.models.footer' && !r.disposed))
  for (const d of ctx.disposers) d()
  check('停止后 footer 条目撤销', slots.registrations.every((r) => r.disposed), JSON.stringify(slots.registrations.map((r) => [r.options.name, r.disposed])))
}

// ---------------------------------------------------------------- 5. 源码契约
section('5. 源码契约：DOM 换血已移除，官方插槽就位')
{
  check('使用官方 footer 子插槽', body.includes("'settings.models.footer'"))
  check('不再使用 MutationObserver 改宿主 DOM', !body.includes('new MutationObserver') && !body.includes('.MutationObserver'))
  check('不再改写内置 models 条目的 component', !body.includes('__freerouteWrap') && !body.includes('wrappedOriginalComponent'))
  check('不再自绘页签条', !body.includes('frp-tabs') && !body.includes('frp-tabpage'))
  check('无反引号（动态沙箱包裹约束）', !body.includes('`'))
}

console.log('\nclient-integration: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1) }
console.log('ALL PASS')
