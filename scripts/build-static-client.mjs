// Build lib/client.js from freeroute-dynamic/client.js (dynamic sandbox UI)
// into the static web-client module format: window.__ModuleLoader__.load()
// factory + Connection RPC carrier + native setInterval polling.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
let src = readFileSync(join(root, 'freeroute-dynamic', 'client.js'), 'utf8')

function mustReplace(s, from, to) {
  if (!s.includes(from)) throw new Error('marker not found: ' + from.slice(0, 60))
  return s.split(from).join(to)
}

// 1. RPC names: host.call('freeroute.kebab-name', …) → callHost('camelName', …)
const NAMES = {
  'freeroute.state': 'state',
  'freeroute.set-key': 'setKey',
  'freeroute.apply-patch': 'applyPatch',
  'freeroute.catalog.sync': 'catalogSync',
  'freeroute.probe': 'probe',
  'freeroute.test': 'test',
  'freeroute.get-keys': 'getKeys',
}
for (const [ep, m] of Object.entries(NAMES)) {
  // set-key/clear-key/apply-patch/… only travel through act(); state/test/
  // catalog.sync are also called directly — cover both, require at least one.
  const before = src
  src = src.split("host.call('" + ep + "'").join("callHost('" + m + "'")
  src = src.split("act('" + ep + "'").join("act('" + m + "'")
  if (src === before) throw new Error('no call site found for ' + ep)
}
// act()'s generic dispatcher receives already-mapped names; retarget it first.
src = mustReplace(src, 'host.call(method, args)', 'callHost(method, args)')
if (src.includes('host.call')) throw new Error('residual host.call: ' + src.split('\n').filter((l) => l.includes('host.call')).join(' | ').slice(0, 120))

// 2. Polling: sandbox timer service → native setInterval (real browser ctx).
// Single-line marker appears in both Section and the models-page wrapper; the
// replacement returns a disposer so the shared `d()` cleanup keeps working.
src = mustReplace(src, 'const d = ctxRef.interval(tick, 5000)',
  'const d = (function () { const h = setInterval(tick, 5000); return function () { clearInterval(h) } })()')

// 2b. lint: unused params
src = mustReplace(src, 'function Section(props) {', 'function Section(_props) {')
src = src.split('.catch(function (e) { })').join('.catch(function () { })')

// 3. Drop the ctxRef module-level capture comment+var (static client has a real ctx in apply).
src = mustReplace(src,
  `// ctx 是 apply(ctx) 的参数，组件渲染时不在作用域内；用模块级引用转交。
// （styles / host / React 是 client 求值环境提供的全局，ctx 不是。）
let ctxRef = null

`, '')

// 4. Tail: dynamic plugin return → static module exports.
const tailMarker = `return {
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
}`
if (!src.includes(tailMarker)) throw new Error('client tail marker not found')
src = src.slice(0, src.indexOf(tailMarker)).trimEnd()

const out = `/**
 * dsh-freeroute — client half (web).
 *
 * 设置 → 模型 页内嵌：包装 dsh 内置模型设置页（可逆换血 entry.component），
 * 标题后插「免费」按钮、DeepSeek 行上方自绘 freeroute 配置行（auto 自动路
 * 由，可编辑不可删），两者弹出模态承载完整 FreeRoute 面板（上游卡片/启停/
 * 优先级/申请教程/密钥保存/连通测试/健康统计、一键集成向导、远程目录、自
 * 定义上游表单）。宿主无 models 条目时退回独立 freeroute 设置页。数据经
 * host \`freeroute\` Remote 命名空间（Connection RPC \`/api\`）读写，密钥只进
 * credentials 服务。
 *
 * Ported from freeroute-dynamic/client.js — keep both sides in sync.
 */
window.__ModuleLoader__.load({
	id: "dsh-freeroute",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		const react = require("react");
		const React = react;

		let connectionSvc = null;

		/**
		 * Invoke one host \`freeroute/<method>\` Remote endpoint over the client
		 * Connection RPC carrier. Returns the business value; business
		 * \`{ ok: false, error }\` shapes stay return values for the panel's
		 * error display paths (matching the host contract).
		 */
		const callHost = async (method, request) => {
			if (connectionSvc === null) throw new Error("连接服务尚未就绪");
			const envelope = await connectionSvc.rpc.call("/api", "freeroute/" + method, {
				args: { request: request === undefined ? null : request },
			});
			if (envelope !== null && typeof envelope === "object" && envelope.ok === false) {
				throw new Error((envelope.error && envelope.error.message) || "调用失败");
			}
			if (envelope !== null && typeof envelope === "object" && envelope.ok === true) {
				return envelope.value;
			}
			return envelope;
		};

${src}

		const inject = ["connection", "slots"];

		function apply(c) {
			connectionSvc = c.get("connection");
			const slots = c.get("slots");
			if (slots === undefined) return;
			// Scoped style sheet: removed with the plugin fiber.
			const styleEl = document.createElement("style");
			styleEl.textContent = CSS;
			document.head.appendChild(styleEl);
			// 设置 → 模型 页内嵌集成：包装内置 models 条目（停止时还原）。
			c.effect(() => slots.inject("settings.section", () => {
				const integ = freerouteModelsIntegration(slots);
				const stop = slots.subscribe("settings.section", integ.attempt);
				integ.attempt();
				return [stop, integ.dispose];
			}), "dsh-freeroute: models-page integration");
			return () => { styleEl.remove(); };
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
`

writeFileSync(join(root, 'lib', 'client.js'), out)
console.log('lib/client.js written:', out.length, 'bytes')
