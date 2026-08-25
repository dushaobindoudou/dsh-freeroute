// 端到端验证：SenseNova 内置上游（token.sensenova.cn，真实端点）。
// 运行：FREEROUTE_E2E_SNS_KEY=sk-… node test/e2e-sensenova.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.FREEROUTE_E2E_SNS_KEY
if (!KEY) { console.error('需要 FREEROUTE_E2E_SNS_KEY'); process.exit(1) }

const __fs = await import('node:fs')
const __os = await import('node:os')
globalThis.__nodeFs = { mkdirSync: __fs.mkdirSync, readFileSync: __fs.readFileSync, renameSync: __fs.renameSync, statSync: __fs.statSync, writeFileSync: __fs.writeFileSync }
globalThis.__nodeOs = { homedir: __os.homedir }
const CFG = __os.tmpdir() + '/freeroute-sns-e2e-' + process.pid + '.json'
try { __fs.unlinkSync(CFG) } catch { /* 不存在即跳过 */ }
process.env.FREEROUTE_CONFIG = CFG

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
function fakeSpawn({ argv, stdio }) {
  const spec = parseArgv(argv, stdio && stdio.stdin && stdio.stdin.data)
  let errText = ''
  const ctl = new AbortController()
  const queue = []; let finished = false; let notify = null
  const wake = () => { if (notify) { const n = notify; notify = null; n() } }
  const push = (s) => { queue.push(Buffer.from(s, 'utf8')); wake() }
  const stdout = { [Symbol.asyncIterator]() { return { async next() { while (queue.length === 0 && !finished) await new Promise((r) => { notify = r }); if (queue.length > 0) return { value: queue.shift(), done: false }; return { value: undefined, done: true } } } } }
  const done = (async () => {
    try {
      const resp = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.bodyData == null ? undefined : spec.bodyData, signal: ctl.signal })
      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      push('__FREEROUTE_HTTP_' + resp.status + '__\n')
      while (true) { const r = await reader.read(); if (r.done) break; push(dec.decode(r.value, { stream: true })) }
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
const services = {
  credentials: fakeCredentials,
  subprocess: { resolveExecutable: async () => '/usr/bin/curl', spawn: fakeSpawn },
  agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }), saveSelection: async () => {} },
}
const disposers = []
const adapters = new Map()
const fakeCtx = {
  llm: { registerAdapter: (routes, adapter) => { adapters.set(routes[0], adapter); return () => adapters.delete(routes[0]) } },
  timer: { timeout: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t) }, interval: (fn, ms) => { const t = setInterval(fn, ms); return () => clearInterval(t) } },
  get: (n) => services[n],
  effect(fn) { const d = fn(); if (d) disposers.push(d) },
}
const handlers = new Map()
const fakeHarness = { handle: (m, fn) => { handlers.set(m, fn); return () => handlers.delete(m) } }
const rpc = (m, a) => { const h = handlers.get(m); if (!h) throw new Error('no handler: ' + m); return h(a) }

const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'freeroute-dynamic', 'host.js'), 'utf8')
const makePlugin = new Function('harness', "'use strict'; return (async function () {\n" + body + "\n})()")
const plugin = await makePlugin(fakeHarness)
await plugin.apply(fakeCtx)
await new Promise((r) => setTimeout(r, 100))

store.set('FREEROUTE_SENSENOVA_API_KEY', KEY)
const adapter = adapters.get('freeroute')

console.log('■ 1. 探测 + 免费标记（freeModels 声明）')
const pr = await rpc('freeroute.probe', { id: 'sensenova' })
const st = await rpc('freeroute.state', {})
const sns = st.upstreams.find((u) => u.id === 'sensenova')
console.log('   探测:', JSON.stringify(pr.results[0]), '| 目录:', sns.modelsCount, '免费:', sns.freeCount)
if (sns.modelsCount === 0) { console.error('   ✗ 探测失败'); process.exit(1) }
const snsFree = st.models.filter((m) => m.id !== 'auto' && Array.isArray(m.via) && m.via.some((v) => v.upstream === 'sensenova'))
console.log('   选择器可见（sensenova 提供）:', snsFree.map((m) => m.id).join(', '))

console.log('■ 2. get-keys（面板「显示」）')
await rpc('freeroute.set-key', { id: 'sensenova', key: KEY })
const gk = await rpc('freeroute.get-keys', { id: 'sensenova' })
console.log('  ', gk.ok && gk.keys.length === 1 ? '✓ 返回 1 把完整 Key' : '✗ ' + JSON.stringify(gk))

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

console.log('■ 3. 实测免费模型（经插件流式）')
for (const m of ['sensenova-6.8-flash-lite', 'sensenova-6.7-flash-lite', 'deepseek-v4-flash']) {
  const r = await chat('sensenova/' + m)
  console.log('  ', r.err ? ('✗ ' + m + ' -> ' + r.err.code + ' ' + String(r.err.message).slice(0, 80)) : ('✓ ' + m + ' -> ' + JSON.stringify(r.text.slice(0, 20))))
}
const r2 = await chat('auto')
console.log('■ 4. auto:', r2.err ? '✗ ' + r2.err.code : '✓ ' + JSON.stringify(r2.text.slice(0, 24)))
try { __fs.unlinkSync(CFG) } catch { /* ignore */ }
process.exit(0)
