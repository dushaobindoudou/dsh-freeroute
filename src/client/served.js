// ---- 每条回复的模型归属标注 -------------------------------------------------
// auto 模式下用户看到的模型名永远是「⚡ Auto」，真正回答的是池子里某一家上游
// 的某个模型。归属由宿主在适配器成功出字时记录、assistant/message 落地时绑到
// messageId 上，客户端只按 messageId 查一次（按会话缓存，带 1s 新鲜窗口：同一
// 批新消息共用一次请求，老消息重挂载也不会重复打）。
const SERVED_CACHE_MAX = 12
const servedCache = new Map()
// 归属可能比消息本体晚一拍落地（宿主在 assistant/message 事件里才绑 messageId，
// 客户端拿到的 RPC 快照可能还差这一条）。挂载时查空不当作「没有」，短窗口内补查
// 两次：第一次落在 1s 新鲜期内直接吃缓存（零请求），第二次缓存过期才真发一次。
const SERVED_RETRY_MS = 700
const SERVED_RETRIES = 2

function servedCacheEntry(sessionId) {
  const key = String(sessionId)
  let entry = servedCache.get(key)
  if (entry) return entry
  entry = { byMessage: {}, at: 0, pending: null }
  servedCache.set(key, entry)
  while (servedCache.size > SERVED_CACHE_MAX) {
    const oldest = servedCache.keys().next()
    if (oldest.done || oldest.value === key) break
    servedCache.delete(oldest.value)
  }
  return entry
}

function servedLoad(sessionId) {
  const entry = servedCacheEntry(sessionId)
  if (entry.at > 0 && Date.now() - entry.at < 1000) return Promise.resolve(entry.byMessage)
  if (entry.pending) return entry.pending
  entry.pending = host.call('freeroute.served', { sessionId: String(sessionId) }).then(function (r) {
    entry.pending = null
    const map = r && r.messages && typeof r.messages === 'object' ? r.messages : {}
    entry.byMessage = map
    entry.at = Date.now()
    return map
  }).catch(function () {
    entry.pending = null
    return entry.byMessage
  })
  return entry.pending
}

// 「13:17」右侧的小标签：模型名 + 悬浮说明（上游 / 请求模型）。
function servedText(value) {
  return value === undefined || value === null ? '' : String(value)
}

function ServedBadge(props) {
  const sessionId = servedText(props && props.sessionId)
  const messageId = servedText(props && props.messageId)
  const s0 = React.useState(null)
  const record = s0[0]
  const setRecord = s0[1]

  React.useEffect(function () {
    if (sessionId.length === 0 || messageId.length === 0) return
    let alive = true
    let tries = 0
    let timer = null
    function load() {
      servedLoad(sessionId).then(function (map) {
        if (!alive || !map) return
        const hit = map[messageId]
        if (hit) {
          setRecord(hit)
          return
        }
        if (tries++ >= SERVED_RETRIES) return
        timer = setTimeout(function () { if (alive) load() }, SERVED_RETRY_MS)
      }).catch(function () { })
    }
    load()
    return function () {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [sessionId, messageId])

  if (!record || typeof record !== 'object') return null
  const model = String(record.model || '')
  if (model.length === 0) return null
  const shown = model.length > 32 ? model.slice(0, 31) + '…' : model
  const hint = []
  hint.push('上游 ' + (record.upstreamName || record.upstream || '未知'))
  if (record.requested && record.requested !== model) hint.push('请求 ' + record.requested)
  return React.createElement('span', {
    className: 'frp-served',
    title: hint.join(' · ')
  }, '⚡ ' + shown)
}
