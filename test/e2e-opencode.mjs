// 端到端验证：用真实 OpenCode Zen 端点 + 用户提供的关键跑 freeroute 插件全链路
// （目录探测 / 免费模型识别 / 流式派发 / 模型级失败转移 / Key 轮换游标）。
// 复用 integration.mjs 的 fakeSpawn（argv → fetch 真网络）机制。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.FREEROUTE_E2E_KEY
if (!KEY) { console.error('需要 FREEROUTE_E2E_KEY 环境变量'); process.exit(1) }

// ---- 伪 subprocess：把插件构造的 curl argv 映射成真实 fetch ----
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

// ---- 伪服务 ----
const store = new Map()
const fakeCredentials = {
  async resolve(ref) { return store.has(ref) ? { value: store.get(ref) } : undefined },
  async set(ref, v) { store.set(ref, v) },
  async unset(ref) { store.delete(ref) },
  async describe(ref) { return { configured: store.has(ref), source: store.has(ref) ? 'keyring' : null, writable: true } },
}
let userCfg = {}
const fakeSettings = { describe: async () => [{ ns: 'freeroute', user: userCfg }], update: async (_ns, p) => { userCfg = deepMerge(userCfg, p) }, replace: async (_ns, u) => { userCfg = u } }
function deepMerge(a, b) { const out = JSON.parse(JSON.stringify(a || {})); for (const k of Object.keys(b || {})) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) out[k] = deepMerge(out[k] || {}, b[k]); else out[k] = b[k] } return out }
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
console.log('■ 0. 插件加载，inject =', plugin.inject.join(', '))
await plugin.apply(fakeCtx)
await new Promise((r) => setTimeout(r, 100))

store.set('FREEROUTE_OPENCODE_API_KEY', KEY)
const adapter = adapters.get('freeroute')

console.log('■ 1. 目录探测（真实 GET /models）')
const models = await adapter.listModels()
const free = models.filter((x) => /free/i.test(x.id))
console.log('   模型总数:', models.length, '| 含 free:', free.map((x) => x.id).join(', '))
if (models.length === 0) { console.error('   ✗ 目录为空'); process.exit(1) }
console.log('   ✓ 探测成功')

async function chat(model) {
  const parts = []
  let finish = null
  const stream = adapter.stream({ provider: 'freeroute', model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 400 })
  try { for await (const ck of stream) { if (ck.type === 'text-delta') parts.push(ck.text); if (ck.type === 'finish') finish = ck } } catch (e) { return { err: e } }
  return { text: parts.join(''), finish }
}

console.log('■ 2. auto 全链路（真实流式 + 模型级失败转移：deepseek-v4-flash-free 不可用会自动换）')
const r1 = await chat('auto')
console.log('   结果:', JSON.stringify(r1.text || '').slice(0, 80), r1.err ? ('| err=' + r1.err.code + ' ' + String(r1.err.message).slice(0, 100)) : '')
if (!r1.err && r1.text) console.log('   ✓ auto 出字成功')
else if (r1.err) console.log('   ✗ 失败:', r1.err.code)

console.log('■ 3. 逐个直连免费模型（探测后完整名单，显式指定验证）')
const st = await rpc('freeroute.state', {})
const oc = st.upstreams.find((u) => u.id === 'opencode')
console.log('   opencode 目录:', oc.modelsCount, '个模型, 免费', oc.freeCount, ', 默认', oc.defaultModel)
const allFree = (st.models.filter((x) => Array.isArray(x.via) && x.via.some((v) => v.upstream === 'opencode' && /free/i.test(v.model))))
for (const f of allFree) {
  const vid = f.via.find((v) => v.upstream === 'opencode').model
  const r = await chat(vid)
  if (r.err) console.log('   ✗', vid, '->', r.err.code, String(r.err.message).slice(0, 60))
  else console.log('   ✓', vid, '->', JSON.stringify((r.text || '').slice(0, 40)))
}

console.log('■ 4. 二次 auto（学习到的默认应直接命中，不再撞死模型）')
const r2 = await chat('auto')
console.log('   结果:', JSON.stringify(r2.text || '').slice(0, 60), r2.err ? ('| err=' + r2.err.code) : '| ✓')
process.exit(0)
