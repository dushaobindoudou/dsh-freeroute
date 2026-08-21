/**
 * dsh-freeroute — free-tier model routing for the DeepSeek Harness (dsh).
 *
 * Discovers free LLM models (OpenRouter `:free` catalog, fetched live),
 * applies the best free model as the agent default, and rotates to the next
 * free model when the current one hits rate limits. Paid configuration is
 * never touched until you ask for it.
 *
 * Constraints honored (verified against dsh 0.1.0-rc.6):
 * - `agent/request-error` only supports same-model retry decisions, so
 *   rotation happens at session/turn boundaries by rewriting the
 *   `agent-default-model` settings user layer via `settings.merge`.
 * - Zero runtime dependencies; every host service is read via ctx.get and
 *   missing services degrade to actionable guidance.
 */
export const FREEROUTE_VERSION = '0.1.0'
const DEFAULT_MODEL_NS = 'agent-default-model'
const PROVIDER = 'openrouter'
const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const CATALOG_TTL_MS = 60 * 60 * 1000

const RATE_CODES = new Set(['429', 'rate_limit', 'RATE_LIMIT', 'quota_exceeded', 'QUOTA_EXCEEDED'])

export function apply(ctx, config = {}) {
  const autoRotate = config.autoRotate !== false
  const commands = ctx.get('commands')
  const settings = ctx.get('settings')
  const defaultModel = ctx.get('agentDefaultModel')

  let catalog = []
  let catalogAt = 0
  let catalogError = ''
  const exhausted = new Set()

  async function refreshCatalog(force = false) {
    if (!force && catalog.length > 0 && Date.now() - catalogAt < CATALOG_TTL_MS) return catalog
    try {
      const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const body = await res.json()
      catalog = (Array.isArray(body.data) ? body.data : [])
        .filter((m) => typeof m.id === 'string' && m.id.endsWith(':free'))
        .map((m) => ({
          id: m.id,
          name: typeof m.name === 'string' ? m.name : m.id,
          context: Number(m.context_length) || 0,
        }))
        .sort((a, b) => b.context - a.context)
      catalogAt = Date.now()
      catalogError = ''
    } catch (e) {
      catalogError = String((e && e.message) || e)
      if (catalog.length === 0) catalog = []
    }
    return catalog
  }

  function current() {
    try {
      const s = defaultModel.source()
      if (s && typeof s === 'object') return { provider: s.provider, model: s.model }
    } catch { /* source thunk may fall back during settings reload */ }
    return undefined
  }

  async function candidates() {
    await refreshCatalog()
    return catalog.filter((m) => !exhausted.has(m.id))
  }

  async function applyModel(id) {
    if (settings === undefined) return { ok: false, error: 'settings service not mounted' }
    const model = catalog.find((m) => m.id === id)
    if (model === undefined) return { ok: false, error: 'unknown free model: ' + id + '（先跑 /free list）' }
    try {
      await settings.merge(DEFAULT_MODEL_NS, { provider: PROVIDER, model: id })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: 'settings.merge 失败: ' + String((e && e.message) || e) }
    }
  }

  async function rotate() {
    const next = (await candidates())[0]
    if (next === undefined) return { ok: false, error: '没有可用的免费模型了（全部被标记为耗尽）。/free reset 可清空标记。' }
    const r = await applyModel(next.id)
    if (!r.ok) return r
    return { ok: true, model: next }
  }

  function statusText() {
    const cur = current()
    const lines = ['dsh-freeroute ' + FREEROUTE_VERSION]
    lines.push('当前默认: ' + (cur ? cur.provider + ' / ' + cur.model : '(未知)'))
    lines.push('免费目录: ' + catalog.length + ' 个模型' + (catalogError ? '（刷新失败: ' + catalogError + '）' : ''))
    lines.push('已耗尽: ' + (exhausted.size === 0 ? '无' : [...exhausted].join(', ')))
    lines.push('自动轮转: ' + (autoRotate ? '开' : '关'))
    lines.push('用法: /free list | use <id> | rotate | reset')
    return { kind: 'success', text: lines.join('\n') }
  }

  if (commands !== undefined) {
    ctx.effect(() => commands.register({
      name: 'free',
      description: '免费额度模型路由（dsh-freeroute）',
      input: { hint: '[status|list|use <model-id>|rotate|reset]' },
      handler: async (inv) => {
        const raw = typeof inv.rawInput === 'string' ? inv.rawInput.trim() : ''
        const lower = raw.toLowerCase()
        try {
          if (raw === '' || lower === 'status' || lower === 'help') {
            await refreshCatalog()
            return statusText()
          }
          if (lower === 'list') {
            const list = await candidates()
            if (list.length === 0) return { kind: 'error', text: '免费目录为空' + (catalogError ? '（' + catalogError + '）' : '') + '，稍后重试 /free list' }
            const head = list.slice(0, 15).map((m) => '- ' + m.id + (m.context ? '  [ctx ' + m.context + ']' : ''))
            return { kind: 'success', text: '免费模型（按上下文长度排序，前 ' + head.length + '/' + list.length + '）:\n' + head.join('\n') }
          }
          if (lower === 'rotate') {
            const r = await rotate()
            if (!r.ok) return { kind: 'error', text: r.error }
            return { kind: 'success', text: '默认模型已切到免费模型 ' + r.model.id + '（新回合/新会话生效）' }
          }
          if (lower === 'reset') {
            exhausted.clear()
            return { kind: 'success', text: '已清空耗尽标记（' + exhausted.size + '）' }
          }
          if (lower.indexOf('use ') === 0) {
            await refreshCatalog()
            const r = await applyModel(raw.slice(4).trim())
            if (!r.ok) return { kind: 'error', text: r.error }
            return { kind: 'success', text: '默认模型已切到 ' + raw.slice(4).trim() + '（新回合/新会话生效）' }
          }
          return { kind: 'error', text: '用法: /free [status|list|use <model-id>|rotate|reset]' }
        } catch (e) {
          return { kind: 'error', text: '/free 失败: ' + String((e && e.message) || e) }
        }
      },
    }))
  }

  // Rate-limit watcher: when the active free model gets throttled, mark it
  // exhausted and rotate the default for future turns/sessions. The request
  // itself keeps the host's own recovery behavior (`next()` passthrough).
  if (autoRotate) {
    ctx.on('agent/request-error', async (payload, next) => {
      const cur = current()
      const failure = payload && payload.failure
      if (
        cur && cur.provider === PROVIDER && typeof cur.model === 'string' && cur.model.endsWith(':free')
        && failure && RATE_CODES.has(String(failure.code))
      ) {
        if (!exhausted.has(cur.model)) {
          exhausted.add(cur.model)
          try { ctx.logger('freeroute').info('free model exhausted, rotating: ' + cur.model) } catch { /* logger optional */ }
          const r = await rotate()
          if (r.ok) try { ctx.logger('freeroute').info('rotated default to ' + r.model.id) } catch { /* optional */ }
        }
      }
      return next()
    })
  }
}

// Host services this plugin reads. `settings`/`commands`/`agentDefaultModel`
// are optional at runtime (ctx.get + graceful degradation), so no inject.
export const inject = []
