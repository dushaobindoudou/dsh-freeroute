/**
 * dsh-freeroute - free-tier model routing for the DeepSeek Harness (dsh).
 *
 * Discovers free LLM models (OpenRouter `:free` catalog, fetched live),
 * ranks them with an explainable score (context, output cap, freshness,
 * active-parameter size, family), and keeps free traffic flowing:
 *
 * - `/free on` takeover mode rewrites every model request to the best free
 *   model through the `agent/request` waterfall - runtime only, persisted
 *   paid config is never touched.
 * - On rate-limit failures (`RATE_LIMIT` / `QUOTA` / HTTP 429 / 402) the
 *   model enters a cooldown and the watcher returns `{ kind: 'retry' }`;
 *   the retried request re-enters `agent/request` and lands on the next
 *   best free model - mid-step rotation, no user-visible failure.
 * - Without takeover, an explicitly-selected free model that hits its limit
 *   self-heals the same way (free guard).
 *
 * Constraints honored (verified against dsh source, rc.6):
 * - The agent loop re-enters `agent/request` on every `{kind:'retry'}`, so
 *   rotation happens inside the failing step, not just at turn boundaries.
 * - `agentDefaultModel.currentSelection()/saveSelection()` is the supported
 *   default-selection seam; `settings` is never written directly.
 * - Zero runtime dependencies; every host service is read via ctx.get and
 *   missing services degrade to actionable guidance.
 */

export const FREEROUTE_VERSION = '0.2.0'

const PROVIDER = 'openrouter'
const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const CATALOG_TTL_MS = 60 * 60 * 1000
const CATALOG_TIMEOUT_MS = 15000
const PROBE_TIMEOUT_MS = 15000

/** Failure codes that mean "this free model's quota is gone for now". */
const EXHAUST_CODES = new Set(['RATE_LIMIT', 'QUOTA'])
const EXHAUST_STATUS = new Set([429, 402])

/**
 * Family reputation bonus, first substring match on the model id wins.
 * Ordered most-specific first.
 */
const FAMILY_BONUS = [
  ['glm', 10],
  ['qwen', 10],
  ['deepseek', 10],
  ['kimi', 8],
  ['llama-4', 8],
  ['nemotron-ultra', 10],
  ['nemotron-super', 8],
  ['codestral', 8],
  ['gemma-4', 6],
  ['north', 5],
  ['inkling', 5],
  ['mistral', 5],
  ['nemotron', 2],
  ['lfm', 2],
]

/** Classifier/guard models are not chat models - never route to them. */
const NON_CHAT_RE = /content-safety|guard|moderation|shield|embed/i

function isRateLimitFailure(failure) {
  if (!failure || typeof failure !== 'object') return false
  if (EXHAUST_CODES.has(String(failure.code))) return true
  if (failure.status !== undefined && EXHAUST_STATUS.has(Number(failure.status))) return true
  return false
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

/** Parse active-parameter count from the catalog description or MoE id. */
function parseActiveParams(id, description) {
  const idm = /-a(\d+(?:\.\d+)?)b(?=[-:]|$)/.exec(id || '')
  if (idm) return Number(idm[1])
  const dm = /([\d.]+)\s*B\b[^.]{0,30}active/i.exec(String(description || ''))
  if (dm) return Number(dm[1])
  return null
}

function fmtCtx(n) {
  if (!n) return '?'
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'k'
  return String(n)
}

function fmtDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 90) return s + ' 秒'
  return Math.ceil(s / 60) + ' 分钟'
}

/**
 * Score one catalog entry. Returns `{ score, flags }`; flags are short
 * human-readable tokens that explain the score.
 */
function scoreEntry(entry, now) {
  let score = 0
  const flags = []

  if (entry.ctx >= 256000) { score += 25; flags.push('ctx≥256k') }
  else if (entry.ctx >= 128000) { score += 20; flags.push('ctx≥128k') }
  else if (entry.ctx >= 64000) { score += 12; flags.push('ctx≥64k') }
  else if (entry.ctx >= 32000) { score += 6; flags.push('ctx≥32k') }

  if (entry.maxOut !== null) {
    if (entry.maxOut >= 65536) { score += 10; flags.push('out≥64k') }
    else if (entry.maxOut >= 32768) { score += 7; flags.push('out≥32k') }
    else if (entry.maxOut >= 16384) { score += 4 }
    else { score -= 4; flags.push('out<16k') }
  }

  const ageDays = entry.created ? (now - entry.created) / 86400000 : Infinity
  if (ageDays <= 60) { score += 15; flags.push('新') }
  else if (ageDays <= 120) { score += 10 }
  else if (ageDays <= 240) { score += 5 }

  if (entry.activeParams !== null) {
    if (entry.activeParams >= 30) { score += 15; flags.push(entry.activeParams + 'B 激活') }
    else if (entry.activeParams >= 14) { score += 10; flags.push(entry.activeParams + 'B 激活') }
    else if (entry.activeParams >= 7) { score += 4 }
    else { score -= 15; flags.push('tiny ' + entry.activeParams + 'B') }
  }

  const id = entry.id.toLowerCase()
  for (const [frag, bonus] of FAMILY_BONUS) {
    if (id.includes(frag)) {
      score += bonus
      if (bonus >= 8) flags.push('强系')
      break
    }
  }

  if (entry.think) { score -= 5; flags.push('强制思考') }
  if (/preview|experimental/.test(id)) { score -= 6; flags.push('预览') }
  if (/(^|[-/])note/.test(id)) { score -= 8; flags.push('笔记特调') }
  if (entry.expiresAt !== null && entry.expiresAt - now <= 30 * 86400000) {
    score -= 6
    flags.push('≤30天下线')
  }
  if (entry.image) flags.push('img')
  if (entry.audio) flags.push('音视频')

  return { score, flags }
}

/** Map one raw OpenRouter catalog entry onto freeroute's shape. */
function parseEntry(m) {
  const arch = (m && m.architecture) || {}
  const inMod = Array.isArray(arch.input_modalities) ? arch.input_modalities : undefined
  const outMod = Array.isArray(arch.output_modalities) ? arch.output_modalities : undefined
  const sp = Array.isArray(m.supported_parameters) ? m.supported_parameters : undefined
  const expiresAt = m.expiration_date ? Date.parse(m.expiration_date) : NaN
  return {
    id: m.id,
    name: typeof m.name === 'string' ? m.name.replace(/\s*\(free\)$/i, '') : m.id,
    ctx: Number(m.context_length) || 0,
    maxOut: m.top_provider && Number.isFinite(+m.top_provider.max_completion_tokens)
      ? +m.top_provider.max_completion_tokens
      : null,
    created: (Number(m.created) || 0) * 1000,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    tools: sp !== undefined ? sp.includes('tools') : null,
    image: inMod !== undefined ? inMod.includes('image') : false,
    audio: inMod !== undefined ? (inMod.includes('audio') || inMod.includes('video')) : false,
    textOut: outMod !== undefined ? outMod.includes('text') : true,
    think: Boolean(m.reasoning && m.reasoning.mandatory),
    activeParams: parseActiveParams(m.id, m.description),
  }
}

function applyHardFilters(list, config) {
  const now = Date.now()
  return list.filter((e) => {
    if (!e.textOut) return false
    if (e.tools === false) return false
    if (NON_CHAT_RE.test(e.id)) return false
    if (e.expiresAt !== null && e.expiresAt <= now) return false
    if (e.ctx < config.minContext) return false
    for (const frag of config.exclude) {
      if (frag && e.id.toLowerCase().includes(frag.toLowerCase())) return false
    }
    return true
  })
}

/**
 * Filter, score, and rank raw OpenRouter catalog entries (`body.data`).
 * Shared by the host plugin, the web client panel, and the standalone
 * preview so every surface shows the same ordering. Browser-safe (pure).
 */
export function rankFreeModels(rawModels, opts = {}) {
  const filterCfg = {
    minContext: Math.max(0, Math.floor(Number(opts.minContext) || 8000)),
    exclude: Array.isArray(opts.exclude) ? opts.exclude.map(String) : [],
  }
  const now = Date.now()
  const kept = applyHardFilters(
    (Array.isArray(rawModels) ? rawModels : [])
      .filter((m) => m && typeof m.id === 'string' && m.id.endsWith(':free'))
      .map((m) => parseEntry(m)),
    filterCfg,
  )
  for (const e of kept) {
    const { score, flags } = scoreEntry(e, now)
    e.score = score
    e.flags = flags
  }
  kept.sort((a, b) => (b.score - a.score) || (b.ctx - a.ctx) || (b.created - a.created))
  return kept
}

export function apply(ctx, config = {}) {
  const cfg = {
    takeover: config.takeover === true,
    autoRotate: config.autoRotate !== false,
    cooldownMs: clamp((Number(config.cooldownMinutes) || 10) * 60 * 1000, 30 * 1000, 24 * 60 * 60 * 1000),
    maxStepRetries: clamp(Math.floor(Number(config.maxStepRetries) || 3), 1, 10),
    minContext: Math.max(0, Math.floor(Number(config.minContext) || 8000)),
    exclude: Array.isArray(config.exclude) ? config.exclude.map(String) : [],
  }

  const commands = ctx.get('commands')

  /** @type {any[]} ranked catalog entries, best first */
  let catalog = []
  let catalogAt = 0
  let catalogError = ''
  let inflight = null

  /** model id -> { until, reason, fails } cooldown marks */
  const health = new Map()
  /** agent key -> { turn, model } final model of the agent's latest request */
  const issued = new Map()
  /** agent key -> { turn, count } rotation retries this turn */
  const budget = new Map()

  let takeover = cfg.takeover
  let pinned = ''
  let originalSelection
  const stats = { rewrites: 0, rotations: 0, lastRotation: null }

  function svc(name) {
    try { return ctx.get(name) } catch { return undefined }
  }

  function log(level, msg) {
    try { ctx.logger('freeroute')[level](msg) } catch { /* logger optional */ }
  }

  function healthy(id) {
    const h = health.get(id)
    return h === undefined || h.until <= Date.now()
  }

  function cooling(id) {
    const h = health.get(id)
    if (h === undefined || h.until <= Date.now()) return undefined
    return h
  }

  function markExhausted(id, reason, retryAfterMs) {
    const prev = health.get(id)
    let ms = cfg.cooldownMs
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) ms = clamp(retryAfterMs, 60 * 1000, 24 * 60 * 60 * 1000)
    health.set(id, { until: Date.now() + ms, reason, fails: (prev ? prev.fails : 0) + 1 })
    return ms
  }

  async function refreshCatalog(force = false) {
    if (inflight !== null) return inflight
    if (!force && catalog.length > 0 && Date.now() - catalogAt < CATALOG_TTL_MS) return catalog
    inflight = (async () => {
      try {
        const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const body = await res.json()
        catalog = rankFreeModels(body.data, cfg)
        catalogAt = Date.now()
        catalogError = ''
      } catch (e) {
        catalogError = String((e && e.message) || e)
      } finally {
        inflight = null
      }
      return catalog
    })()
    return inflight
  }

  /** Best healthy catalog candidate, preferring the pinned model. */
  async function pickModel() {
    await refreshCatalog()
    if (pinned && healthy(pinned)) {
      const pinnedEntry = catalog.find((e) => e.id === pinned)
      if (pinnedEntry !== undefined) return pinnedEntry
    }
    return catalog.find((e) => healthy(e.id)) || undefined
  }

  function currentSelection() {
    const svcDefaultModel = svc('agentDefaultModel')
    try {
      const s = svcDefaultModel.currentSelection()
      if (s && typeof s === 'object' && typeof s.provider === 'string') return s
    } catch { /* selection service may be mid-reload */ }
    return undefined
  }

  async function saveSelection(id) {
    const svcDefaultModel = svc('agentDefaultModel')
    if (svcDefaultModel === undefined) {
      return { ok: false, error: 'agentDefaultModel 服务未挂载，无法保存默认模型' }
    }
    try {
      await svcDefaultModel.saveSelection({ provider: PROVIDER, model: id })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: '保存默认模型失败: ' + String((e && e.message) || e) }
    }
  }

  function agentKeyOf(payload) {
    return payload && payload.agent && payload.agent.id ? String(payload.agent.id) : 'agent'
  }

  async function handleCommand(raw) {
    const parts = raw.split(/\s+/).filter(Boolean)
    const sub = (parts[0] || 'status').toLowerCase()
    const arg1 = parts[1] || ''
    try {
      switch (sub) {
        case 'status':
        case 'help':
          return await statusResult()
        case 'list':
          await refreshCatalog()
          return listResult(Number(arg1) || 15)
        case 'use':
          return await useResult(arg1)
        case 'rotate':
          return await rotateResult()
        case 'on':
          return onResult(arg1)
        case 'off':
          return offResult()
        case 'reset':
          health.clear()
          return { kind: 'success', text: '已清空冷却标记，所有免费模型立即可用' }
        case 'refresh':
          catalog = []
          await refreshCatalog(true)
          return catalog.length > 0
            ? { kind: 'success', text: '目录已刷新: ' + catalog.length + ' 个免费模型' }
            : { kind: 'error', text: '目录刷新失败' + (catalogError ? '（' + catalogError + '）' : '') }
        case 'test':
          return await testResult(clamp(Number(arg1) || 5, 1, 10))
        default:
          return { kind: 'error', text: '未知子命令: ' + sub + '\n用法: /free [status|list|use|rotate|on|off|reset|refresh|test]' }
      }
    } catch (e) {
      return { kind: 'error', text: '/free 失败: ' + String((e && e.message) || e) }
    }
  }

  function providerRegistered() {
    const llm = svc('llm')
    try {
      const providers = llm.listProviders()
      return Array.isArray(providers) && providers.some((p) => p && p.id === PROVIDER)
    } catch { return undefined }
  }

  async function statusResult() {
    await refreshCatalog()
    const cur = currentSelection()
    const best = catalog[0]
    const lines = ['dsh-freeroute ' + FREEROUTE_VERSION]
    lines.push('接管模式: ' + (takeover ? '开启（' + (pinned ? '固定 ' + pinned : '动态最优') + '）' : '关闭（/free on 开启）'))
    if (takeover && originalSelection !== undefined) {
      lines.push('接管前默认: ' + originalSelection.provider + ' / ' + originalSelection.model)
    }
    lines.push('当前最优: ' + (best ? best.id + '（score ' + best.score + '，ctx ' + fmtCtx(best.ctx) + '）' : '（目录未加载）'))
    lines.push('当前默认: ' + (cur ? cur.provider + ' / ' + cur.model : '(未知)'))
    const age = catalogAt ? fmtDuration(Date.now() - catalogAt) : '-'
    lines.push('免费目录: ' + catalog.length + ' 个模型（' + age + '前刷新' + (catalogError ? '，上次失败: ' + catalogError : '') + '）')
    const coolingNow = catalog
      .map((e) => ({ e, c: cooling(e.id) }))
      .filter((x) => x.c !== undefined)
    if (coolingNow.length > 0) {
      lines.push('冷却中: ' + coolingNow.map((x) => x.e.id + '（还需 ' + fmtDuration(x.c.until - Date.now()) + '）').join(', '))
    }
    const reg = providerRegistered()
    if (reg === false) lines.push('⚠ 未检测到 openrouter provider，请在 dsh 中配置 OpenRouter API key')
    lines.push('本次运行: 改写 ' + stats.rewrites + ' 次, 轮转 ' + stats.rotations + ' 次')
    lines.push('用法: /free list | use <id> | rotate | on [id] | off | reset | refresh | test')
    return { kind: 'success', text: lines.join('\n') }
  }

  function listResult(n) {
    const shown = catalog.slice(0, n)
    if (shown.length === 0) {
      return { kind: 'error', text: '免费目录为空' + (catalogError ? '（' + catalogError + '）' : '') + '，试试 /free refresh' }
    }
    const lines = ['免费模型排行（score 降序，前 ' + shown.length + '/' + catalog.length + '）:']
    shown.forEach((e, i) => {
      const cd = cooling(e.id)
      const flagText = e.flags.length > 0 ? ' [' + e.flags.join('][') + ']' : ''
      const state = cd ? ' [冷却 ' + fmtDuration(cd.until - Date.now()) + ']' : (pinned === e.id ? ' [已固定]' : '')
      lines.push((i + 1) + '. ' + e.id + '  ' + e.score + flagText + state)
    })
    lines.push('ctx 标记为上下文档位；/free use <id> 设为默认，/free on 开启接管')
    return { kind: 'success', text: lines.join('\n') }
  }

  async function useResult(id) {
    if (!id) return { kind: 'error', text: '用法: /free use <model-id>（先 /free list）' }
    await refreshCatalog()
    if (catalog.length > 0 && catalog.find((e) => e.id === id) === undefined) {
      if (!id.endsWith(':free')) return { kind: 'error', text: '不是免费模型: ' + id + '（本插件只路由 *:free）' }
      return { kind: 'error', text: '目录中没有该模型: ' + id + '（/free list 查看）' }
    }
    const r = await saveSelection(id)
    if (!r.ok) return { kind: 'error', text: r.error }
    return { kind: 'success', text: '默认模型已设为 ' + id + '（新会话生效；本会话可用 /free on 立即接管）' }
  }

  async function rotateResult() {
    await refreshCatalog()
    const cur = currentSelection()
    const curId = cur && cur.provider === PROVIDER ? cur.model : ''
    const next = await pickModel()
    if (next === undefined) {
      return { kind: 'error', text: '没有可用的免费模型（全在冷却中）。/free reset 可清空冷却标记。' }
    }
    if (next.id === curId) return { kind: 'success', text: '当前已是最好的免费模型: ' + curId }
    const r = await saveSelection(next.id)
    if (!r.ok) return { kind: 'error', text: r.error }
    return { kind: 'success', text: '默认模型已轮转到 ' + next.id + '（score ' + next.score + '，新会话生效）' }
  }

  function onResult(id) {
    takeover = true
    pinned = id || ''
    if (originalSelection === undefined) originalSelection = currentSelection()
    return {
      kind: 'success',
      text: '接管已开启: 所有模型请求将改写到 ' + (pinned ? pinned : '最优免费模型')
        + '，限流时自动轮转。/free off 恢复。\n（仅运行时接管，不改写已保存的默认模型配置）',
    }
  }

  function offResult() {
    takeover = false
    pinned = ''
    return { kind: 'success', text: '接管已关闭，请求回到原默认模型' }
  }

  /** Probe the top-N models with a minimal real request through llm.stream. */
  async function testResult(n) {
    const llm = svc('llm')
    if (llm === undefined) return { kind: 'error', text: 'llm 服务未挂载，无法探测' }
    await refreshCatalog()
    if (catalog.length === 0) {
      return { kind: 'error', text: '目录为空' + (catalogError ? '（' + catalogError + '）' : '') }
    }
    const targets = catalog.slice(0, n)
    const lines = ['探测 top ' + targets.length + '（每个 1 次请求, maxTokens 16, 顺序执行）:']
    let okCount = 0
    for (const e of targets) {
      const t0 = Date.now()
      let okFlag = true
      let detail = ''
      try {
        const stream = llm.stream({
          provider: PROVIDER,
          model: e.id,
          messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
          maxTokens: 16,
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        for await (const _chunk of stream) { /* drain to completion */ }
      } catch (err) {
        okFlag = false
        detail = String((err && err.code) || (err && err.message) || err).slice(0, 80)
        if (err && (err.code === 'RATE_LIMIT' || err.code === 'QUOTA')) {
          markExhausted(e.id, '探测限流', undefined)
        }
      }
      const ms = Date.now() - t0
      lines.push((okFlag ? '✓ ' + fmtDuration(ms) : '✗ ' + detail) + '  ' + e.id)
      if (okFlag) okCount++
    }
    lines.push(okCount + '/' + targets.length + ' 可用；探测限流的模型已进入冷却')
    return { kind: 'success', text: lines.join('\n') }
  }

  /**
   * Request takeover / free guard: rewrite the frozen call configuration to a
   * healthy free model. Runs on every attempt, including retries after
   * `{ kind: 'retry' }`, which is what makes mid-step rotation work.
   */
  ctx.on('agent/request', async (payload, next) => {
    const cfg0 = await next()
    if (cfg0 === null || typeof cfg0 !== 'object') return cfg0
    const key = agentKeyOf(payload)
    try {
      const seedIsFree = cfg0.provider === PROVIDER
        && typeof cfg0.model === 'string' && cfg0.model.endsWith(':free')
      const rewrite = takeover || (seedIsFree && cfg.autoRotate && !healthy(cfg0.model))
      let final = cfg0
      if (rewrite) {
        const pick = await pickModel()
        if (pick !== undefined && !(cfg0.provider === PROVIDER && cfg0.model === pick.id)) {
          const next0 = { ...cfg0, provider: PROVIDER, model: pick.id }
          // Inherited reasoning effort belongs to the old model; let the new
          // model's adapter apply its own default.
          if ('reasoningEffort' in next0) delete next0.reasoningEffort
          stats.rewrites++
          log('info', 'request -> ' + pick.id + (takeover ? ' (takeover)' : ' (free guard)'))
          final = next0
        }
      }
      issued.set(key, { turn: payload.turn, model: final.model })
      return final
    } catch (e) {
      log('warn', 'agent/request rewrite skipped: ' + String((e && e.message) || e))
      return cfg0
    }
  })

  /**
   * Rate-limit watcher: mark the failed free model exhausted and, when a
   * replacement exists and the per-turn budget allows, force a retry that
   * re-enters agent/request on the next best free model.
   */
  ctx.on('agent/request-error', async (payload, next) => {
    const failure = payload && payload.failure
    if (!isRateLimitFailure(failure)) return next()
    if (payload.signal && payload.signal.aborted) return next()

    const key = agentKeyOf(payload)
    const rec = issued.get(key)
    let model = rec && rec.turn === payload.turn ? rec.model : ''
    if (!model) {
      const cur = currentSelection()
      model = cur && cur.provider === PROVIDER && typeof cur.model === 'string' && cur.model.endsWith(':free')
        ? cur.model : ''
    }
    if (!model || !model.endsWith(':free')) return next()
    if (!takeover && !cfg.autoRotate) return next()

    const reason = String((failure && failure.code) || failure.status || 'RATE_LIMIT')
    const retryAfter = failure && failure.providerRetryAfterMs
    const cdMs = markExhausted(model, reason, retryAfter)
    log('info', 'free model exhausted (' + reason + '), cooling ' + fmtDuration(cdMs) + ': ' + model)

    const replacement = await pickModel()
    if (replacement === undefined) return next()

    const b = budget.get(key)
    const used = b && b.turn === payload.turn ? b.count : 0
    if (used >= cfg.maxStepRetries) {
      log('warn', 'rotation budget exhausted for this turn (' + cfg.maxStepRetries + '), surfacing error')
      return next()
    }
    budget.set(key, { turn: payload.turn, count: used + 1 })
    stats.rotations++
    stats.lastRotation = { from: model, to: replacement.id, at: Date.now(), reason }
    log('info', 'retrying on next free model: ' + replacement.id)
    return { kind: 'retry' }
  })

  // Reset per-agent rotation state when the agent goes idle.
  ctx.on('agent/status', (payload) => {
    if (payload && payload.status === 'idle') {
      budget.delete(agentKeyOf(payload))
      issued.delete(agentKeyOf(payload))
    }
  })

  if (commands !== undefined) {
    ctx.effect(() => commands.register({
      name: 'free',
      description: '免费额度模型路由（dsh-freeroute）',
      input: { hint: '[status|list [n]|use <id>|rotate|on [id]|off|reset|refresh|test [n]]' },
      handler: (inv) => handleCommand(typeof inv.rawInput === 'string' ? inv.rawInput.trim() : ''),
    }))
  }
}

// Host services this plugin reads are all optional at runtime (ctx.get +
// graceful degradation), so no inject declarations.
export const inject = []
