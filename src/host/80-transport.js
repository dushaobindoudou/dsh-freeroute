    async function ensureCurl() {
      if (curlCache) return curlCache
      if (subprocess === undefined) throw mkFail('subprocess 服务不可用，无法发起请求', 'CONFIG')
      try { curlCache = await subprocess.resolveExecutable('curl') } catch (e) { throw mkFail('找不到 curl：' + emsg(e), 'CONFIG') }
      return curlCache
    }

    function flattenText(blocks) {
      let out = ''
      for (const b of blocks || []) if (b && b.type === 'text' && typeof b.text === 'string') out += b.text
      return out
    }

    function contentBlocks(content) {
      // dsh 契约是块数组（content:[{type:'text',text:…}]）；防御性兼容
      // 裸字符串（OpenAI 原生形态），避免被展平成空串后「空消息」发往上游。
      if (typeof content === 'string') return content.length > 0 ? [{ type: 'text', text: content }] : []
      return Array.isArray(content) ? content : []
    }

    function serializeMessages(messages) {
      const wire = []
      for (const m of messages || []) {
        const blocks = contentBlocks(m.content)
        for (const b of blocks) { if (b && b.type === 'image') throw mkFail('FreeRoute 免费路由暂不支持图片内容', 'UNSUPPORTED_CONTENT') }
        if (m.role === 'system') { wire.push({ role: 'system', content: flattenText(blocks) }); continue }
        if (m.role === 'assistant') {
          const toolCalls = []
          for (const b of blocks) {
            if (b && b.type === 'tool-call') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: b.arguments } })
          }
          const msg = { role: 'assistant', content: flattenText(blocks) }
          if (toolCalls.length > 0) msg.tool_calls = toolCalls
          wire.push(msg)
          continue
        }
        const toolResults = []
        for (const b of blocks) { if (b && b.type === 'tool-result') toolResults.push(b) }
        const text = flattenText(blocks)
        if (text.length > 0 || toolResults.length === 0) wire.push({ role: 'user', content: text })
        for (const r of toolResults) wire.push({ role: 'tool', tool_call_id: r.toolCallId, content: flattenText(r.content) || '(no output)' })
      }
      return wire
    }

    function serializeRequest(options, model) {
      const messages = []
      if (options.system !== undefined && options.system !== null) messages.push({ role: 'system', content: String(options.system) })
      for (const w of serializeMessages(options.messages)) messages.push(w)
      const req = { model: model, messages: messages, stream: true, stream_options: { include_usage: true } }
      if (options.tools && options.tools.length > 0) {
        req.tools = options.tools.map(function (t) { return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } } })
      }
      if (options.temperature !== undefined) req.temperature = options.temperature
      if (options.maxTokens !== undefined) req.max_tokens = options.maxTokens
      if (options.stop !== undefined) req.stop = options.stop
      return req
    }

    function mapFinishReason(reason) {
      if (reason === 'stop') return { kind: 'stop' }
      if (reason === 'tool_calls' || reason === 'function_call') return { kind: 'tool-calls' }
      if (reason === 'length' || reason === 'max_tokens') return { kind: 'max-tokens' }
      return { kind: 'error', failure: { message: '模型停止: ' + reason, code: String(reason).toUpperCase() } }
    }
    function mapUsage(u) {
      let input = Number(u.prompt_tokens) || 0
      const output = Number(u.completion_tokens) || 0
      const cached = (u.prompt_tokens_details && Number(u.prompt_tokens_details.cached_tokens)) || 0
      if (cached > 0) input -= cached
      const out = { inputTokens: input, outputTokens: output }
      if (cached > 0) out.cacheReadTokens = cached
      return out
    }
    function wireError(e) {
      const msg = String((e && (e.message || e.type)) || '上游错误')
      const blob = (msg + ' ' + String((e && e.code) || '') + ' ' + String((e && e.type) || '')).toLowerCase()
      let code = 'SERVER'
      if (/rate|429|quota|配额/.test(blob)) code = 'RATE_LIMIT'
      else if (/auth|401|403|api key|apikey|unauthorized/.test(blob)) code = 'AUTH'
      else if (/context|token limit|too long/.test(blob)) code = 'CONTEXT_WINDOW_EXCEEDED'
      return mkFail(msg, code)
    }

    function createTranslator() {
      let nextIndex = 0
      let textBlock = null
      let reasoningBlock = null
      const toolBlocks = new Map()
      const order = []
      let pendingFinish = null
      let usageSeen = null
      let doneSeen = false
      let buf = ''
      let sawSse = false
      let httpStatus = 0
      let plain = ''
      const dec = new TextDecoder()
      function open(kind) {
        const b = { index: nextIndex++, kind: kind, text: '', callId: null, name: null }
        order.push(b)
        return b
      }
      function closeBlock(b) {
        if (b.kind === 'text') return { type: 'text', text: b.text }
        if (b.kind === 'reasoning') return { type: 'reasoning', text: b.text }
        return { type: 'tool-call', id: b.callId || ('call_' + b.index), name: b.name || '', arguments: b.text }
      }
      function finalize() {
        const out = []
        for (const b of order) out.push({ type: 'block-end', index: b.index, block: closeBlock(b) })
        if (usageSeen) out.push({ type: 'usage', usage: usageSeen })
        let reason = pendingFinish || { kind: 'stop' }
        if (reason.kind === 'stop' && order.length === 0) reason = { kind: 'error', failure: { message: '上游返回了空响应', code: 'EMPTY_RESPONSE' } }
        out.push({ type: 'finish', reason: reason })
        return out
      }
      function handlePayload(payload, out) {
        if (payload === '[DONE]') {
          doneSeen = true
          for (const c of finalize()) out.push(c)
          return
        }
        let chunk
        try { chunk = JSON.parse(payload) } catch (e) { throw mkFail('无法解析上游 SSE 数据: ' + payload.slice(0, 120), 'MALFORMED_RESPONSE') }
        if (chunk.error) throw wireError(chunk.error)
        const choice = (chunk.choices && chunk.choices[0]) || {}
        const delta = choice.delta || {}
        const reasoning = delta.reasoning_content !== undefined ? delta.reasoning_content : delta.reasoning
        if (typeof reasoning === 'string' && reasoning.length > 0) {
          if (!reasoningBlock) { reasoningBlock = open('reasoning'); out.push({ type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' }) }
          reasoningBlock.text += reasoning
          out.push({ type: 'reasoning-delta', index: reasoningBlock.index, text: reasoning })
        }
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          if (!textBlock) { textBlock = open('text'); out.push({ type: 'block-start', index: textBlock.index, blockType: 'text' }) }
          textBlock.text += delta.content
          out.push({ type: 'text-delta', index: textBlock.index, text: delta.content })
        }
        const calls = delta.tool_calls
        if (Array.isArray(calls)) {
          for (let i = 0; i < calls.length; i++) {
            const call = calls[i]
            const key = typeof call.index === 'number' ? String(call.index) : 'solo'
            let block = toolBlocks.get(key)
            if (!block) {
              block = open('tool-call')
              toolBlocks.set(key, block)
              out.push({ type: 'block-start', index: block.index, blockType: 'tool-call' })
            }
            if (call.id) block.callId = call.id
            if (call.function && typeof call.function.name === 'string' && call.function.name.length > 0) block.name = call.function.name
            const frag = (call.function && typeof call.function.arguments === 'string') ? call.function.arguments : ''
            block.text += frag
            const ev = { type: 'tool-call-delta', index: block.index, id: block.callId || ('call_' + block.index), argumentsDelta: frag }
            if (block.name) ev.name = block.name
            out.push(ev)
          }
        }
        if (typeof choice.finish_reason === 'string') pendingFinish = mapFinishReason(choice.finish_reason)
        if (chunk.usage) usageSeen = mapUsage(chunk.usage)
      }
      function handleLine(line, out) {
        if (line.length === 0) return
        if (line.charAt(0) === ':') { sawSse = true; return }
        const sm = /^__FREEROUTE_HTTP_(\d{3})__$/.exec(line)
        if (sm) { httpStatus = Number(sm[1]); return }
        if (line.lastIndexOf('data:', 0) === 0) {
          sawSse = true
          const payload = line.slice(5).trim()
          if (payload.length === 0) return
          handlePayload(payload, out)
          return
        }
        if (plain.length < 4096) plain += line + '\n'
      }
      function drain(final) {
        const out = []
        let idx = buf.indexOf('\n')
        while (idx >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '')
          buf = buf.slice(idx + 1)
          handleLine(line, out)
          idx = buf.indexOf('\n')
        }
        if (final && buf.length > 0) { handleLine(buf.replace(/\r$/, ''), out); buf = '' }
        return out
      }
      function plainTail() { return plain.trim().replace(/\s+/g, ' ').slice(0, 160) }
      function classifyPrematureEnd() {
        // 流未以 [DONE] 结束。若全程没有出现 SSE 行，多半是上游直接回了
        // 非 SSE 的 JSON 错误（或代理错误页）：按 HTTP 状态码与错误体分类，
        // 让 AUTH / RATE_LIMIT / SERVER 熔断能正确触发。
        if (!sawSse) {
          if (httpStatus === 401 || httpStatus === 403) throw mkFail('上游鉴权失败 (HTTP ' + httpStatus + ')' + (plainTail() ? '：' + plainTail() : '') + (httpStatus === 403 ? '（403 常见原因：Key 有效但账户未开通该模型 / 未完成实名，或免费额度不覆盖此模型）' : ''), 'AUTH')
          if (httpStatus === 429) throw mkFail('上游限流 (HTTP 429)' + (plainTail() ? '：' + plainTail() : ''), 'RATE_LIMIT')
          if (httpStatus >= 400) throw mkFail('上游错误 (HTTP ' + httpStatus + ')' + (plainTail() ? '：' + plainTail() : ''), 'SERVER')
          const t = plain.trim()
          if (t.length > 0) {
            try {
              const o = JSON.parse(t)
              if (o && o.error) throw wireError(o.error)
            } catch (e) {
              if (e instanceof Error && e.code) throw e
            }
          }
        }
        throw mkFail('上游流在结束前中断' + (sawSse ? '' : ('：' + plainTail())), 'STREAM_CLOSED')
      }
      return {
        get done() { return doneSeen },
        get usage() { return usageSeen },
        feed: function (bytes) { buf += dec.decode(bytes, { stream: true }); return drain(false) },
        flush: function () { buf += dec.decode(); return drain(true) },
        finishOrThrow: function () { if (!doneSeen) classifyPrematureEnd(); return [] }
      }
    }

