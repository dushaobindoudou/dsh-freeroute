// Runtime smoke test for dsh-freeroute lib/index.js (host half).
// Mounts the plugin on a real cordis root with faked host services and mock
// HTTP upstreams, then asserts: adapter registration, Typert Remote delegation
// (freeroute namespace), patch validation + persistence, transparent failover
// before first token, and auto-takeover of the default model.
// Full behavioral coverage (65 assertions) lives in
// freeroute-dynamic/test/integration.mjs against the same source body.
import { createServer } from 'node:http'
import { readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

const here = dirname(fileURLToPath(import.meta.url))
// JSON 配置层指向临时文件：绝不触碰真实 ~/.dsh/freeroute.json
process.env.FREEROUTE_CONFIG = join(tmpdir(), 'freeroute-smoke-' + process.pid + '.json')
try { unlinkSync(process.env.FREEROUTE_CONFIG) } catch { /* 不存在即跳过 */ }
const mod = await import(join(here, '..', 'lib', 'index.js'))

// ---------------------------------------------------------------- mock 上游
const j = (o) => 'data: ' + JSON.stringify(o) + '\n\n'
const sse = (res, chunks) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); for (const c of chunks) res.write(c); res.end() }
const mkOk = () => (req, res) => sse(res, [
  j({ choices: [{ delta: { content: 'Mock ' } }] }),
  j({ choices: [{ delta: { content: 'reply ' } }] }),
  j({ choices: [{ delta: { content: 'OK' } }] }),
  j({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3 } }),
  'data: [DONE]\n\n',
])
const mkFail = () => (req, res) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'mock upstream failure', type: 'server_error' } })) }

const listen = async (handler) => {
  const srv = createServer(handler)
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  return srv.address().port
}
const portOk = await listen(mkOk())
const portFail = await listen(mkFail())
const b = (p) => 'http://127.0.0.1:' + p + '/v1'

// ---------------------------------------------------------------- 伪服务
let store = {}
const watchers = []
const deepMerge = (t, p) => {
  for (const k of Object.keys(p)) {
    const v = p[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) t[k] = {}
      deepMerge(t[k], v)
    } else t[k] = structuredClone(v)
  }
  return t
}
const fakeSettings = {
  register(ns, schemaFn) {
    return {
      get: () => schemaFn(structuredClone(store)),
      watch(cb) { watchers.push(cb); return () => { } },
    }
  },
  async update(ns, patch) { deepMerge(store, structuredClone(patch)); for (const w of watchers) w() },
  async replace(ns, v) { store = structuredClone(v); for (const w of watchers) w() },
  describe() { return [{ ns: 'free-proxy', user: structuredClone(store) }] },
}

const keys = new Map()
const fakeCredentials = {
  resolve: async (ref) => ({ value: keys.get(ref) || '' }),
  describe: async (ref) => ({ configured: keys.has(ref), source: 'test', writable: true }),
  set: async (ref, v) => { keys.set(ref, v) },
  unset: async (ref) => { keys.delete(ref) },
}

function parseArgv(argv, stdinData) {
  let method = 'GET'
  let url = ''
  const headers = {}
  let bodyData = null
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-X') method = argv[++i]
    else if (a === '-H') { const h = argv[i + 1]; i++; const c = h.indexOf(':'); headers[h.slice(0, c).trim().toLowerCase()] = h.slice(c + 1).trim() }
    else if (a === '--data-binary') { const v = argv[++i]; bodyData = v === '@-' ? stdinData : v }
    else if (a.startsWith('http')) url = a
  }
  return { method, url, headers, bodyData }
}
function fakeSpawn({ argv, stdio }) {
  const spec = parseArgv(argv, stdio && stdio.stdin && stdio.stdin.data)
  let errText = ''
  const ctl = new AbortController()
  const queue = []
  let finished = false
  let notify = null
  const wake = () => { if (notify) { const n = notify; notify = null; n() } }
  const push = (s) => { queue.push(Buffer.from(s, 'utf8')); wake() }
  const stdout = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (queue.length === 0 && !finished) await new Promise((r) => { notify = r })
          if (queue.length > 0) return { value: queue.shift(), done: false }
          return { value: undefined, done: true }
        },
      }
    },
  }
  const done = (async () => {
    try {
      const resp = await fetch(spec.url, {
        method: spec.method, headers: spec.headers,
        body: spec.bodyData == null ? undefined : spec.bodyData,
        signal: ctl.signal,
      })
      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      for (;;) {
        const r = await reader.read()
        if (r.done) break
        push(dec.decode(r.value, { stream: true }))
      }
      push(dec.decode())
      push('\n__FREEROUTE_HTTP_' + resp.status + '__\n')
      finished = true; wake()
      return { exitCode: 0 }
    } catch (e) {
      errText = String((e && e.message) || e)
      finished = true; wake()
      return { exitCode: 1 }
    }
  })()
  return {
    stdout,
    collected: { stderr: { readFrom: () => ({ text: () => errText }) } },
    terminate() { ctl.abort() },
    done,
  }
}

const adapters = new Map()
// 模型页呈现已改为客户端完成（包装内置页自绘行），宿主不再调用
// registerConfigurableProviders —— 故意不实现它，误调用会直接炸测试。
const fakeLlm = {
  registerAdapter: (routes, adapter) => { adapters.set(routes[0], adapter); return () => adapters.delete(routes[0]) },
}
const saveCalls = []
let currentSel = { provider: 'deepseek', model: 'deepseek-chat' }
const fakeDefaultModel = {
  currentSelection: () => currentSel,
  saveSelection: async (s) => { saveCalls.push(structuredClone(s)); currentSel = s },
}

// ---------------------------------------------------------------- 挂载
const root = new Context()
for (const [key, value] of [
  ['llm', fakeLlm],
  ['timer', {
    timeout: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t) },
    interval: (fn, ms) => { const t = setInterval(fn, ms); return () => clearInterval(t) },
  }],
  ['settings', fakeSettings],
  ['credentials', fakeCredentials],
  ['subprocess', { resolveExecutable: async () => '/usr/bin/curl', spawn: fakeSpawn }],
  ['webServer', { port: 0, register: () => () => { } }],
  ['commands', { register: () => () => { } }],
  ['agentDefaultModel', fakeDefaultModel],
]) {
  root.provide(key)
  root.set(key, value)
}
await root.plugin(mod)
const adapter = adapters.get('freeroute')
const remote = root.get('freeroute')

// ---------------------------------------------------------------- 断言
const msg = (t) => [{ id: 'm1', role: 'user', content: [{ type: 'text', text: t }], source: { kind: 'user' } }]
async function collect(gen) {
  let text = ''
  let usage = null
  let finish = null
  for await (const ck of gen) {
    if (ck.type === 'text-delta') text += ck.text
    if (ck.type === 'usage') usage = ck.usage
    if (ck.type === 'finish') finish = ck.reason
  }
  return { text, usage, finish }
}

console.log('■ 1. 挂载与注册')
assert.deepEqual(mod.inject, ['llm', 'timer', 'settings', 'credentials', 'subprocess'], 'inject 声明（核心服务为硬依赖）')
assert.ok(adapter != null, 'llm 适配器注册到 freeroute')
assert.ok(remote !== undefined, 'freeroute Remote 服务已注册')
const exported = remoteMethods(remote).map((m) => m.exportName ?? m.method).sort()
assert.deepEqual(exported, ['applyPatch', 'catalogSync', 'clearKey', 'getKeys', 'probe', 'removeUpstream', 'setDefault', 'setKey', 'state', 'test'], '10 个 Remote 方法全部带标记')
assert.equal(remote.typertRemote.namespace, 'freeroute', 'RPC 命名空间为 freeroute')

console.log('■ 2. Remote 委托与状态')
const st = await remote.state({})
assert.equal(st.version, '0.5.0', '版本号')
assert.equal(st.upstreams.length, 4, '内置上游 4 个（opencode/b-ai/openrouter/sensenova）')
assert.ok(st.upstreams.every((u) => Array.isArray(u.tutorial) && u.tutorial.length >= 3), '每家内置上游带申请教程')
assert.ok((await remote.setKey({ id: 'openrouter', key: 'smoke-or-key' })).ok, '预置 openrouter Key')
const models = await adapter.listModels()
assert.ok(models.some((m) => m.id === 'auto'), '模型列表含 auto')
assert.ok(models.length > 3, '配 Key 后免费可用模型进列表')
assert.ok(models.every((m) => m.id === 'auto' || m.free !== false), '列表只含免费模型')

console.log('■ 3. patch 校验与持久化')
const evil = await remote.applyPatch({ patch: { evilField: 1 } })
assert.equal(evil.ok, false, '非法字段被拒绝')
const legal = await remote.applyPatch({
  patch: {
    upstreams: {
      'mock-a': { enabled: true, custom: { baseUrl: b(portFail), noAuth: true, models: [{ id: 'ma', name: 'MA', contextWindow: 32768 }], defaultModel: 'ma' } },
      'mock-b': { enabled: true, custom: { baseUrl: b(portOk), noAuth: true, models: [{ id: 'mb', name: 'MB', contextWindow: 32768 }], defaultModel: 'mb' } },
    },
    order: ['mock-a', 'mock-b'],
  },
})
assert.equal(legal.ok, true, '合法 patch 通过')
const savedCfg = JSON.parse(readFileSync(process.env.FREEROUTE_CONFIG, 'utf8'))
assert.ok(savedCfg.upstreams && savedCfg.upstreams['mock-a'], 'JSON 配置文件持久化生效')
assert.equal(savedCfg.order[0], 'mock-a', 'order 写入 JSON 配置文件')
assert.ok(typeof savedCfg.upstreams['mock-a'].custom.baseUrl === 'string', 'custom 字段落盘')

console.log('■ 3b. 就绪联动（免鉴权 patch 立即触发默认模型接管）')
await new Promise((r) => setTimeout(r, 30))
assert.equal(saveCalls.length >= 1, true, '免鉴权上游就绪后已接管默认模型')
assert.deepEqual(saveCalls[0], { provider: 'freeroute', model: 'auto' }, '接管目标 freeroute/auto')

console.log('■ 4. 透明故障转移（出字前切换）')
const r1 = await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('hi') }))
assert.equal(r1.text, 'Mock reply OK', 'mock-a(502) 失败后切到 mock-b 成功')
assert.deepEqual({ in: r1.usage.inputTokens, out: r1.usage.outputTokens }, { in: 5, out: 3 }, 'usage 透传')
assert.equal(r1.finish.kind, 'stop', '正常结束')
const st2 = await remote.state({})
const ua = st2.upstreams.find((u) => u.id === 'mock-a')
assert.equal(ua.health.state, 'cooling', '失败上游进入冷却')
assert.equal(ua.stats.failed >= 1, true, '失败计数')

console.log('■ 5. 删除上游')
const rm = await remote.removeUpstream({ id: 'mock-b' })
assert.equal(rm.ok, true, '删除已配置上游成功')
assert.equal((await remote.removeUpstream({ id: 'mock-b' })).ok, false, '重复删除被拒')
assert.equal((await remote.removeUpstream({ id: 'no-such' })).ok, false, '删除不存在上游报错')
const st3 = await remote.state({})
assert.ok(!st3.upstreams.some((u) => u.id === 'mock-b'), '上游列表不再含 mock-b')

console.log('■ 6. 密钥与自动接管')
const setKey = await remote.setKey({ id: 'sensenova', key: 'sns-test' })
assert.equal(setKey.ok, true, 'setKey 经 Remote 生效')
assert.equal(keys.get('FREEROUTE_SENSENOVA_API_KEY'), 'sns-test', '密钥进入 credentials')
// 免鉴权上游启用（3b 的 patch）与密钥保存都会立刻触发就绪检查 → 接管，
// 不再只依赖 8s 轮询；接管目标与一次性语义保持不变。
assert.equal(saveCalls.length >= 1, true, '就绪后已接管默认模型')
assert.deepEqual(saveCalls[0], { provider: 'freeroute', model: 'auto' }, '接管目标 freeroute/auto')
await new Promise((r) => setTimeout(r, 9500))
assert.equal(saveCalls.length, 1, '接管只发生一次（takeoverDone 门控）')

// ■ 9. 静态构建产物契约：客户端必须解包 typert {ok,value} 信封；
// 宿主必须声明核心服务依赖（否则先于服务启动时快照 undefined）。
{
  const libClient = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(libClient.includes('envelope.ok === true') && libClient.includes('return envelope.value'), '静态客户端解包 typert 信封（曾致面板崩溃）')
  const libHost = readFileSync(join(here, '..', 'lib', 'index.js'), 'utf8')
  const m = libHost.match(/export const inject = \[([^\]]*)\]/)
  assert.ok(m && m[1].includes("'settings'") && m[1].includes("'credentials'") && m[1].includes("'subprocess'"), '静态宿主 inject 含 settings/credentials/subprocess')
}

console.log('\nsmoke: all assertions passed ✓')
process.exit(0)
