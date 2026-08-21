// smoke: hermetic unit tests for dsh-freeroute against fake host services.
// Fake OpenRouter catalog: 2 free models + 1 paid, fetched via injected global.
const FREE = [
  { id: 'a/big:free', name: 'A Big', context_length: 128000 },
  { id: 'b/small:free', name: 'B Small', context_length: 32000 },
  { id: 'c/paid', name: 'C Paid', context_length: 200000 },
]
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: FREE }) })

const { apply } = await import('./lib/index.js')

function makeCtx() {
  const registered = []
  const merges = []
  const listeners = {}
  let source = { provider: 'deepseek', model: 'deepseek-chat' }
  return {
    registered, merges, listeners, setSource: (s) => { source = s }, getSource: () => source,
    ctx: {
      get: (name) => ({
        commands: { register: (c) => { registered.push(c); return () => {} } },
        settings: { merge: async (ns, patch) => { merges.push({ ns, patch }); source = { ...source, ...patch } } },
        agentDefaultModel: { source: () => source },
      })[name],
      on: (event, fn) => { (listeners[event] ||= []).push(fn); return () => {} },
      effect: (fn) => { fn(); return () => {} },
      logger: () => ({ info() {}, warn() {} }),
    },
  }
}

const out = []
function check(name, cond) { out.push((cond ? '✓ ' : '✗ ') + name); if (!cond) process.exitCode = 1 }

const h = makeCtx()
apply(h.ctx, { autoRotate: true })
const cmd = h.registered[0]

check('command registered as /free', cmd && cmd.name === 'free')

const st = await cmd.handler({ rawInput: 'status' })
check('status shows catalog=2 free', st.text.includes('免费目录: 2 个模型'))
check('status shows paid default', st.text.includes('deepseek / deepseek-chat'))

const list = await cmd.handler({ rawInput: 'list' })
check('list sorts big-context first', list.text.indexOf('a/big:free') < list.text.indexOf('b/small:free'))
check('list excludes paid models', !list.text.includes('c/paid'))

const use = await cmd.handler({ rawInput: 'use a/big:free' })
check('use rewrites default via settings.merge', use.kind === 'success' && h.merges[0].ns === 'agent-default-model' && h.merges[0].patch.model === 'a/big:free')

// 429 on the active free model -> exhausted + rotated to next free
await h.listeners['agent/request-error'][0]({ failure: { code: '429' }, provider: 'openrouter' }, async () => 'passthrough')
check('rate-limit marks exhausted and rotates', h.merges.length === 2 && h.merges[1].patch.model === 'b/small:free')
check('watcher passes through to host recovery', await h.listeners['agent/request-error'][0]({ failure: { code: '429' } }, async () => 'passthrough') === 'passthrough')

const rst = await cmd.handler({ rawInput: 'reset' })
check('reset clears exhausted marks', rst.kind === 'success' && !rst.text.includes('a/big'))

const bad = await cmd.handler({ rawInput: 'use nope:free' })
check('unknown model errors', bad.kind === 'error')

console.log(out.join('\n'))
if (process.exitCode) { console.error('smoke: FAILED'); process.exit(1) }
console.log('smoke-host: all assertions passed ✓')
