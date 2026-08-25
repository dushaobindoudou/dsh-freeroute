// 端到端验证：B.AI 上游（真实 api.b.ai，经 HTTP 代理）。
// 运行：NODE_USE_ENV_PROXY=1 https_proxy=http://127.0.0.1:7890 \
//       FREEROUTE_E2E_BAI_KEY=sk-… node test/e2e-bai.mjs
// rig 的 fakeSpawn 用 fetch 转发，代理由 Node 的 NODE_USE_ENV_PROXY 提供。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.FREEROUTE_E2E_BAI_KEY
if (!KEY) { console.error('需要 FREEROUTE_E2E_BAI_KEY'); process.exit(1) }

function parseArgv(argv, stdinData) {
  let method = 'GET'; let url = ''; const headers = {}; let bodyData = null
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-X') method = argv[++i]
    else if (a === '-H') { const h = argv[++i]; const c = h.indexOf(':'); headers[h.slice(0, c).trim().toLowerCase()] = h.slice(c + 1).trim() }
    else if (a === '--data-binary') { const v = argv[++i]; bodyData = v === '@-' ? stdinData : v }
    else if (a === '--proxy') i++
    else if (a.startsWith('http')) url = a
  }
  return { method, url, headers, bodyData }
}
const spawnLog = []
function fakeSpawn({ argv, stdio }) {
  spawnLog.push(argv.slice())
  const spec = parseArgv(argv, stdio && stdio.stdin && stdio.stdin.data)
  let errText = ''
  const ctl = new AbortController()
  const queue = []; let finished = false; let notify = null
  const wake = () => { if (notify) { const n = notify; notify = null; n() } }
  const push = (s) => { queue.push(Buffer.from(s, 'utf8')); wake() }
  const stdout = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (queue.length === 0 && !finished) await new Promise((r) => { notify = r })
          if (queue.length > 0) return { value: queue.shift(), done: false }
          return { value: undefined, done: true }
        }
      }
    }
  }
  const done = (async () => {
    try {
      const resp = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.bodyData == null ? undefined : spec.bodyData, signal: ctl.signal })
      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      push('__FREEROUTE_HTTP_' + resp.status + '__\n')
      while (true) {
        const r = await reader.read()
        if (r.done) break
        push(dec.decode(r.value, { stream: true }))
      }
    } catch (e) { errText = String((e && e.message) || e) } finally { finished = true; wake() }
    return { exitCode: errText ? 1 : 0 }
  })()
  return { stdout, stderr: { async *iterator() { if (errText) yield errText } }, done, kill() { ctl.abort() } }
}

const store = new Map()
const fakeCredentials = {
  async resolve(ref) { return store.has(ref) ? { value: store.get(ref) } : undefined },
  async set(ref, v) { store.set(ref, v) },
  async unset(ref) { store.delete(ref) },
  async describe(ref) { return { configured: store.has(ref), source: store.has(ref) ? 'keyring' : null, writable: true } },
}
function deepMerge(a, b) { const out = JSON.parse(JSON.stringify(a || {})); for (const k of Object.keys(b || {})) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) out[k] = deepMerge(out[k] || {}, b[k]); else out[k] = b[k] } return out }
let userCfg = { upstreams: { 'b-ai': { custom: { proxy: process.env.E2E_BAI_PROXY || 'http://127.0.0.1:7890' } } } }
const watchers = []
const fakeSettings = {
  register(ns, schemaFn) { return { get: () => schemaFn(structuredClone(userCfg)), watch(cb) { watchers.push(cb); return () => {} } } },
  async update(ns, patch) { deepMerge(userCfg, structuredClone(patch)); for (const w of watchers) w() },
  async replace(ns, v) { userCfg = structuredClone(v); for (const w of watchers) w() },
  describe() { return [{ ns: 'free-proxy', user: structuredClone(userCfg) }] }
}
const adapters = new Map()
const fakeLlm = { registerAdapter: (routes, adapter) => { adapters.set(routes[0], adapter); return () => adapters.delete(routes[0]) } }
const services = {
  settings: fakeSettings, credentials: fakeCredentials, subprocess: { resolveExecutable: async () => '/usr/bin/curl', spawn: fakeSpawn },
  webServer: { port: 0, register: () => () => {} }, commands: { register: () => () => {} },
  agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }), saveSelection: async () => {} },
}
const disposers = []
const fakeCtx = {
  llm: fakeLlm,
  timer: { timeout: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t) }, interval: (fn, ms) => { const t = setInterval(fn, ms); return () => clearInterval(t) } },
  get: (n) => services[n],
  effect(fn) { const d = fn(); if (d) disposers.push(d) },
}
const handlers = new Map()
const fakeHarness = { handle: (m, fn) => { handlers.set(m, fn); return () => handlers.delete(m) } }
const rpc = (m, a) => { const h = handlers.get(m); if (!h) throw new Error('no handler: ' + m); return h(a) }


// JSON 配置层：注入 fs/os 能力并指向临时文件（绝不动真实 ~/.dsh/freeroute.json）
const __fs = await import('node:fs')
const __os = await import('node:os')
globalThis.__nodeFs = { mkdirSync: __fs.mkdirSync, readFileSync: __fs.readFileSync, renameSync: __fs.renameSync, statSync: __fs.statSync, writeFileSync: __fs.writeFileSync }
globalThis.__nodeOs = { homedir: __os.homedir }
const CFG = __os.tmpdir() + '/freeroute-test-' + process.pid + '.json'
try { __fs.unlinkSync(CFG) } catch { /* 不存在即跳过 */ }
process.env.FREEROUTE_CONFIG = CFG

const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'freeroute-dynamic', 'host.js'), 'utf8')
const makePlugin = new Function('harness', "'use strict'; return (async function () {\n" + body + "\n})()")
const plugin = await makePlugin(fakeHarness)
console.log('■ 0. 插件加载 ok')
await plugin.apply(fakeCtx)
await new Promise((r) => setTimeout(r, 100))

store.set('FREEROUTE_BAI_API_KEY', KEY)
const adapter = adapters.get('freeroute')

console.log('■ 1. b-ai 状态（内置 + proxy 生效 + 探测）')
const st = await rpc('freeroute.state', {})
const bai = st.upstreams.find((u) => u.id === 'b-ai')
console.log('   name:', bai.name, '| configured:', bai.configured, '| signup:', bai.signupUrl)
const pr = await rpc('freeroute.probe', { id: 'b-ai' })
const st2 = await rpc('freeroute.state', {})
const bai2 = st2.upstreams.find((u) => u.id === 'b-ai')
console.log('   探测:', JSON.stringify(pr.results[0]), '| 目录:', bai2.modelsCount, '免费:', bai2.freeCount)
if (bai2.modelsCount === 0) { console.error('   ✗ 探测失败（代理没生效？需 NODE_USE_ENV_PROXY=1 https_proxy=…）'); process.exit(1) }
if (bai2.freeCount !== 4) { console.error('   ✗ 免费标记数量不对，期望 4，实际', bai2.freeCount); process.exit(1) }
console.log('   ✓ 探测经代理成功，freeModels 声明 4 个免费')

async function chat(model) {
  const parts = []
  let err = null
  try {
    for await (const ck of adapter.stream({ provider: 'freeroute', model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 500 })) {
      if (ck.type === 'text-delta') parts.push(ck.text)
    }
  } catch (e) { err = e }
  return { text: parts.join(''), err }
}

console.log('■ 2. 逐个实测 4 个免费模型（经插件流式）')
for (const m of ['deepseek-v4-flash', 'hy3', 'mimo-v2.5', 'deepseek-v4-flash-vision-exp']) {
  const r = await chat('b-ai/' + m)
  if (r.err) console.log('   ✗', m, '->', r.err.code, String(r.err.message).slice(0, 80))
  else console.log('   ✓', m, '->', JSON.stringify(r.text.slice(0, 30)))
}

console.log('■ 3. auto 派发（b-ai 与 opencode 同款模型跨厂商优先）')
const r2 = await chat('auto')
console.log('   结果:', JSON.stringify((r2.text || '').slice(0, 50)), r2.err ? '| err=' + r2.err.code : '| ✓')

console.log('■ 4. 每上游 proxy 进 argv（配置层不再被 sanitizeConfig 剥掉）')
const baiArgv = spawnLog.filter(function (a) { return a.some(function (x) { return String(x).indexOf('api.b.ai') >= 0 }) })
const okProxy = baiArgv.length > 0 && baiArgv.every(function (a) {
  const pi = a.indexOf('--proxy')
  return pi > 0 && a[pi + 1] === 'http://127.0.0.1:7890'
})
console.log('   b-ai 请求数:', baiArgv.length, okProxy ? '| ✓ 全部带 --proxy http://127.0.0.1:7890' : '| ✗ 未带 --proxy！')
if (!okProxy) process.exit(1)
process.exit(0)
