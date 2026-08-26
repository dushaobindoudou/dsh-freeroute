// Runtime smoke test for dsh-freeroute lib/index.js (host half).
// Mounts the plugin on a real cordis root with faked host services and mock
// HTTP upstreams, then asserts: adapter registration, Typert Remote delegation
// (freeroute namespace), patch validation + persistence, transparent failover
// before first token, and auto-takeover of the default model.
// Full behavioral coverage (137 assertions) lives in
// freeroute-dynamic/test/integration.mjs against the same source body.
import { createServer } from 'node:http'
import { readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'))

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
// 各命名空间的用户层（settings.yaml 语义）：agent-default-model 的显式
// 配置落在这里，takeover 的「不打扰既有默认」纪律据此判定
const docStore = {}
const fakeSettings = {
  register(ns, schemaFn) {
    return {
      get: () => schemaFn(structuredClone(store)),
      watch(cb) { watchers.push(cb); return () => { } },
    }
  },
  async update(ns, patch) { deepMerge(store, structuredClone(patch)); for (const w of watchers) w() },
  async replace(ns, v) { store = structuredClone(v); for (const w of watchers) w() },
  async mutate(ns, ops) {
    for (const op of ops) {
      if (op.op === 'unset') delete docStore[op.path[0]]
    }
    for (const w of watchers) w()
  },
  section(ns) { return docStore[ns] },
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
  // 与真实 dsh 一致：saveSelection 写 settings 用户层（docStore 可见）
  saveSelection: async (s) => {
    saveCalls.push(structuredClone(s)); currentSel = s
    docStore['agent-default-model'] = structuredClone(s)
  },
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
assert.deepEqual(exported, ['applyPatch', 'catalogSync', 'clearKey', 'getKeys', 'probe', 'removeUpstream', 'restoreUpstream', 'setDefault', 'setKey', 'state', 'test'], '11 个 Remote 方法全部带标记')
assert.equal(remote.typertRemote.namespace, 'freeroute', 'RPC 命名空间为 freeroute')

console.log('■ 2. Remote 委托与状态')
const st = await remote.state({})
assert.equal(st.version, pkg.version, '版本号（与 package.json 同步）')
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

console.log('■ 4b. 单模型降级（无候选/全挂时走 auto 兜底）')
// a) 模型的唯一上游在冷却：v0.7.2 前直接 NO_UPSTREAM 中断整轮，现降级 auto 继续跑
const r1b = await collect(adapter.stream({ provider: 'freeroute', model: 'ma', messages: msg('hi') }))
assert.equal(r1b.text, 'Mock reply OK', '唯一上游冷却时单模型降级 auto 成功')
// b) 模型的候选全部失败：同样降级
const pc = await remote.applyPatch({ patch: { upstreams: { 'mock-c': { enabled: true, custom: { baseUrl: b(portFail), noAuth: true, models: [{ id: 'mc', name: 'MC', contextWindow: 32768 }], defaultModel: 'mc' } } }, order: ['mock-c', 'mock-a', 'mock-b'] } })
assert.equal(pc.ok, true, '补一个必挂上游 mock-c')
const r1c = await collect(adapter.stream({ provider: 'freeroute', model: 'mc', messages: msg('hi') }))
assert.equal(r1c.text, 'Mock reply OK', '候选全挂时单模型降级 auto 成功')
// c) 请求本身的问题（图片内容）换哪家也没用：不降级、原样报错
let imgErr = null
try {
  await collect(adapter.stream({ provider: 'freeroute', model: 'mc', messages: [{ id: 'm2', role: 'user', content: [{ type: 'image', url: 'x' }], source: { kind: 'user' } }] }))
} catch (e) { imgErr = e }
assert.equal(String(imgErr && imgErr.code), 'UNSUPPORTED_CONTENT', '不支持的内容不触发降级')

console.log('■ 5. 删除上游')
const rm = await remote.removeUpstream({ id: 'mock-b' })
assert.equal(rm.ok, true, '删除已配置上游成功')
assert.equal((await remote.removeUpstream({ id: 'mock-b' })).ok, false, '重复删除被拒')
assert.equal((await remote.removeUpstream({ id: 'no-such' })).ok, false, '删除不存在上游报错')
const st3 = await remote.state({})
assert.ok(!st3.upstreams.some((u) => u.id === 'mock-b'), '上游列表不再含 mock-b')

console.log('■ 5b. 内置/远程上游标记删除 + 增量同步不复活 + 恢复')
// 本地目录服务器：先 2 条（sensenova 内置同名 + cerebras 远程新增），再改内容
let catalogBody = { upstreams: [
  { id: 'sensenova', name: 'SenseNova 商汤日日新', baseUrl: 'https://token.sensenova.cn/v1', keyRef: 'FREEROUTE_SENSENOVA_API_KEY' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', keyRef: 'FREEROUTE_CEREBRAS_API_KEY' },
] }
const catPort = await listen((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(catalogBody))
})
await remote.applyPatch({ patch: { catalog: { remoteUrl: 'http://127.0.0.1:' + catPort + '/freeroute.json' } } })
const s1 = await remote.catalogSync({})
assert.equal(s1.ok, true, '目录同步成功')
assert.equal(s1.count, 2, '目录条目数')
assert.ok((await remote.state({})).upstreams.some((u) => u.id === 'cerebras'), '远程新增上游进入列表')
// 删除内置 sensenova（标记式：不真删配置）
const rm2 = await remote.removeUpstream({ id: 'sensenova' })
assert.equal(rm2.ok, true, '内置上游删除成功（removed 标记）')
const stB = await remote.state({})
assert.ok(!stB.upstreams.some((u) => u.id === 'sensenova'), '删除后列表不再显示')
assert.ok((stB.hiddenUpstreams || []).some((h) => h.id === 'sensenova'), 'hiddenUpstreams 含 sensenova')
assert.ok(stB.upstreams.some((u) => u.id === 'cerebras'), '其它远程上游不受影响')
// 改目录内容再同步：sensenova 变更 + cerebras 撤下 —— 已删除的不复活
catalogBody = { upstreams: [
  { id: 'sensenova', name: 'SenseNova 改名', baseUrl: 'https://token.sensenova.cn/v2', keyRef: 'FREEROUTE_SENSENOVA_API_KEY' },
] }
const s2 = await remote.catalogSync({})
assert.equal(s2.ok, true, '第二次同步成功')
assert.equal(s2.changed, 1, '按厂商增量：恰 1 条变更')
assert.equal(s2.dropped, 1, '远端撤下 1 条')
const stC = await remote.state({})
assert.ok(!stC.upstreams.some((u) => u.id === 'sensenova'), '远程同步不复活已删除上游')
assert.ok(!stC.upstreams.some((u) => u.id === 'cerebras'), '远端撤下的条目从远端层移除')
// 恢复：回到列表且拿到增量后的新内容
const rs = await remote.restoreUpstream({ id: 'sensenova' })
assert.equal(rs.ok, true, '恢复成功')
const stD = await remote.state({})
const sns = stD.upstreams.find((u) => u.id === 'sensenova')
assert.ok(sns, '恢复后重新可见')
assert.equal(sns.name, 'SenseNova 改名', '恢复的是增量合并后的最新内容')
assert.ok(!(stD.hiddenUpstreams || []).some((h) => h.id === 'sensenova'), 'hiddenUpstreams 已清')

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

console.log('■ 6b. 接管纪律（显式默认不被覆盖 / 持久化标记 / 可恢复）')
const nSaves = saveCalls.length
// a) 用户显式配置了默认模型：非显式巡检绝不覆盖（v0.7.2 修复的根因）
currentSel = { provider: 'vol', model: 'glm-5-3' }
docStore['agent-default-model'] = { provider: 'vol', model: 'glm-5-3' }
await remote.applyPatch({ patch: { order: [] } })
await new Promise((r) => setTimeout(r, 50))
assert.equal(currentSel.provider, 'vol', '显式默认不被自动接管覆盖')
assert.equal(saveCalls.length, nSaves, '未产生新的接管写入')
// 上一步若清了接管标记，配置文件里不应再残留 autoInjected
const cfgA = JSON.parse(readFileSync(process.env.FREEROUTE_CONFIG, 'utf8'))
assert.ok(!cfgA.autoInjected, '用户改走后接管标记被清除（不再重复接管）')

// b) 显式打开「自动接管」开关 = 明确授权：可覆盖显式默认，原值持久备份
await remote.applyPatch({ patch: { autoTakeover: true } })
await new Promise((r) => setTimeout(r, 50))
assert.equal(currentSel.provider, 'freeroute', '显式开启开关授权接管')
const cfgB = JSON.parse(readFileSync(process.env.FREEROUTE_CONFIG, 'utf8'))
assert.equal(cfgB.autoInjected, true, '接管标记持久化到配置文件')
assert.deepEqual(cfgB.takeoverBackup, { provider: 'vol', model: 'glm-5-3' }, '原默认持久备份')

// c) 用户手动把默认改走：巡检尊重选择，不重复接管
currentSel = { provider: 'vol', model: 'glm-5-3' }
docStore['agent-default-model'] = { provider: 'vol', model: 'glm-5-3' }
await remote.applyPatch({ patch: { order: [] } })
await new Promise((r) => setTimeout(r, 50))
assert.equal(currentSel.provider, 'vol', '手动改走后不再重复接管')

// d) 关闭自动接管：恢复接管前的用户原默认，清除标记
await remote.applyPatch({ patch: { autoTakeover: false } })
await new Promise((r) => setTimeout(r, 50))
assert.deepEqual(currentSel, { provider: 'vol', model: 'glm-5-3' }, '关闭开关恢复原默认')
const cfgD = JSON.parse(readFileSync(process.env.FREEROUTE_CONFIG, 'utf8'))
assert.ok(!cfgD.autoInjected && !cfgD.takeoverBackup, '标记与备份清除')
// 重新显式开启，保持后续断言环境一致
await remote.applyPatch({ patch: { autoTakeover: true } })
await new Promise((r) => setTimeout(r, 50))
assert.equal(currentSel.provider, 'freeroute', '显式开启再次接管')

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
