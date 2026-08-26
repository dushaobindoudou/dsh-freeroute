// FreeRoute 动态插件集成测试（node 原生运行，无需 dsh）
//
// 被测对象是 ../../host.js 的真实源码（与 cordis_define 提交的内容完全一致）。
// 沙箱服务（llm/settings/credentials/subprocess/webServer/commands/agentDefaultModel）
// 在此用 node 等价实现替换；上游用真实 HTTP 服务器模拟，从而端到端验证：
// 适配器注册、模型列表、多上游透明故障转移、错误暴露、鉴权、目录同步、
// patch 校验、删除上游、自动接管。
//
// 运行：node freeroute-dynamic/test/integration.mjs

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// JSON 配置层：注入 fs/os 能力并指向临时文件（绝不动真实 ~/.dsh/freeroute.json）
const __fs = await import('node:fs')
const __os = await import('node:os')
globalThis.__nodeFs = { mkdirSync: __fs.mkdirSync, readFileSync: __fs.readFileSync, renameSync: __fs.renameSync, statSync: __fs.statSync, writeFileSync: __fs.writeFileSync }
globalThis.__nodeOs = { homedir: __os.homedir }
const CFG = __os.tmpdir() + '/freeroute-test-' + process.pid + '.json'
try { __fs.unlinkSync(CFG) } catch { /* 不存在即跳过 */ }
process.env.FREEROUTE_CONFIG = CFG

const pkg = JSON.parse(readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8'))
const body = readFileSync(path.join(here, '..', 'host.js'), 'utf8')
if (body.includes('`')) throw new Error('host.js 含反引号，无法用 Function 包装（请改用引号字符串）')

let passed = 0
let failed = 0
const failures = []
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name) }
  else { failed++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')) }
}
const section = (t) => console.log('\n■ ' + t)

// ---------------------------------------------------------------- mock 上游
const sse = (res, chunks) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); for (const c of chunks) res.write(c); res.end() }
const j = (o) => 'data: ' + JSON.stringify(o) + '\n\n'

const mkOk = () => (req, res) => sse(res, [
  j({ choices: [{ delta: { content: 'Mock ' } }] }),
  j({ choices: [{ delta: { content: 'reply ' } }] }),
  j({ choices: [{ delta: { content: 'OK' } }] }),
  j({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3 } }),
  'data: [DONE]\n\n'
])
const mkRich = () => (req, res) => sse(res, [
  j({ choices: [{ delta: { reasoning_content: 'think ' } }] }),
  j({ choices: [{ delta: { reasoning_content: 'hard' } }] }),
  j({ choices: [{ delta: { content: 'Answer ' } }] }),
  j({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"Be' } }] } }] }),
  j({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ijing"}' } }] } }] }),
  j({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 2, completion_tokens: 9 } }),
  'data: [DONE]\n\n'
])
const mkFail = () => (req, res) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'mock upstream failure', type: 'server_error' } })) }
const mkEmpty = () => (req, res) => sse(res, ['data: [DONE]\n\n'])
const mkAuth = () => (req, res) => {
  if ((req.headers.authorization || '') !== 'Bearer good-key') {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'bad key', code: 401 } }))
    return
  }
  sse(res, [
    j({ choices: [{ delta: { content: 'AuthOK' } }] }),
    j({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    'data: [DONE]\n\n'
  ])
}

const servers = {}
const listen = async (name, handler) => {
  const srv = createServer(handler)
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  servers[name] = srv
  return srv.address().port
}
const portOk = await listen('ok', mkOk())
const portRich = await listen('rich', mkRich())
const portFail = await listen('fail', mkFail())
const portEmpty = await listen('empty', mkEmpty())
const portAuth = await listen('auth', mkAuth())
const b = (p) => 'http://127.0.0.1:' + p + '/v1'

const catNative = {
  upstreams: [{
    id: 'remote-a', name: 'Remote A', baseUrl: b(portOk), noAuth: true,
    note: '测试远程目录', models: [{ id: 'ra-model', name: 'RA', contextWindow: 65536 }]
  }]
}
const portCatNative = await listen('catNative', (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(catNative)) })
const catModelsDev = {
  providers: {
    'remote-b': {
      name: 'Remote B', base_url: b(portOk),
      models: {
        'rb-model': { name: 'RB', limit: { context: 131072 }, cost: { input: 0, output: 0 } },
        'rb-paid': { name: 'RB Paid', limit: { context: 131072 }, cost: { input: 1, output: 2 } }
      }
    }
  }
}
const portCatMd = await listen('catMd', (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(catModelsDev)) })
const portCatBad = await listen('catBad', (req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('not json') })

// ---------------------------------------------------------------- 伪服务
const handlers = new Map()
const fakeHarness = { handle: (m, fn) => { handlers.set(m, fn); return () => handlers.delete(m) } }
const rpc = (m, a) => { const h = handlers.get(m); if (!h) throw new Error('no handler: ' + m); return h(a) }

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
      watch(cb) { watchers.push(cb); return () => {} }
    }
  },
  async update(ns, patch) { deepMerge(store, structuredClone(patch)); for (const w of watchers) w() },
  async replace(ns, v) { store = structuredClone(v); for (const w of watchers) w() },
  describe() { return [{ ns: 'free-proxy', user: structuredClone(store) }] }
}

const keys = new Map()
const fakeCredentials = {
  resolve: async (ref) => ({ value: keys.get(ref) || '' }),
  describe: async (ref) => ({ configured: keys.has(ref), source: 'test', writable: true }),
  set: async (ref, v) => { keys.set(ref, v) },
  unset: async (ref) => { keys.delete(ref) }
}

function parseArgv(argv, stdinData) {
  let method = 'GET'
  let url = ''
  const headers = {}
  let bodyData = null
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
const TRAILER_RE = /__FREEROUTE_HTTP_(\d{3})__/
const spawnCalls = []
function fakeSpawn({ argv, stdio }) {
  spawnCalls.push(argv.slice())
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
        }
      }
    }
  }
  const done = (async () => {
    try {
      const resp = await fetch(spec.url, {
        method: spec.method, headers: spec.headers,
        body: spec.bodyData == null ? undefined : spec.bodyData,
        signal: ctl.signal
      })
      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      while (true) {
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
    done
  }
}
const fakeSubprocess = { resolveExecutable: async () => '/usr/bin/curl', spawn: fakeSpawn }

const adapters = new Map()
// 模型页呈现已改为客户端完成（包装内置页自绘行），宿主不再调用
// registerConfigurableProviders —— 这里故意不实现它，误调用会直接炸测试。
const fakeLlm = {
  registerAdapter: (routes, adapter) => { adapters.set(routes[0], adapter); return () => adapters.delete(routes[0]) }
}

const webRegs = []
const fakeWebServer = { port: 0, register: (spec) => { webRegs.push(spec); return () => {} } }
const fakeCommands = { register: () => () => {} }
let currentSel = { provider: 'deepseek', model: 'deepseek-chat' }
const saveCalls = []
const fakeDefaultModel = {
  currentSelection: () => currentSel,
  saveSelection: async (s) => { saveCalls.push(structuredClone(s)); currentSel = s }
}

const services = {
  settings: fakeSettings, credentials: fakeCredentials, subprocess: fakeSubprocess,
  webServer: fakeWebServer, commands: fakeCommands, agentDefaultModel: fakeDefaultModel
}
const disposers = []
const fakeCtx = {
  llm: fakeLlm,
  timer: {
    timeout: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t) },
    interval: (fn, ms) => { const t = setInterval(fn, ms); return () => clearInterval(t) }
  },
  get: (n) => services[n],
  effect(fn) { const d = fn(); if (d) disposers.push(d) }
}

// ---------------------------------------------------------------- 加载插件
const makePlugin = new Function('harness', "'use strict'; return (async function () {\n" + body + "\n})()")
const plugin = await makePlugin(fakeHarness)
await plugin.apply(fakeCtx)
const adapter = adapters.get('freeroute')
const state = async () => rpc('freeroute.state', {})

async function collect(gen) {
  const chunks = []
  let text = ''
  let usage = null
  let finish = null
  for await (const ck of gen) {
    chunks.push(ck)
    if (ck.type === 'text-delta') text += ck.text
    if (ck.type === 'usage') usage = ck.usage
    if (ck.type === 'finish') finish = ck.reason
  }
  return { chunks, text, usage, finish }
}
const msg = (t) => [{ id: 'm1', role: 'user', content: [{ type: 'text', text: t }], source: { kind: 'user' } }]

section('1. 插件启动与适配器注册')
check('llm 适配器注册到 freeroute 路由', adapter != null)
check('RPC 处理器已注册（state 等）', handlers.has('freeroute.state') && handlers.has('freeroute.apply-patch') && handlers.has('freeroute.set-key'))
{
  const st = await state()
  check('版本号 v' + pkg.version + '（package.json 注入）', st.version === pkg.version, st.version)
  check('内置上游 4 个（opencode/b-ai/openrouter/sensenova）', st.upstreams.length === 4, String(st.upstreams.length))
  check('每家内置上游带申请教程', st.upstreams.every((u) => Array.isArray(u.tutorial) && u.tutorial.length >= 3))
  check('模型列表含 auto', st.models.some((m) => m.id === 'auto'))
  check('未配 Key 时只展示 auto（免费且可用才展示）', st.models.length === 1, JSON.stringify(st.models.map(function (m) { return m.id })))
  const rk1 = await rpc('freeroute.set-key', { id: 'openrouter', key: 'or-test-key' })
  check('set-key 成功', rk1.ok === true, JSON.stringify(rk1))
  const st1b = await state()
  check('配 Key 后该上游免费模型出现（探测或种子，不锚定具体 id）', st1b.models.length > 1, JSON.stringify(st1b.models.map(function (m) { return m.id }).slice(0, 6)))
  check('列表里除 auto 外全部 free（付费不展示）', st1b.models.every(function (m) { return m.id === 'auto' || m.free === true }), JSON.stringify(st1b.models.filter(function (m) { return m.id !== 'auto' && m.free !== true })))
  const rk1c = await rpc('freeroute.clear-key', { id: 'openrouter' })
  check('clear-key 还原现场（后续 section 候选池不含真实网络上游）', rk1c.ok === true)
  check('自动接管默认开启', st.autoTakeover === true)
  check('本次进程尚未接管', st.autoInjected === false)
  check('state 不再含 settingsPage（模型页呈现已移到客户端）', st.settingsPage === undefined, JSON.stringify(st.settingsPage))
}

section('2. patch 写入：自定义 mock 上游（模拟 UI 操作路径）')
{
  const r = await rpc('freeroute.apply-patch', {
    patch: {
      order: ['mock-fail', 'mock-ok'],
      upstreams: {
        'mock-fail': { enabled: true, custom: { noAuth: true, baseUrl: b(portFail), models: [{ id: 'test-model', name: 'T', contextWindow: 8192 }], defaultModel: 'test-model', freeModels: ['test-model'] } },
        'mock-ok': { enabled: true, custom: { noAuth: true, baseUrl: b(portOk), models: [{ id: 'test-model', name: 'T', contextWindow: 8192 }], defaultModel: 'test-model', freeModels: ['test-model'] } }
      }
    }
  })
  check('apply-patch 接受合法 patch', r.ok === true, JSON.stringify(r))
  const st = await state()
  check('上游变为 6 个（4 内置 + 2 自定义）', st.upstreams.length === 6, String(st.upstreams.length))
  check('排序：mock-fail 第 1、mock-ok 第 2', st.upstreams[0].id === 'mock-fail' && st.upstreams[1].id === 'mock-ok')
  check('自定义标记 source=custom', st.upstreams[0].source === 'custom')
  const neg1 = await rpc('freeroute.apply-patch', { patch: { evilField: 1 } })
  check('拒绝未知字段', neg1.ok === false && /不允许的字段/.test(neg1.error))
  const neg2 = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'BAD_ID': { enabled: true } } } })
  check('拒绝非法上游 id', neg2.ok === false)
}

section('3. 透明故障转移：mock-fail(502) → mock-ok')
{
  const r = await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('ping') }))
  check('最终拿到 mock-ok 文本 "Mock reply OK"', r.text === 'Mock reply OK', JSON.stringify(r.text))
  check('usage 正确（5 入 3 出）', r.usage && r.usage.inputTokens === 5 && r.usage.outputTokens === 3, JSON.stringify(r.usage))
  check('finish=stop', r.finish && r.finish.kind === 'stop')
  const hasStart = r.chunks.some((c) => c.type === 'block-start' && c.blockType === 'text')
  const hasEnd = r.chunks.some((c) => c.type === 'block-end' && c.block.type === 'text' && c.block.text === 'Mock reply OK')
  const usageIdx = r.chunks.findIndex((c) => c.type === 'usage')
  const finishIdx = r.chunks.findIndex((c) => c.type === 'finish')
  check('流协议完整：block-start/delta/block-end/usage/finish', hasStart && hasEnd && usageIdx >= 0 && finishIdx > usageIdx)
  const st = await state()
  const mf = st.upstreams.find((u) => u.id === 'mock-fail')
  const mo = st.upstreams.find((u) => u.id === 'mock-ok')
  check('mock-fail 计 1 次失败并进入冷却', mf.stats.failed >= 1 && mf.health.state !== 'up', JSON.stringify(mf.health))
  check('mock-ok 计 1 次成功', mo.stats.ok >= 1)
  check('模型列表含 mock 上游模型（通用名）', (await adapter.listModels()).some((m) => m.id === 'test-model'))
}

section('3b. 每上游 proxy 透传 + freeModels 声明标记')
{
  // proxy 值只要进 argv 且位于 URL 之前即可（真实 curl 语义：--proxy 作用于整个请求）。
  // fakeSpawn 的 parseArgv 跳过 --proxy 直连本地 mock，验证的是配置层链路：
  // apply-patch -> sanitizeConfig -> effectiveMap -> attemptWithKey argv。
  const before = spawnCalls.length
  const reg = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-pr': { enabled: true, custom: { noAuth: true, baseUrl: b(portOk), proxy: 'http://127.0.0.1:7890', models: [{ id: 'pr-model', name: 'PR' }], defaultModel: 'pr-model', freeModels: ['pr-model'] } } } } })
  check('带 proxy + freeModels 的自定义上游注册成功', reg.ok === true, JSON.stringify(reg))
  const r = await collect(adapter.stream({ provider: 'freeroute', model: 'pr-model', messages: msg('ping') }))
  check('带 proxy 配置的请求正常出字', r.text === 'Mock reply OK', JSON.stringify(r.text))
  const chatArgv = spawnCalls.slice(before).filter(function (a) { return a.some(function (x) { return String(x).indexOf('/chat/completions') >= 0 }) })[0] || []
  const pi = chatArgv.indexOf('--proxy')
  const ci = chatArgv.findIndex(function (x) { return String(x).indexOf('/chat/completions') >= 0 })
  check('curl argv 含 --proxy 且在 URL 之前', pi > 0 && chatArgv[pi + 1] === 'http://127.0.0.1:7890' && ci > pi + 1, JSON.stringify(chatArgv))
  const st3b = await state()
  const mpr = st3b.upstreams.find(function (u) { return u.id === 'mock-pr' })
  check('freeModels 声明标记（模型名不带 free 字样）', mpr.modelsCount === 1 && mpr.freeCount === 1, JSON.stringify({ mc: mpr.modelsCount, fc: mpr.freeCount }))
  check('声明免费模型进入选择器列表', (await adapter.listModels()).some(function (m) { return m.id === 'pr-model' }))
  const rm3b = await rpc('freeroute.remove-upstream', { id: 'mock-pr' })
  check('清理 mock-pr', rm3b.ok === true)
}

section('3c. 请求体内容透传（块数组与裸字符串两种形态）')
{
  // 回归守护：serializeMessages 曾把裸字符串 content 展平成空串，模型收到
  // 空消息仍返回 200，测试全绿但用户实际拿到的是「空消息回复」。
  const seenBodies = []
  const portBody = await listen('bodycap', (req, res) => {
    let body = ''
    req.on('data', function (c) { body += c })
    req.on('end', function () {
      seenBodies.push(body)
      mkOk()(req, res)
    })
  })
  await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-body': { enabled: true, custom: { noAuth: true, baseUrl: b(portBody), models: [{ id: 'body-free', name: 'B' }], defaultModel: 'body-free' } } } } })
  // 块数组（dsh 契约形态）
  const r1 = await collect(adapter.stream({ provider: 'freeroute', model: 'body-free', messages: [{ role: 'user', content: [{ type: 'text', text: '块数组消息' }] }], maxTokens: 32 }))
  check('块数组 content 出字', r1.text === 'Mock reply OK', JSON.stringify(r1.text))
  // 裸字符串（OpenAI 原生形态，防御性兼容）
  const r2 = await collect(adapter.stream({ provider: 'freeroute', model: 'body-free', messages: [{ role: 'user', content: '裸字符串消息' }], maxTokens: 32 }))
  check('裸字符串 content 出字', r2.text === 'Mock reply OK', JSON.stringify(r2.text))
  check('上游收到的两条消息均非空', seenBodies.length >= 2 && seenBodies.every(function (x) { return x.indexOf('块数组消息') >= 0 || x.indexOf('裸字符串消息') >= 0 }), JSON.stringify(seenBodies))
  const rm3c = await rpc('freeroute.remove-upstream', { id: 'mock-body' })
  check('清理 mock-body', rm3c.ok === true)
}

section('3d. 非标网关：chatPath + requestExtra（model 可省略）')
{
  // 模拟 GMI autoroute 一类网关：路径非 /chat/completions，请求体要求
  // mode 字段且不传 model。
  const seen = []
  const portAR = await listen('autoroute', (req, res) => {
    if (req.url !== '/ie/recommendation/autoroute') { res.writeHead(404); res.end('{}'); return }
    let body = ''
    req.on('data', function (c) { body += c })
    req.on('end', function () {
      seen.push(body)
      try {
        const o = JSON.parse(body)
        if (o.mode !== 'balanced' || o.model !== undefined) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'expect mode=balanced and no model' } })); return }
      } catch (e) { res.writeHead(400); res.end('{}'); return }
      mkOk()(req, res)
    })
  })
  const reg = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-ar': { enabled: true, custom: { noAuth: true, baseUrl: 'http://127.0.0.1:' + portAR + '/ie/recommendation', chatPath: '/autoroute', requestExtra: { mode: 'balanced', model: null }, models: [{ id: 'ar-route', name: 'AR' }], defaultModel: 'ar-route', freeModels: ['ar-route'] } } } } })
  check('chatPath + requestExtra 上游注册成功', reg.ok === true, JSON.stringify(reg))
  const r = await collect(adapter.stream({ provider: 'freeroute', model: 'ar-route', messages: msg('ping') }))
  check('非标路径请求出字', r.text === 'Mock reply OK', JSON.stringify(r.text))
  check('请求体带 mode 且无 model 字段', seen.length > 0 && JSON.parse(seen[seen.length - 1]).mode === 'balanced' && !('model' in JSON.parse(seen[seen.length - 1])), seen[seen.length - 1] || '')
  // 非法值被 sanitize 剔除：requestExtra 嵌套对象/危险 key 不进配置
  const reg2 = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-ar2': { enabled: true, custom: { noAuth: true, baseUrl: 'http://127.0.0.1:' + portAR, requestExtra: { '../evil': 1, nested: { a: 1 }, ok: 'x' }, models: [{ id: 'ar2' }], defaultModel: 'ar2' } } } } })
  check('requestExtra 只收标量与安全 key', reg2.ok === true)
  const cfgDisk = JSON.parse(readFileSync(CFG, 'utf8'))
  const ar2 = cfgDisk.upstreams['mock-ar2'] && cfgDisk.upstreams['mock-ar2'].custom
  check('落盘的 requestExtra 已剔除非法字段', ar2 && ar2.requestExtra && ar2.requestExtra.ok === 'x' && !('nested' in ar2.requestExtra) && !('../evil' in ar2.requestExtra), JSON.stringify(ar2 && ar2.requestExtra))
  const rm = await rpc('freeroute.remove-upstream', { id: 'mock-ar' })
  const rm2 = await rpc('freeroute.remove-upstream', { id: 'mock-ar2' })
  check('清理 mock-ar / mock-ar2', rm.ok === true && rm2.ok === true)
}

section('4. 全部候选失败 → 错误暴露')
{
  await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-ok': { enabled: false } } } })
  let err = null
  try { await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('ping') })) } catch (e) { err = e }
  check('抛出 SERVER 错误并带 HTTP 502', err != null && err.code === 'SERVER' && /502/.test(String(err.message)), String(err && err.code) + ' ' + String(err && err.message))
  await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-ok': { enabled: true } } } })
}

section('5. 指定上游直连（前缀模型 id）')
{
  const r = await collect(adapter.stream({ provider: 'freeroute', model: 'mock-ok/test-model', messages: msg('ping') }))
  check('直连 mock-ok 成功', r.text === 'Mock reply OK')
}

section('6. 翻译器：reasoning + tool_calls + 裸模型 id 路由')
{
  await rpc('freeroute.apply-patch', {
    patch: {
      upstreams: { 'mock-rich': { enabled: true, custom: { noAuth: true, baseUrl: b(portRich), models: [{ id: 'rich-model', name: 'R', contextWindow: 8192 }], defaultModel: 'rich-model' } } }
    }
  })
  const r = await collect(adapter.stream({ provider: 'freeroute', model: 'rich-model', messages: msg('ping') }))
  const reasoning = r.chunks.find((c) => c.type === 'block-end' && c.block.type === 'reasoning')
  const tool = r.chunks.find((c) => c.type === 'block-end' && c.block.type === 'tool-call')
  check('reasoning 块拼接为 "think hard"', reasoning && reasoning.block.text === 'think hard', JSON.stringify(reasoning && reasoning.block))
  check('文本块 "Answer "', r.text === 'Answer ', JSON.stringify(r.text))
  check('tool-call 块：name/arguments/id 完整', tool && tool.block.name === 'get_weather' && tool.block.arguments === '{"city":"Beijing"}' && tool.block.id === 'call_1', JSON.stringify(tool && tool.block))
  check('finish=tool-calls', r.finish && r.finish.kind === 'tool-calls')
}

section('7. 空响应 → 视为失败并切换（而非把错误漏给用户）')
{
  await rpc('freeroute.apply-patch', {
    patch: {
      order: ['mock-empty', 'mock-ok'],
      upstreams: { 'mock-empty': { enabled: true, custom: { noAuth: true, baseUrl: b(portEmpty), models: [{ id: 'test-model', name: 'E', contextWindow: 8192 }], defaultModel: 'test-model' } } }
    }
  })
  const r = await collect(adapter.stream({ provider: 'freeroute', model: 'test-model', messages: msg('ping') }))
  check('空响应上游被跳过，由 mock-ok 兜底', r.text === 'Mock reply OK', JSON.stringify(r.text))
  const st = await state()
  const me = st.upstreams.find((u) => u.id === 'mock-empty')
  check('空响应上游计入失败', me.stats.failed >= 1)
}

section('8. 鉴权：缺 Key 跳过 / 错 Key 记 AUTH / 对 Key 成功')
{
  await rpc('freeroute.apply-patch', {
    patch: {
      upstreams: { 'mock-secure': { enabled: true, custom: { baseUrl: b(portAuth), keyRef: 'FREEROUTE_TESTSECURE_API_KEY', models: [{ id: 'sec-model', name: 'S', contextWindow: 8192 }], defaultModel: 'sec-model' } } }
    }
  })
  const st0 = await state()
  check('无 Key 的上游 configured=false', st0.upstreams.find((u) => u.id === 'mock-secure').configured === false)
  const rAuto = await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('ping') }))
  check('auto 跳过无 Key 上游仍可用', rAuto.text === 'Mock reply OK')
  const rKey = await rpc('freeroute.set-key', { id: 'mock-secure', key: 'wrong' })
  check('set-key 写入 credentials', rKey.ok === true && keys.get('FREEROUTE_TESTSECURE_API_KEY') === 'wrong')
  // v0.7.2：单模型失败降级 auto 兜底，错 Key 不再中断对话
  const rBad = await collect(adapter.stream({ provider: 'freeroute', model: 'sec-model', messages: msg('ping') }))
  check('错 Key 的单模型降级 auto 兜底出字', rBad.text === 'Mock reply OK', JSON.stringify(rBad.text))
  const stBad = await state()
  const msBad = stBad.upstreams.find((u) => u.id === 'mock-secure')
  check('AUTH 失败仍记录到上游健康（面板可见）', msBad.health.lastError != null && /鉴权/.test(String(msBad.health.lastError)) && msBad.health.state !== 'up', JSON.stringify(msBad.health))
  await rpc('freeroute.apply-patch', {
    patch: { upstreams: { 'mock-goodkey': { enabled: true, custom: { baseUrl: b(portAuth), keyRef: 'FREEROUTE_GOODKEY_API_KEY', models: [{ id: 'gk-model', name: 'G', contextWindow: 8192 }], defaultModel: 'gk-model' } } } }
  })
  await rpc('freeroute.set-key', { id: 'mock-goodkey', key: 'good-key' })
  const rGood = await collect(adapter.stream({ provider: 'freeroute', model: 'gk-model', messages: msg('ping') }))
  check('正确 Key → 成功返回 "AuthOK"', rGood.text === 'AuthOK', JSON.stringify(rGood.text))
}

section('9. 远程目录：native 与 models.dev 双格式')
{
  await rpc('freeroute.apply-patch', { patch: { catalog: { remoteUrl: 'http://127.0.0.1:' + portCatNative + '/cat.json' } } })
  const s1 = await rpc('freeroute.catalog.sync', {})
  check('native 目录同步成功', s1.ok === true && s1.count === 1 && s1.format === 'native', JSON.stringify(s1))
  const st1 = await state()
  const ra = st1.upstreams.find((u) => u.id === 'remote-a')
  check('remote-a 出现且标记 source=remote、noAuth', ra != null && ra.source === 'remote' && ra.noAuth === true)
  const r = await collect(adapter.stream({ provider: 'freeroute', model: 'remote-a/ra-model', messages: msg('ping') }))
  check('远程目录上游可实际调用', r.text === 'Mock reply OK')
  await rpc('freeroute.apply-patch', { patch: { catalog: { remoteUrl: 'http://127.0.0.1:' + portCatMd + '/api.json' } } })
  const s2 = await rpc('freeroute.catalog.sync', {})
  check('models.dev 目录同步成功', s2.ok === true && s2.format === 'models.dev', JSON.stringify(s2))
  await rpc('freeroute.set-key', { id: 'remote-b', key: 'rb-key' })
  const models = await adapter.listModels()
  check('只保留 0 成本模型 rb-model（不含 rb-paid）', models.some((m) => m.id === 'rb-model') && !models.some((m) => m.id === 'rb-paid'))
  await rpc('freeroute.apply-patch', { patch: { catalog: { remoteUrl: 'http://127.0.0.1:' + portCatBad + '/bad.json' } } })
  const s3 = await rpc('freeroute.catalog.sync', {})
  check('坏 JSON 报错且不清空已有目录', s3.ok === false && /解析失败/.test(s3.error))
  await rpc('freeroute.apply-patch', { patch: { catalog: { remoteUrl: '' } } })
}

section('9b. 远程目录：极简格式 providerName/getkey/tutorial/api + apikey 整环导入')
{
  const auths = []
  const portMiniApi = await listen('mini-api', (req, res) => {
    if (req.method === 'GET' && req.url.indexOf('/models') >= 0) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mini-free' }] }))
      return
    }
    auths.push(req.headers.authorization || '')
    return mkOk()(req, res)
  })
  const portMiniCat = await listen('mini-cat', (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify([
      {
        providerName: 'Mini Vendor',
        getkey: 'https://ex.example/signup',
        tutorial: 'https://ex.example/tutorial',
        api: 'http://127.0.0.1:' + portMiniApi + '/v1',
        apikey: ['cat-k1', 'cat-k2']
      },
      {
        providerName: 'Legacy Vendor',
        getkey: 'https://ex.example/legacy',
        '教程': 'https://ex.example/legacy-tutorial',
        api: 'http://127.0.0.1:' + portMiniApi + '/v1'
      }
    ]))
  })
  await rpc('freeroute.apply-patch', { patch: { catalog: { remoteUrl: 'http://127.0.0.1:' + portMiniCat + '/cat.json' } } })
  const sm = await rpc('freeroute.catalog.sync', {})
  check('极简格式同步成功（裸数组，2 家）', sm.ok === true && sm.count === 2 && sm.format === 'native', JSON.stringify(sm))
  check('apikey 列表导入 1 家 Key 环', sm.imported === 1, JSON.stringify(sm))
  const stm = await state()
  const mv = stm.upstreams.find((u) => u.id === 'mini-vendor')
  const lv = stm.upstreams.find((u) => u.id === 'legacy-vendor')
  check('字段映射 name/getkey/tutorial/api', mv != null && mv.name === 'Mini Vendor' && mv.signupUrl === 'https://ex.example/signup' && mv.tutorialUrl === 'https://ex.example/tutorial', JSON.stringify(mv && { n: mv.name, s: mv.signupUrl, t: mv.tutorialUrl }))
  check('旧目录中文字段「教程」继续兼容', lv != null && lv.tutorialUrl === 'https://ex.example/legacy-tutorial', JSON.stringify(lv && { t: lv.tutorialUrl }))
  check('apikey 整环导入：keys=2 且 configured', mv.configured === true && mv.keys === 2, JSON.stringify({ c: mv.configured, k: mv.keys }))
  check('无 apikey 的厂商不动凭据（legacy keys=0）', lv.configured === false && lv.keys === 0, JSON.stringify({ c: lv.configured, k: lv.keys }))
  check('目录无模型时列表为空（探测即真相）', mv.modelsCount === 0, String(mv.modelsCount))
  const pr = await rpc('freeroute.probe', { id: 'mini-vendor' })
  const stp = await state()
  const mvp = stp.upstreams.find((u) => u.id === 'mini-vendor')
  check('探测补全模型', pr.ok === true && mvp.modelsCount === 1, JSON.stringify({ mc: mvp.modelsCount }))
  const rmv = await collect(adapter.stream({ provider: 'freeroute', model: 'mini-vendor/mini-free', messages: msg('ping') }))
  check('极简目录上游用导入的 Key 实际调用', rmv.text === 'Mock reply OK', JSON.stringify(rmv.text))
  check('请求真实携带了目录导入的 Key', auths.some((a) => a === 'Bearer cat-k1' || a === 'Bearer cat-k2'), JSON.stringify(auths))
}

section('10. 删除上游与恢复默认')
{
  const r = await rpc('freeroute.remove-upstream', { id: 'mock-fail' })
  check('remove-upstream 成功', r.ok === true, JSON.stringify(r))
  const st = await state()
  check('mock-fail 已删除', st.upstreams.find((u) => u.id === 'mock-fail') == null)
  check('order 同步清理', !(st.upstreams.map((u) => u.id)).includes('mock-fail'))
}

section('11. 自动接管默认模型（8s 轮询）')
{
  const deadline = Date.now() + 9500
  while (Date.now() < deadline && saveCalls.length === 0) await new Promise((r) => setTimeout(r, 300))
  check('saveSelection 调用了 freeroute/auto', saveCalls.some((s) => s.provider === 'freeroute' && s.model === 'auto'), JSON.stringify(saveCalls))
  const st = await state()
  check('state.autoInjected 置位', st.autoInjected === true)
}

section('11b. 自动接管开关：关闭恢复原默认')
{
  // 11 已接管（接管前原选择为 deepseek/deepseek-chat）
  await rpc('freeroute.apply-patch', { patch: { autoTakeover: false } })
  const stOff = await state()
  check('关闭后恢复接管前的默认模型', stOff.currentSelection && stOff.currentSelection.provider === 'deepseek' && stOff.currentSelection.model === 'deepseek-chat', JSON.stringify(stOff.currentSelection))
  check('关闭后「已接管」状态清除', stOff.autoInjected === false, String(stOff.autoInjected))
  await rpc('freeroute.apply-patch', { patch: { autoTakeover: true } })
  await new Promise((r) => setTimeout(r, 400))
  const stOn = await state()
  check('重新开启后再次接管并亮「已接管」', stOn.currentSelection && stOn.currentSelection.provider === 'freeroute' && stOn.currentSelection.model === 'auto' && stOn.autoInjected === true, JSON.stringify(stOn.currentSelection))
}

section('12. 测试连通 RPC')
{
  const r = await rpc('freeroute.test', { id: 'mock-ok' })
  check('test 返回 ok + 预览', r.ok === true && r.preview === 'Mock reply OK', JSON.stringify(r))
}

section('13. 模型探测：GET /models 合并 + free 优先默认')
{
  const portProbe = await listen('probe', (req, res) => {
    if (req.method === 'GET' && String(req.url).indexOf('/v1/models') >= 0) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'pf-free' }, { id: 'paid-x', context_window: 8192 }, { id: 'paid-y' }, { id: 'static-a' }] }))
      return
    }
    mkOk()(req, res)
  })
  const base = 'http://127.0.0.1:' + portProbe + '/v1'
  const reg = await rpc('freeroute.apply-patch', {
    patch: {
      upstreams: {
        'mock-p': { enabled: true, custom: { baseUrl: base, noAuth: true, models: [{ id: 'static-a', name: 'SA', contextWindow: 4096 }], defaultModel: 'static-a' } },
        'mock-q': { enabled: true, custom: { baseUrl: base, noAuth: true, models: [{ id: 'q-only' }], defaultModel: 'gone-model' } }
      }
    }
  })
  check('探测用上游注册成功', reg.ok === true, JSON.stringify(reg))
  const pr = await rpc('freeroute.probe', { id: 'mock-p' })
  check('probe RPC 返回 free/paid 计数', pr.ok === true && pr.results[0].free === 1 && pr.results[0].count === 4, JSON.stringify(pr))
  const st = await state()
  const up = st.upstreams.find((u) => u.id === 'mock-p')
  check('目录即真相：探测结果整体生效（含用户配置项）', up.modelsCount === 4 && up.freeCount === 1 && up.probedAt != null, JSON.stringify({ m: up.modelsCount, f: up.freeCount }))
  check('free 标记下发（通用名），付费模型不展示', st.models.some((m) => m.id === 'pf' && m.free === true) && !st.models.some((m) => m.id === 'paid-x'))
  const pfm = st.models.find((m) => m.id === 'pf')
  check('via 平台表记录提供方与真实模型', pfm && Array.isArray(pfm.via) && pfm.via.length === 1 && pfm.via[0].upstream === 'mock-p' && pfm.via[0].model === 'pf-free', JSON.stringify(pfm))
  check('defaultModel 存在时保留', up.defaultModel === 'static-a')
  await rpc('freeroute.probe', { id: 'mock-q' })
  const stq = await state()
  const upq = stq.upstreams.find((u) => u.id === 'mock-q')
  check('defaultModel 失效时回退首个免费模型', upq.defaultModel === 'pf-free', upq.defaultModel)
  const lm = await adapter.listModels()
  check('listModels 无 🆓 图标（组名与名称均为纯文本）', lm.every((m) => String(m.name).indexOf('🆓') < 0) && adapter.providerInfo('freeroute').name === 'FreeRoute 免费模型')
  check('listModels 含免费 pf 且不含付费 paid-x', lm.some((m) => m.id === 'pf') && !lm.some((m) => m.id === 'paid-x'))
  // mock-p 与 mock-q 指向同一探测服务器且均被探测，pf-free 两家都有 -> 合并为一条、标注 2 家上游
  const pfRow = lm.find((m) => m.id === 'pf')
  check('listModels 免费款副行标注平台数（跨上游合并）', !!pfRow && /2 家上游/.test(pfRow.description) && adapter.providerInfo('freeroute').name.indexOf('🆓') < 0, JSON.stringify(pfRow))
  const rLegacy = await collect(adapter.stream({ provider: 'freeroute', model: 'mock-p/paid-x', messages: msg('ping') }))
  check('旧复合 id 仍可调用（兼容历史选择）', rLegacy.text === 'Mock reply OK')
  const rGen = await collect(adapter.stream({ provider: 'freeroute', model: 'pf', messages: msg('ping') }))
  check('通用别名可实际调用', rGen.text === 'Mock reply OK')
}

section('13b. 跨平台同名模型：内部平台表 + 自动故障转移')
{
  // mock-x 提供坏网关上的 dsx-free；mock-y 提供大写/组织前缀变体 DSX-FREE。
  // 通用名 dsx 归一后两家同源，请求按优先级先打 mock-x，失败自动转移到 mock-y。
  const portX = await listen('failx', mkFail())
  const portY = await listen('oky', mkOk())
  const reg = await rpc('freeroute.apply-patch', {
    patch: {
      upstreams: {
        'mock-x': { enabled: true, custom: { baseUrl: 'http://127.0.0.1:' + portX + '/v1', noAuth: true, models: [{ id: 'dsx-free', name: 'DSX Free', contextWindow: 8192 }], defaultModel: 'dsx-free' } },
        'mock-y': { enabled: true, custom: { baseUrl: 'http://127.0.0.1:' + portY + '/v1', noAuth: true, models: [{ id: 'vendor-x/DSX-FREE' }] } }
      },
      order: ['mock-x', 'mock-y']
    }
  })
  check('跨平台上游注册成功', reg.ok === true, JSON.stringify(reg))
  const stb = await state()
  const dsx = stb.models.find((m) => m.id === 'dsx')
  check('大小写/组织前缀归一为同一通用名，且记录两家平台', !!dsx && dsx.free === true && dsx.via.length === 2 && dsx.via.some((v) => v.upstream === 'mock-x' && v.model === 'dsx-free') && dsx.via.some((v) => v.upstream === 'mock-y' && v.model === 'vendor-x/DSX-FREE'), JSON.stringify(dsx))
  const lmb = await adapter.listModels()
  const dsxRows = lmb.filter((m) => m.id === 'dsx')
  check('listModels 去重为一条并标注 2 家上游', dsxRows.length === 1 && /2 家上游/.test(dsxRows[0].description), JSON.stringify(dsxRows))
  const rAutoDs = await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('ping') }))
  check('auto 同模型跨厂商优先：x 失败直接切 y 的同款模型', rAutoDs.text === 'Mock reply OK', JSON.stringify(rAutoDs.text))
  const stAuto = await state()
  const ax = stAuto.upstreams.find((u) => u.id === 'mock-x')
  const ay = stAuto.upstreams.find((u) => u.id === 'mock-y')
  check('同款模型两家都被真实触达', ax.stats.failed >= 1 && ay.stats.ok >= 1, JSON.stringify({ ax: ax.stats.failed, ay: ay.stats.ok }))
  const rb = await collect(adapter.stream({ provider: 'freeroute', model: 'dsx', messages: msg('ping') }))
  check('首选平台失败自动转移到第二平台出字', rb.text === 'Mock reply OK', JSON.stringify(rb.text))
  const stc = await state()
  const mx = stc.upstreams.find((u) => u.id === 'mock-x')
  check('失败平台计入统计', mx.stats.failed >= 1, JSON.stringify(mx.stats))
}

// ---------------------------------------------------------------- 收尾
// ---------------------------------------------------------------- 收尾
section('13c. 模型级故障转移：单模型不可用先换模型再换上游')
{
  // mock-m 默认模型 dead-free 返回 502，备选 alive-free 正常；mock-n 是
  // 更低优先级的兜底上游。auto 应先在 mock-m 内换模型成功，mock-n 不应被触碰。
  const portM = await listen('mfail', (req, res) => {
    let body = ''
    req.on('data', function (c) { body += c })
    req.on('end', function () {
      if (body.indexOf('dead-free') >= 0) return mkFail()(req, res)
      return mkOk()(req, res)
    })
  })
  const portN = await listen('nbok', mkOk())
  const reg = await rpc('freeroute.apply-patch', {
    patch: {
      upstreams: {
        'mock-m': { enabled: true, custom: { baseUrl: 'http://127.0.0.1:' + portM + '/v1', noAuth: true, models: [{ id: 'dead-free', name: 'DF' }, { id: 'alive-free', name: 'AF' }], defaultModel: 'dead-free' } },
        'mock-n': { enabled: true, custom: { baseUrl: 'http://127.0.0.1:' + portN + '/v1', noAuth: true, models: [{ id: 'nb-free', name: 'NB' }], defaultModel: 'nb-free' } }
      },
      order: ['mock-m', 'mock-n']
    }
  })
  check('模型级故障转移上游注册成功', reg.ok === true, JSON.stringify(reg))
  const rAuto = await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('ping') }))
  check('auto 在同上游内换模型成功出字', rAuto.text === 'Mock reply OK', JSON.stringify(rAuto.text))
  const stA = await state()
  const m = stA.upstreams.find((u) => u.id === 'mock-m')
  const n = stA.upstreams.find((u) => u.id === 'mock-n')
  check('死模型计 1 次失败，但上游未进冷却（还有备选）', m.stats.failed >= 1 && m.health.state === 'up', JSON.stringify(m.health))
  check('低优先级上游未被触碰', n.stats.ok === 0 && n.stats.failed === 0, JSON.stringify(n.stats))
  check('学到的可用模型成为新默认', m.defaultModel === 'alive-free', m.defaultModel)
  const t = await rpc('freeroute.test', { id: 'mock-m' })
  check('连通测试优先学到的可用默认（一次命中）', t.ok === true && t.model === 'alive-free' && Array.isArray(t.tried) && t.tried.length === 1, JSON.stringify(t))
  // 全部模型都死的上游才判死刑并冷却
  const portDead = await listen('deadall', mkFail())
  const reg2 = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-n': { custom: { baseUrl: 'http://127.0.0.1:' + portDead + '/v1', models: [{ id: 'nb-free' }, { id: 'nb2-free' }] } } } } })
  check('替换 mock-n 为全死上游', reg2.ok === true, JSON.stringify(reg2))
  // v0.7.2：单模型（nb-free）在上游判死刑后降级 auto 兜底，不再直接报错；
  // 原始失败仍记录健康（下一个 check），auto 链全死的错误暴露见第 4 节
  const rDeg = await collect(adapter.stream({ provider: 'freeroute', model: 'nb-free', messages: msg('ping') }))
  check('单模型失败降级 auto 兜底出字', rDeg.text === 'Mock reply OK', JSON.stringify(rDeg.text))
  const stB = await state()
  const n2 = stB.upstreams.find((u) => u.id === 'mock-n')
  check('最后一个候选失败后进入冷却（真死刑）', n2.health.state !== 'up', JSON.stringify(n2.health))
}

section('13d. 多 Key 轮换：Key 级失败换下一把，不动上游健康')
{
  const auths = []
  const portK = await listen('keyring', (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mk-free' }] }))
      return
    }
    let body = ''
    req.on('data', function (c) { body += c })
    req.on('end', function () {
      auths.push(req.headers.authorization || '')
      if ((req.headers.authorization || '') === 'Bearer k2') return mkOk()(req, res)
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'bad key' } }))
    })
  })
  const reg = await rpc('freeroute.apply-patch', {
    patch: {
      upstreams: { 'mock-k': { enabled: true, custom: { baseUrl: 'http://127.0.0.1:' + portK + '/v1', models: [{ id: 'mk-free', name: 'MK' }], defaultModel: 'mk-free' } } },
      order: ['mock-k']
    }
  })
  check('多 Key 上游注册成功', reg.ok === true, JSON.stringify(reg))
  const rk = await rpc('freeroute.set-key', { id: 'mock-k', key: 'k1\nk2' })
  check('set-key 支持换行分隔多把', rk.ok === true && rk.keys === 2, JSON.stringify(rk))
  const stk = await state()
  const mk = stk.upstreams.find((u) => u.id === 'mock-k')
  check('state 显示 keys=2 且 configured', mk.configured === true && mk.keys === 2, JSON.stringify({ c: mk.configured, k: mk.keys }))
  const rk2 = await collect(adapter.stream({ provider: 'freeroute', model: 'mk-free', messages: msg('ping') }))
  check('坏 Key 自动轮换到好 Key 出字', rk2.text === 'Mock reply OK', JSON.stringify(rk2.text))
  check('服务端先见坏 Key 后见好 Key', auths.length >= 2 && auths[auths.length - 2] === 'Bearer k1' && auths[auths.length - 1] === 'Bearer k2', JSON.stringify(auths))
  const stk2 = await state()
  const mk2 = stk2.upstreams.find((u) => u.id === 'mock-k')
  check('Key 级失败不触发上游冷却', mk2.health.state === 'up', JSON.stringify(mk2.health))
  check('面板提示「第 1 把 Key 失效」', Array.isArray(mk2.health.keyFails) && mk2.health.keyFails.length === 1 && mk2.health.keyFails[0].index === 1 && mk2.health.keyFails[0].code === 'AUTH', JSON.stringify(mk2.health.keyFails))
  const rc = await rpc('freeroute.clear-key', { id: 'mock-k' })
  const stk3 = await state()
  const mk3 = stk3.upstreams.find((u) => u.id === 'mock-k')
  check('clear-key 清空整把 Key 环', rc.ok === true && mk3.configured === false && mk3.keys === 0, JSON.stringify({ ok: rc.ok, c: mk3.configured, k: mk3.keys }))
}

section('13e. 失败触发重探：目录即真相的自愈')
{
  // 目录先给 dead2-free；其 chat 失败(502) 触发重探，重探返回新目录
  // alive2-free；学习默认(filler)随目录失效自动清理，默认落到新免费款。
  let listSwap = false
  const portR = await listen('reprobe', (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: listSwap ? [{ id: 'alive2-free' }] : [{ id: 'dead2-free' }] }))
      return
    }
    let body = ''
    req.on('data', function (c) { body += c })
    req.on('end', function () {
      if (!listSwap && body.indexOf('dead2-free') >= 0) { listSwap = true; return mkFail()(req, res) }
      return mkOk()(req, res)
    })
  })
  const reg = await rpc('freeroute.apply-patch', {
    patch: {
      upstreams: { 'mock-r': { enabled: true, custom: { baseUrl: 'http://127.0.0.1:' + portR + '/v1', noAuth: true, models: [{ id: 'dead2-free' }, { id: 'filler-free' }], defaultModel: 'dead2-free' } } },
      order: ['mock-r']
    }
  })
  check('重探自愈上游注册成功', reg.ok === true, JSON.stringify(reg))
  await rpc('freeroute.probe', { id: 'mock-r' })
  const st0 = await state()
  const up0 = st0.upstreams.find((u) => u.id === 'mock-r')
  check('初始目录只有 dead2', up0.modelsCount === 1 && st0.models.some((m) => m.id === 'dead2'), JSON.stringify({ mc: up0.modelsCount }))
  const r1 = await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('ping') }))
  check('auto 经模型级转移用 filler 出字', r1.text === 'Mock reply OK', JSON.stringify(r1.text))
  await new Promise(function (r) { setTimeout(r, 700) })
  const st1 = await state()
  const up1 = st1.upstreams.find((u) => u.id === 'mock-r')
  check('失败触发重探：目录换新', up1.modelsCount === 1 && st1.models.some((m) => m.id === 'alive2') && !st1.models.some((m) => m.id === 'dead2'), JSON.stringify(st1.models.map(function (m) { return m.id })))
  check('学习默认随目录失效清理，默认落到新免费款', up1.defaultModel === 'alive2-free', up1.defaultModel)
  const r2 = await collect(adapter.stream({ provider: 'freeroute', model: 'auto', messages: msg('ping') }))
  check('新目录模型可正常派发', r2.text === 'Mock reply OK', JSON.stringify(r2.text))
}

section('14. 就绪联动（默认模型接管，无目录登记）')
{
  // 前面各节已配好 mock-goodkey 密钥并有多家 noAuth 上游 → 接管应已发生
  const settle = async () => { await new Promise((r) => setTimeout(r, 30)) }
  await settle()
  const st = await state()
  check('就绪后默认模型已接管到 freeroute/auto', st.currentSelection && st.currentSelection.provider === 'freeroute' && st.currentSelection.model === 'auto', JSON.stringify(st.currentSelection))
  check('autoInjected 置位（本次进程只接管一次）', st.autoInjected === true, String(st.autoInjected))
  // 全部禁用 → 接管不回滚（一次性语义），但也不抛错
  const off = { upstreams: {} }
  for (const u of st.upstreams) off.upstreams[u.id] = { enabled: false }
  const r1 = await rpc('freeroute.apply-patch', { patch: off })
  check('全部上游禁用 patch 生效', r1.ok === true, JSON.stringify(r1))
  await settle()
  const savesAfterDisable = saveCalls.length
  const r2 = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-ok': { enabled: true } } } })
  check('重新启用 mock-ok 生效', r2.ok === true, JSON.stringify(r2))
  await settle()
  check('接管只发生一次（禁用/恢复不再重复保存）', saveCalls.length === savesAfterDisable, JSON.stringify(saveCalls.slice(-2)))
}

section('14b. get-keys：面板「显示」拉取完整 Key 环')
{
  const reg = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-gk': { enabled: true, custom: { baseUrl: b(portOk), keyRef: 'FREEROUTE_MOCK_GK_KEY', models: [{ id: 'gk-free', name: 'GK' }], defaultModel: 'gk-free' } } } } })
  check('带 keyRef 的上游注册成功', reg.ok === true, JSON.stringify(reg))
  const bad = await rpc('freeroute.get-keys', { id: 'no-such' })
  check('未知上游报错', bad.ok === false, JSON.stringify(bad))
  const empty = await rpc('freeroute.get-keys', { id: 'mock-gk' })
  check('未配 Key 返回空环', empty.ok === true && empty.keys.length === 0, JSON.stringify(empty))
  const noauth = await rpc('freeroute.get-keys', { id: 'mock-ok' })
  check('免鉴权上游返回空环', noauth.ok === true && noauth.keys.length === 0, JSON.stringify(noauth))
  await rpc('freeroute.set-key', { id: 'mock-gk', key: 'gk-1\ngk-2' })
  const got = await rpc('freeroute.get-keys', { id: 'mock-gk' })
  check('已配两把 Key 完整返回（一行一把）', got.ok === true && got.keys.length === 2 && got.keys[0] === 'gk-1' && got.keys[1] === 'gk-2', JSON.stringify(got))
  const rm14b = await rpc('freeroute.remove-upstream', { id: 'mock-gk' })
  check('清理 mock-gk', rm14b.ok === true)
}

section('15. JSON 配置文件：热重载 + keys 导入 + 落盘')
{
  // 直接替换配置文件（模拟迁移/更新场景），state() 触发 mtime 检查热生效
  await new Promise((r) => setTimeout(r, 20))
  const before = (await state()).upstreams.map(function (u) { return u.id })
  const cfg = {
    order: ['mock-json'],
    autoTakeover: true,
    upstreams: {
      'mock-json': { enabled: true, custom: { noAuth: false, baseUrl: b(portOk), keyRef: 'FREEROUTE_MOCK_JSON_KEY', models: [{ id: 'js-free', name: 'JS' }], defaultModel: 'js-free' } }
    },
    keys: { 'mock-json': ['jk-1', 'jk-2'] }
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(CFG, JSON.stringify(cfg, null, 2), 'utf8')
  await state() // 触发 mtime 检查与热重载（keys 导入在后台异步进行）
  await new Promise((r) => setTimeout(r, 80))
  const st15 = await state()
  const ids = st15.upstreams.map(function (u) { return u.id })
  check('替换文件后 5 秒内热生效（上游集合刷新）', ids.join(',') !== before.join(',') && ids.indexOf('mock-json') >= 0, JSON.stringify(ids))
  const mj = st15.upstreams.find(function (u) { return u.id === 'mock-json' })
  check('JSON 里的上游生效且配置正确', mj && mj.configured === true && mj.keys === 2, JSON.stringify({ c: mj && mj.configured, k: mj && mj.keys }))
  check('keys 字段导入凭据（不覆盖已有）', keys.get('FREEROUTE_MOCK_JSON_KEY') === 'jk-1' && keys.get('FREEROUTE_MOCK_JSON_KEY_2') === 'jk-2', JSON.stringify({ a: keys.get('FREEROUTE_MOCK_JSON_KEY'), b: keys.get('FREEROUTE_MOCK_JSON_KEY_2') }))
  check('state 暴露 configPath', st15.configPath === CFG, String(st15.configPath))
  // 再替换一次：keys 已配置 -> 不覆盖
  await new Promise((r) => setTimeout(r, 20))
  writeFileSync(CFG, JSON.stringify(Object.assign({}, cfg, { keys: { 'mock-json': ['evil-key'] } }), null, 2), 'utf8')
  await state()
  await new Promise((r) => setTimeout(r, 80))
  check('keys 已配置时不被文件覆盖', keys.get('FREEROUTE_MOCK_JSON_KEY') === 'jk-1', String(keys.get('FREEROUTE_MOCK_JSON_KEY')))
  // apply-patch 落盘（文件内容与内存一致，且永不回写 keys）
  const rp15 = await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-json2': { enabled: true, custom: { noAuth: true, baseUrl: b(portOk), models: [{ id: 'j2-free' }], defaultModel: 'j2-free' } } } } })
  check('JSON 模式下 apply-patch 成功', rp15.ok === true, JSON.stringify(rp15))
  const disk = JSON.parse(readFileSync(CFG, 'utf8'))
  check('patch 落盘到 JSON 文件', disk.upstreams && !!disk.upstreams['mock-json2'], JSON.stringify(Object.keys(disk.upstreams || {})))
  check('密钥永不回写文件', disk.keys === undefined, JSON.stringify(disk.keys))
  const rm15 = await rpc('freeroute.remove-upstream', { id: 'mock-json2' })
  const disk2 = JSON.parse(readFileSync(CFG, 'utf8'))
  check('remove-upstream 落盘（文件里同步消失）', rm15.ok === true && !disk2.upstreams['mock-json2'] && disk2.order.indexOf('mock-json2') < 0)
}

section('15b. 单模型降级：唯一上游失败/冷却时走 auto 兜底')
{
  await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-dead': { enabled: true, custom: { noAuth: true, baseUrl: b(portFail), models: [{ id: 'dead-model', name: 'D' }], defaultModel: 'dead-model', freeModels: ['dead-model'] } } } } })
  // a) 候选全挂：唯一候选 mock-dead(502) 失败 → 降级 auto（mock-json）继续
  const ra = await collect(adapter.stream({ provider: 'freeroute', model: 'dead-model', messages: msg('ping') }))
  check('候选全挂时单模型降级 auto 出字', ra.text === 'Mock reply OK', JSON.stringify(ra.text))
  // b) 唯一上游已在冷却 → 无候选 → 直接降级 auto（v0.7.2 前这里抛 NO_UPSTREAM）
  const rb = await collect(adapter.stream({ provider: 'freeroute', model: 'dead-model', messages: msg('ping') }))
  check('唯一上游冷却时单模型降级 auto 出字', rb.text === 'Mock reply OK', JSON.stringify(rb.text))
  const rm = await rpc('freeroute.remove-upstream', { id: 'mock-dead' })
  check('清理 mock-dead', rm.ok === true)
}

section('16. 本地端点：无 Key + CORS + 工具调用（供其他 agent 复用）')
{
  const reg = webRegs.find(function (r) { return r && r.kind === 'prefix' && r.path === '/freeroute' })
  check('webServer 注册了 /freeroute 前缀端点', reg != null && typeof reg.handler === 'function')
  const handler = reg.handler
  const makeRes = function () {
    const r = { status: 0, headers: {}, chunks: [], ended: false }
    r.writeHead = function (s, h) { r.status = s; Object.assign(r.headers, h || {}); return r }
    r.write = function (c) { r.chunks.push(String(c)); return true }
    r.end = function (c) { if (c != null) r.chunks.push(String(c)); r.ended = true; return r }
    return r
  }
  const makeReq = function (method, url, body) {
    const buf = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body))
    return {
      method, url, headers: {},
      [Symbol.asyncIterator]: async function* () { if (buf) yield Buffer.from(buf, 'utf8') }
    }
  }
  const call = async function (method, url, body) {
    const res = makeRes()
    await handler(makeReq(method, url, body), res)
    for (let i = 0; i < 200 && !res.ended; i++) await new Promise(function (r) { setTimeout(r, 10) })
    return res
  }
  // a) CORS 预检：浏览器类客户端（如运行在别的 origin 的 Web agent）可直连
  const pre = await call('OPTIONS', '/freeroute/v1/chat/completions')
  check('OPTIONS 预检 204 + 放通 CORS', pre.status === 204 && pre.headers['access-control-allow-origin'] === '*', JSON.stringify({ s: pre.status, h: pre.headers['access-control-allow-origin'] }))
  // b) health 带 CORS 头
  const h = await call('GET', '/freeroute/health')
  const hj = JSON.parse(h.chunks.join(''))
  check('health 200 + CORS', h.status === 200 && hj.ok === true && h.headers['access-control-allow-origin'] === '*')
  // c) 无任何 Authorization 头也能用（按设计免 Key）
  const chat = await call('POST', '/freeroute/v1/chat/completions', { model: 'js-free', messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 })
  const cj = JSON.parse(chat.chunks.join(''))
  check('无 Key 非流式补全成功', chat.status === 200 && cj.choices[0].message.content === 'Mock reply OK' && cj.object === 'chat.completion', JSON.stringify(cj).slice(0, 120))
  check('补全响应带 CORS 头', chat.headers['access-control-allow-origin'] === '*')
  // d) 工具调用透传：上游返回 tool_calls → OpenAI 形态回给客户端
  await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-rich': { enabled: true, custom: { noAuth: true, baseUrl: b(portRich), models: [{ id: 'rich-free', name: 'R' }], defaultModel: 'rich-free', freeModels: ['rich-free'] } } } } })
  const tc = await call('POST', '/freeroute/v1/chat/completions', {
    model: 'rich-free',
    messages: [{ role: 'user', content: '北京天气' }],
    tools: [{ type: 'function', function: { name: 'get_weather', description: '查天气', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }]
  })
  const tj = JSON.parse(tc.chunks.join(''))
  const call0 = tj.choices[0].message.tool_calls && tj.choices[0].message.tool_calls[0]
  check('非流式返回 tool_calls（OpenAI 形态）', tc.status === 200 && call0 && call0.function.name === 'get_weather' && call0.function.arguments === '{"city":"Beijing"}', JSON.stringify(tj.choices[0].message).slice(0, 160))
  check('finish_reason=tool_calls', tj.choices[0].finish_reason === 'tool_calls', String(tj.choices[0].finish_reason))
  // e) 流式：SSE 分片 + tool_calls 增量 + finish_reason + [DONE]
  const s = await call('POST', '/freeroute/v1/chat/completions', { model: 'rich-free', stream: true, messages: [{ role: 'user', content: '北京天气' }] })
  const raw = s.chunks.join('')
  const sseChunks = raw.split('\n\n').filter(function (x) { return x.indexOf('data: ') === 0 }).map(function (x) { return x.slice(6) })
  const hasToolDelta = sseChunks.some(function (x) { try { const o = JSON.parse(x); return o.choices[0] && o.choices[0].delta && Array.isArray(o.choices[0].delta.tool_calls) } catch (e) { return false } })
  const hasFinish = sseChunks.some(function (x) { try { const o = JSON.parse(x); return o.choices[0] && o.choices[0].finish_reason === 'tool_calls' } catch (e) { return false } })
  check('流式 SSE：tool_calls 增量 + finish_reason + [DONE]', s.status === 200 && s.headers['content-type'] === 'text/event-stream' && hasToolDelta && hasFinish && sseChunks[sseChunks.length - 1] === '[DONE]', raw.slice(0, 120))
  // f) 未知路径 404 + CORS
  const nf = await call('GET', '/freeroute/nope')
  check('未知路径 404', nf.status === 404)
  const rm = await rpc('freeroute.remove-upstream', { id: 'mock-rich' })
  check('清理 mock-rich', rm.ok === true)
}

section('16b. 全局代理：默认关闭 / 兜底生效 / 上游覆盖 / 清除')
{
  // a) 默认无全局代理：请求 argv 不含 --proxy
  const before = spawnCalls.length
  await collect(adapter.stream({ provider: 'freeroute', model: 'js-free', messages: msg('ping') }))
  const argvA = spawnCalls.slice(before).filter(function (a) { return a.some(function (x) { return String(x).indexOf('/chat/completions') >= 0 }) })[0] || []
  check('默认（未设置）请求不带 --proxy', argvA.indexOf('--proxy') < 0, JSON.stringify(argvA.slice(-4)))
  // b) 设置全局代理：无自有代理的上游自动带上
  const rp = await rpc('freeroute.apply-patch', { patch: { proxy: 'http://127.0.0.1:7899' } })
  check('apply-patch 接受顶层 proxy', rp.ok === true, JSON.stringify(rp))
  const stG = await state()
  check('state 暴露 globalProxy', stG.globalProxy === 'http://127.0.0.1:7899', String(stG.globalProxy))
  const before2 = spawnCalls.length
  await collect(adapter.stream({ provider: 'freeroute', model: 'js-free', messages: msg('ping') }))
  const argvB = spawnCalls.slice(before2).filter(function (a) { return a.some(function (x) { return String(x).indexOf('/chat/completions') >= 0 }) })[0] || []
  const piB = argvB.indexOf('--proxy')
  check('全局代理进入 curl argv 且在 URL 前', piB >= 0 && argvB[piB + 1] === 'http://127.0.0.1:7899', JSON.stringify(argvB.slice(-6)))
  // c) 上游自有 proxy 优先于全局
  await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-json': { custom: { proxy: 'http://127.0.0.1:7890' } } } } })
  const before3 = spawnCalls.length
  await collect(adapter.stream({ provider: 'freeroute', model: 'js-free', messages: msg('ping') }))
  const argvC = spawnCalls.slice(before3).filter(function (a) { return a.some(function (x) { return String(x).indexOf('/chat/completions') >= 0 }) })[0] || []
  const piC = argvC.indexOf('--proxy')
  check('上游 custom.proxy 覆盖全局', piC >= 0 && argvC[piC + 1] === 'http://127.0.0.1:7890', JSON.stringify(argvC.slice(-6)))
  // d) 持久化 + 校验：非法值被拒，空串清除
  const disk = JSON.parse(readFileSync(CFG, 'utf8'))
  check('proxy 落盘 JSON 配置', disk.proxy === 'http://127.0.0.1:7899', String(disk.proxy))
  const bad = await rpc('freeroute.apply-patch', { patch: { proxy: 'socks5://x' } })
  check('非法协议被拒', bad.ok === false && /proxy 无效/.test(bad.error), JSON.stringify(bad))
  const clr = await rpc('freeroute.apply-patch', { patch: { proxy: '' } })
  check('空串清除成功', clr.ok === true, JSON.stringify(clr))
  check('清除后 state.globalProxy 为空', (await state()).globalProxy === '')
  // 还原：上游 proxy 清掉，全局保持关闭
  await rpc('freeroute.apply-patch', { patch: { upstreams: { 'mock-json': { custom: { proxy: '' } } } } })
}

section('18. 200+配额通知文本：自动切换 / 不误伤 / 冷却')
{
  // aihubmix 实测场景：配额用尽返回 HTTP 200 + 纯文本提示，传输层无从感知。
  const NOTICE = 'Sorry, to prevent abuse of free resources, accounts that have not been recharged can only try 10 times. You can increase the free quota after recharging; https://console.aihubmix.com/topup'
  const portQ = await listen('quota200', function (req, res) {
    sse(res, [
      j({ choices: [{ delta: { content: NOTICE } }] }),
      j({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      'data: [DONE]\n\n'
    ])
  })
  // 误伤对照：短语出现在第 250 字符之后（窗口外），必须是完整正常回答
  const late = 'X'.repeat(250) + ' to prevent abuse of free resources ' + 'Y'.repeat(50)
  const portL = await listen('quotaLate', function (req, res) {
    sse(res, [
      j({ choices: [{ delta: { content: late } }] }),
      j({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 2 } }),
      'data: [DONE]\n\n'
    ])
  })
  // q1 声明同款模型排在 mock-json 前：请求 js-free 应先撞 q1 再切 mock-json
  const p1 = await rpc('freeroute.apply-patch', { patch: { order: ['q1', 'quota-late', 'mock-json'], upstreams: {
    'q1': { enabled: true, custom: { noAuth: true, baseUrl: b(portQ), models: [{ id: 'js-free', name: 'Q1' }], defaultModel: 'js-free' } },
    'quota-late': { enabled: true, custom: { noAuth: true, baseUrl: b(portL), models: [{ id: 'late-free', name: 'Late' }], defaultModel: 'late-free' } }
  } } })
  check('注册 200+通知与窗口外对照上游', p1.ok === true, JSON.stringify(p1))
  const r18 = await collect(adapter.stream({ provider: 'freeroute', model: 'js-free', messages: msg('ping') }))
  check('通知文本被拦截并切换到 mock-json', r18.text === 'Mock reply OK', JSON.stringify(r18.text))
  const st18 = await state()
  const q1s = st18.upstreams.find(function (u) { return u.id === 'q1' })
  check('q1 计入失败并进入冷却', q1s.stats.requests >= 1 && q1s.stats.ok === 0 && q1s.health.state === 'cooling', JSON.stringify({ r: q1s.stats.requests, ok: q1s.stats.ok, h: q1s.health.state }))
  // 误伤对照：late-free 的完整回答必须原样到达
  const r18b = await collect(adapter.stream({ provider: 'freeroute', model: 'late-free', messages: msg('ping') }))
  check('窗口外短语不误伤（完整回答保留）', r18b.text === late, 'len=' + r18b.text.length)
  // 清理
  await rpc('freeroute.apply-patch', { patch: { order: ['mock-json'] } })
  await rpc('freeroute.remove-upstream', { id: 'q1' })
  await rpc('freeroute.remove-upstream', { id: 'quota-late' })
}

for (const d of disposers) { try { d() } catch { /* ignore */ } }
for (const s of Object.values(servers)) { s.close() }

console.log('\n================================')
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项')
if (failed > 0) { console.log(failures.join('\n')); process.exit(1) }
console.log('ALL PASS')
