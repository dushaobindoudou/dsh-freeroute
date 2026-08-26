    // 本地 OpenAI 兼容端点：供其他 agent / 客户端复用免费额度。按设计无需
    // 任何 API Key（聚合的是本机已配置的免费上游），并放通 CORS（浏览器端
    // 应用也能直连）。
    const CORS_HEADERS = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400'
    }

    function sendJson(res, status, obj) {
      const h = Object.assign({ 'content-type': 'application/json' }, CORS_HEADERS)
      res.writeHead(status, h)
      res.end(typeof obj === 'string' ? obj : JSON.stringify(obj))
    }

    function strContent(c) {
      if (typeof c === 'string') return c
      if (Array.isArray(c)) {
        let out = ''
        for (const p of c) { if (p && typeof p.text === 'string') out += p.text }
        return out
      }
      return ''
    }

    function inboundToInternal(messages) {
      const out = []
      for (const m of messages || []) {
        if (m.role === 'system') { out.push({ role: 'system', content: [{ type: 'text', text: strContent(m.content) }] }); continue }
        if (m.role === 'assistant') {
          const blocks = []
          const txt = strContent(m.content)
          if (txt.length > 0) blocks.push({ type: 'text', text: txt })
          for (const tc of (m.tool_calls || [])) {
            blocks.push({ type: 'tool-call', id: tc.id || ('call_' + Math.random().toString(36).slice(2)), name: (tc.function && tc.function.name) || '', arguments: (tc.function && tc.function.arguments) || '{}' })
          }
          out.push({ role: 'assistant', content: blocks }); continue
        }
        if (m.role === 'tool') {
          out.push({ role: 'user', content: [{ type: 'tool-result', toolCallId: m.tool_call_id || '', content: [{ type: 'text', text: strContent(m.content) || '(no output)' }] }] }); continue
        }
        out.push({ role: 'user', content: [{ type: 'text', text: strContent(m.content) }] })
      }
      return out
    }

    function wireFinishReason(kind) {
      if (kind === 'tool-calls') return 'tool_calls'
      if (kind === 'max-tokens') return 'length'
      return 'stop'
    }

    function routeHandler(req, res) {
      Promise.resolve().then(async function () {
        const path = String(req.url || '/').split('?')[0]
        if (req.method === 'OPTIONS') {
          res.writeHead(204, CORS_HEADERS)
          res.end()
          return
        }
        if (path === '/freeroute/health') {
          sendJson(res, 200, { ok: true, route: ROUTE, version: VERSION, time: new Date().toISOString() })
          return
        }
        if (path === '/freeroute/v1/models') {
          const st = await buildState()
          sendJson(res, 200, { object: 'list', data: st.models.map(function (m) { return { id: m.id, object: 'model', owned_by: m.upstream } }) })
          return
        }
        if (path === '/freeroute/v1/chat/completions') {
          const dec = new TextDecoder()
          let raw = ''
          for await (const c of req) raw += dec.decode(c, { stream: true })
          raw += dec.decode()
          let body
          try { body = JSON.parse(raw) } catch (e) {
            sendJson(res, 400, { error: { message: 'invalid JSON body' } })
            return
          }
          const opts = {
            provider: ROUTE,
            model: (typeof body.model === 'string' && body.model.length > 0) ? body.model : 'auto',
            messages: inboundToInternal(body.messages),
            maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
            temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
            stop: body.stop
          }
          if (Array.isArray(body.tools) && body.tools.length > 0) {
            opts.tools = []
            for (const t of body.tools) {
              if (t && t.type === 'function' && t.function) {
                opts.tools.push({ name: String(t.function.name || ''), description: t.function.description || '', parameters: t.function.parameters || { type: 'object', properties: {} } })
              }
            }
            if (opts.tools.length === 0) delete opts.tools
          }
          if (body.stream) {
            res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, CORS_HEADERS))
            try {
              for await (const ck of failoverStream(opts)) {
                if (ck.type === 'text-delta') res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: ck.text } }] }) + '\n\n')
                else if (ck.type === 'reasoning-delta') res.write('data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: ck.text } }] }) + '\n\n')
                else if (ck.type === 'tool-call-delta') {
                  const tc = { index: ck.index, id: ck.id, type: 'function', function: { name: ck.name || '', arguments: ck.argumentsDelta || '' } }
                  res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [tc] } }] }) + '\n\n')
                }
                else if (ck.type === 'usage') res.write('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: ck.usage.inputTokens, completion_tokens: ck.usage.outputTokens } }) + '\n\n')
                else if (ck.type === 'finish') res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: wireFinishReason(ck.reason && ck.reason.kind) }] }) + '\n\n')
              }
              res.write('data: [DONE]\n\n')
              res.end()
            } catch (e) {
              try {
                res.write('data: ' + JSON.stringify({ error: { message: emsg(e), code: String(e && e.code) } }) + '\n\n')
                res.end()
              } catch (e2) { }
            }
            return
          }
          const startedAt = Date.now()
          try {
            const r = await collectFrom(failoverStream(opts))
            const message = { role: 'assistant', content: r.text }
            if (r.toolCalls && r.toolCalls.length > 0) {
              message.tool_calls = r.toolCalls.map(function (b, i) {
                return { id: b.id || ('call_' + i), type: 'function', function: { name: b.name || '', arguments: b.arguments || '{}' } }
              })
            }
            sendJson(res, 200, {
              id: 'freeroute-' + startedAt,
              object: 'chat.completion',
              created: Math.floor(startedAt / 1000),
              model: opts.model,
              choices: [{ index: 0, message: message, finish_reason: wireFinishReason(r.finish && r.finish.kind) }],
              usage: { prompt_tokens: (r.usage && r.usage.inputTokens) || 0, completion_tokens: (r.usage && r.usage.outputTokens) || 0 }
            })
          } catch (e) {
            sendJson(res, 502, { error: { message: emsg(e), code: String(e && e.code) } })
          }
          return
        }
        sendJson(res, 404, { error: { message: 'unknown freeroute path' } })
      }).catch(function (e) {
        try {
          sendJson(res, 500, { error: { message: emsg(e) } })
        } catch (e2) { }
      })
    }
