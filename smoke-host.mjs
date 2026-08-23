// smoke: hermetic unit tests for dsh-freeroute against fake host services.
// Fake OpenRouter catalog mirrors the live endpoint's shape; every host
// service the plugin reads is faked with call recording. Scenarios run in
// independent harnesses so cooldown/budget state never leaks between groups.
const DAY = 86400000
const NOW = Date.now()
const SEC = (daysAgo) => Math.floor(NOW / 1000) - Math.floor(daysAgo * DAY / 1000)

function freeModel(overrides = {}) {
  return {
    name: overrides.id + ' (free)',
    context_length: 128000,
    created: SEC(90),
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools'],
    reasoning: { mandatory: false },
    expiration_date: null,
    top_provider: { max_completion_tokens: 32768 },
    description: '',
    ...overrides,
  }
}

const CATALOG = [
  freeModel({
    id: 'z-ai/glm-5.2:free',
    name: 'Z.AI: GLM 5.2 (free)',
    context_length: 256000,
    created: SEC(30),
    top_provider: { max_completion_tokens: 256000 },
    description: 'GLM 5.2 with 40B active parameters.',
  }),
  freeModel({
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA: Nemotron Ultra (free)',
    context_length: 1000000,
    created: SEC(100),
    top_provider: { max_completion_tokens: 65536 },
    description: 'Nemotron with 55B active parameters.',
  }),
  freeModel({
    id: 'dots-studio/dots-3-note-preview:free',
    name: 'Dots Studio: Dots3-Note Preview (free)',
    context_length: 512000,
    created: SEC(10),
    expiration_date: '2099-01-01',
    top_provider: { max_completion_tokens: 512000 },
    description: 'Note-taking model.',
  }),
  freeModel({
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'LiquidAI: LFM2.5-2.6B (free)',
    context_length: 65536,
    created: SEC(200),
    reasoning: { mandatory: true },
    top_provider: { max_completion_tokens: 8192 },
    description: 'Tiny reasoning model.',
  }),
  {
    id: 'nvidia/nemotron-3.5-content-safety:free',
    name: 'NVIDIA: Content Safety (free)',
    context_length: 128000,
    created: SEC(20),
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['max_tokens'],
    top_provider: { max_completion_tokens: 8192 },
    description: 'Safety classifier, not a chat model.',
  },
  {
    id: 'c/paid',
    name: 'C Paid',
    context_length: 200000,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools'],
    top_provider: { max_completion_tokens: 8192 },
    description: '',
  },
]

const out = []
function check(name, cond) {
  out.push((cond ? '✓ ' : '✗ ') + name)
  if (!cond) process.exitCode = 1
}

const { apply } = await import('./lib/index.js')

function makeCtx() {
  const state = {
    registered: [],
    saved: [],
    listeners: {},
    selection: { provider: 'deepseek', model: 'deepseek-chat' },
    llmCalls: [],
    llmFailIds: null,
    providers: [{ id: 'openrouter', name: 'OpenRouter' }],
  }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: CATALOG }) })
  const ctx = {
    get: (name) => ({
      commands: { register: (c) => { state.registered.push(c); return () => {} } },
      agentDefaultModel: {
        currentSelection: () => state.selection,
        saveSelection: async (sel) => { state.saved.push(sel); state.selection = sel },
      },
      llm: {
        listProviders: () => state.providers,
        stream: (opts) => {
          state.llmCalls.push(opts)
          if (state.llmFailIds && state.llmFailIds.has(opts.model)) {
            const err = Object.assign(new Error('rate limited'), { code: 'RATE_LIMIT' })
            return {
              [Symbol.asyncIterator]() {
                return { next: () => Promise.reject(err) }
              },
            }
          }
          return (async function* () { yield { type: 'text', text: 'ok' } })()
        },
      },
    })[name],
    on: (event, fn) => { (state.listeners[event] ||= []).push(fn); return () => {} },
    effect: (fn) => { fn(); return () => {} },
    logger: () => ({ info() {}, warn() {} }),
  }
  return { state, ctx }
}

// ---------------------------------------------------------------------------
// Group A: discovery, ranking, commands
// ---------------------------------------------------------------------------
{
  const h = makeCtx()
  apply(h.ctx, {})
  const cmd = h.state.registered[0]

  check('A: command registered as /free', cmd !== undefined && cmd.name === 'free')

  const list = await cmd.handler({ rawInput: 'list' })
  check('A: best free model ranks first', list.text.indexOf('z-ai/glm-5.2:free') >= 0
    && list.text.indexOf('z-ai/glm-5.2:free') < list.text.indexOf('nvidia/nemotron-3-ultra-550b-a55b:free'))
  check('A: list excludes non-chat classifiers', !list.text.includes('content-safety'))
  check('A: list excludes paid models', !list.text.includes('c/paid'))
  check('A: list shows score and flags', /z-ai\/glm-5\.2:free\s+\d+\s*\[/.test(list.text))
  check('A: list shows filtered count', list.text.includes('4/4'))

  const st = await cmd.handler({ rawInput: 'status' })
  check('A: status shows takeover off', st.text.includes('接管模式: 关闭'))
  check('A: status shows openrouter registered', !st.text.includes('未检测到 openrouter'))
  check('A: status shows current default', st.text.includes('deepseek / deepseek-chat'))

  const use = await cmd.handler({ rawInput: 'use z-ai/glm-5.2:free' })
  check('A: use saves default selection', use.kind === 'success'
    && h.state.saved[0].provider === 'openrouter'
    && h.state.saved[0].model === 'z-ai/glm-5.2:free')

  h.state.selection = { provider: 'openrouter', model: 'liquid/lfm-2.5-2.6b:free' }
  const rot = await cmd.handler({ rawInput: 'rotate' })
  check('A: rotate picks the best free model', rot.kind === 'success' && rot.text.includes('z-ai/glm-5.2:free'))

  const badUse = await cmd.handler({ rawInput: 'use nope:free' })
  check('A: unknown model errors', badUse.kind === 'error')
  const paidUse = await cmd.handler({ rawInput: 'use c/paid' })
  check('A: non-free model errors', paidUse.kind === 'error')
  const rf = await cmd.handler({ rawInput: 'refresh' })
  check('A: refresh reloads catalog', rf.kind === 'success' && rf.text.includes('4 个免费模型'))
}

// ---------------------------------------------------------------------------
// Group B: takeover mode via agent/request
// ---------------------------------------------------------------------------
{
  const h = makeCtx()
  apply(h.ctx, {})
  const cmd = h.state.registered[0]
  const request = h.state.listeners['agent/request'][0]
  const baseCfg = { provider: 'deepseek', model: 'deepseek-chat', maxTokens: 8192, messages: [] }

  const passthrough = await request({ agent: { id: 'a1' }, turn: 1, step: 1 }, async () => baseCfg)
  check('B: takeover off - paid seed passes through', passthrough.provider === 'deepseek')

  const onMsg = await cmd.handler({ rawInput: 'on' })
  check('B: /free on acknowledges', onMsg.kind === 'success' && onMsg.text.includes('接管已开启'))

  const rewritten = await request({ agent: { id: 'a1' }, turn: 1, step: 1 }, async () => ({ ...baseCfg }))
  check('B: takeover rewrites paid seed to best free model', rewritten.provider === 'openrouter'
    && rewritten.model === 'z-ai/glm-5.2:free')
  check('B: rewrite preserves other config', rewritten.maxTokens === 8192)

  const sameModel = await request({ agent: { id: 'a1' }, turn: 1, step: 1 },
    async () => ({ provider: 'openrouter', model: 'z-ai/glm-5.2:free' }))
  check('B: takeover keeps seed when already the pick', sameModel.model === 'z-ai/glm-5.2:free')

  const dropped = await request({ agent: { id: 'a1' }, turn: 1, step: 1 },
    async () => ({ provider: 'openrouter', model: 'liquid/lfm-2.5-2.6b:free', reasoningEffort: 'high' }))
  check('B: rewrite drops inherited reasoningEffort', dropped.model === 'z-ai/glm-5.2:free'
    && !('reasoningEffort' in dropped))

  const pinnedOn = await cmd.handler({ rawInput: 'on nvidia/nemotron-3-ultra-550b-a55b:free' })
  const pinned = await request({ agent: { id: 'a2' }, turn: 1, step: 1 }, async () => ({ ...baseCfg }))
  check('B: takeover honors pinned model', pinnedOn.kind === 'success'
    && pinned.model === 'nvidia/nemotron-3-ultra-550b-a55b:free')

  await cmd.handler({ rawInput: 'off' })
  const afterOff = await request({ agent: { id: 'a1' }, turn: 2, step: 1 }, async () => ({ ...baseCfg }))
  check('B: takeover off - no rewrite', afterOff.provider === 'deepseek')
}

// ---------------------------------------------------------------------------
// Group C: free guard + request-error retry + budget + idle reset
// ---------------------------------------------------------------------------
{
  const h = makeCtx()
  apply(h.ctx, {})
  const cmd = h.state.registered[0]
  const request = h.state.listeners['agent/request'][0]
  const requestError = h.state.listeners['agent/request-error'][0]
  const statusListener = h.state.listeners['agent/status'][0]

  // Free guard without takeover: an unhealthy free seed is swapped.
  await request({ agent: { id: 'a3' }, turn: 1, step: 1 },
    async () => ({ provider: 'openrouter', model: 'z-ai/glm-5.2:free' })) // issued = glm
  await requestError({ agent: { id: 'a3' }, turn: 1, step: 1, failure: { code: 'RATE_LIMIT' } },
    async () => undefined) // marks glm exhausted, retry
  const guarded = await request({ agent: { id: 'a3' }, turn: 1, step: 2 },
    async () => ({ provider: 'openrouter', model: 'z-ai/glm-5.2:free' }))
  check('C: free guard swaps unhealthy free seed', guarded.model === 'nvidia/nemotron-3-ultra-550b-a55b:free')

  // Retry lands on the next free model after a rate limit (lfm still healthy).
  await request({ agent: { id: 'a4' }, turn: 7, step: 1 },
    async () => ({ provider: 'openrouter', model: 'liquid/lfm-2.5-2.6b:free' })) // issued = lfm
  const act1 = await requestError({ agent: { id: 'a4' }, turn: 7, step: 1, failure: { code: 'RATE_LIMIT' } },
    async () => undefined)
  check('C: rate limit returns retry action', act1 !== undefined && act1.kind === 'retry')
  const retried = await request({ agent: { id: 'a4' }, turn: 7, step: 1 },
    async () => ({ provider: 'openrouter', model: 'liquid/lfm-2.5-2.6b:free' }))
  check('C: retry lands on next free model', retried.model === 'nvidia/nemotron-3-ultra-550b-a55b:free')

  // Non-rate-limit failures and aborted signals pass through to the host.
  const auth = await requestError({ agent: { id: 'a4' }, turn: 7, step: 1, failure: { code: 'AUTH' } },
    async () => 'host')
  check('C: non-rate-limit failures pass through', auth === 'host')
  const aborted = await requestError(
    { agent: { id: 'a4' }, turn: 7, step: 1, failure: { code: 'RATE_LIMIT' }, signal: { aborted: true } },
    async () => 'host',
  )
  check('C: aborted requests pass through', aborted === 'host')
  // Unknown agent with a paid default: 429 passes through untouched.
  const paidFail = await requestError({ agent: { id: 'a5' }, turn: 1, step: 1, failure: { status: 429 } },
    async () => 'host')
  check('C: paid-model 429 passes through', paidFail === 'host')

  // provider retry-after is honored into the cooldown (dots still healthy).
  await request({ agent: { id: 'a6' }, turn: 1, step: 1 },
    async () => ({ provider: 'openrouter', model: 'dots-studio/dots-3-note-preview:free' }))
  await requestError({ agent: { id: 'a6' }, turn: 1, step: 1,
    failure: { code: 'RATE_LIMIT', providerRetryAfterMs: 3600000 } }, async () => undefined)
  const stCool = await cmd.handler({ rawInput: 'status' })
  check('C: status shows cooling model', stCool.text.includes('冷却中')
    && stCool.text.includes('dots-studio/dots-3-note-preview:free'))

  // Budget: reset cooldowns, then default maxStepRetries=3 retries per turn.
  await cmd.handler({ rawInput: 'reset' })
  await request({ agent: { id: 'a4' }, turn: 8, step: 1 },
    async () => ({ provider: 'openrouter', model: 'dots-studio/dots-3-note-preview:free' })) // issued = dots
  const acts = []
  for (let i = 0; i < 4; i++) {
    acts.push(await requestError({ agent: { id: 'a4' }, turn: 8, step: 1, failure: { code: 'RATE_LIMIT' } },
      async () => 'host'))
  }
  check('C: budget allows 3 retries then surfaces error',
    acts[0].kind === 'retry' && acts[1].kind === 'retry' && acts[2].kind === 'retry' && acts[3] === 'host')

  // Idle resets per-agent rotation state.
  statusListener({ agent: { id: 'a4' }, status: 'idle' })
  await request({ agent: { id: 'a4' }, turn: 9, step: 1 },
    async () => ({ provider: 'openrouter', model: 'dots-studio/dots-3-note-preview:free' })) // dots cooling -> glm
  const freshTurn = await requestError({ agent: { id: 'a4' }, turn: 9, step: 1, failure: { code: 'RATE_LIMIT' } },
    async () => 'host')
  check('C: idle resets rotation budget', freshTurn !== undefined && freshTurn.kind === 'retry')

  // reset clears cooldowns.
  const rst = await cmd.handler({ rawInput: 'reset' })
  const afterReset = await request({ agent: { id: 'a7' }, turn: 1, step: 1 },
    async () => ({ provider: 'openrouter', model: 'z-ai/glm-5.2:free' }))
  check('C: after reset model is usable again', rst.kind === 'success'
    && afterReset.model === 'z-ai/glm-5.2:free')
}

// ---------------------------------------------------------------------------
// Group D: live probe (/free test)
// ---------------------------------------------------------------------------
{
  const h = makeCtx()
  apply(h.ctx, {})
  const cmd = h.state.registered[0]
  h.state.llmFailIds = new Set(['nvidia/nemotron-3-ultra-550b-a55b:free'])

  const tst = await cmd.handler({ rawInput: 'test 3' })
  check('D: test probes via llm.stream', h.state.llmCalls.length === 3
    && h.state.llmCalls[0].model === 'z-ai/glm-5.2:free'
    && h.state.llmCalls[0].maxTokens === 16)
  check('D: test reports failures', /✗/.test(tst.text) && tst.text.includes('2/3'))

  const st = await cmd.handler({ rawInput: 'status' })
  check('D: probed rate-limit enters cooldown', st.text.includes('冷却中')
    && st.text.includes('nvidia/nemotron-3-ultra-550b-a55b:free'))
}

// ---------------------------------------------------------------------------
// Group E: degrade without host services
// ---------------------------------------------------------------------------
{
  const h = makeCtx()
  h.ctx.get = () => undefined
  try {
    apply(h.ctx, {})
    check('E: missing services degrade without crash', true)
  } catch (e) {
    check('E: missing services degrade without crash: ' + e.message, false)
  }
}

console.log(out.join('\n'))
if (process.exitCode) { console.error('smoke: FAILED'); process.exit(1) }
console.log('smoke-host: all assertions passed ✓')
