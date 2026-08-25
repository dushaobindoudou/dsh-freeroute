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

    function routeHandler(req, res) {
      Promise.resolve().then(async function () {
        const path = String(req.url || '/').split('?')[0]
        if (path === '/freeroute/health') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, route: ROUTE, version: VERSION, time: new Date().toISOString() }))
          return
        }
        if (path === '/freeroute/v1/models') {
          const st = await buildState()
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ object: 'list', data: st.models.map(function (m) { return { id: m.id, object: 'model', owned_by: m.upstream } }) }))
          return
        }
        if (path === '/freeroute/v1/chat/completions') {
          const dec = new TextDecoder()
          let raw = ''
          for await (const c of req) raw += dec.decode(c, { stream: true })
          raw += dec.decode()
          let body
          try { body = JSON.parse(raw) } catch (e) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: { message: 'invalid JSON body' } }))
            return
          }
          const opts = {
            provider: ROUTE,
            model: (typeof body.model === 'string' && body.model.length > 0) ? body.model : 'auto',
            messages: inboundToInternal(body.messages),
            maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
            temperature: typeof body.temperature === 'number' ? body.temperature : undefined
          }
          if (body.stream) {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
            try {
              for await (const ck of failoverStream(opts)) {
                if (ck.type === 'text-delta') res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: ck.text } }] }) + '\n\n')
                else if (ck.type === 'reasoning-delta') res.write('data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: ck.text } }] }) + '\n\n')
                else if (ck.type === 'usage') res.write('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: ck.usage.inputTokens, completion_tokens: ck.usage.outputTokens } }) + '\n\n')
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
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({
              id: 'freeroute-' + startedAt,
              object: 'chat.completion',
              created: Math.floor(startedAt / 1000),
              model: opts.model,
              choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
              usage: { prompt_tokens: (r.usage && r.usage.inputTokens) || 0, completion_tokens: (r.usage && r.usage.outputTokens) || 0 }
            }))
          } catch (e) {
            res.writeHead(502, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: { message: emsg(e), code: String(e && e.code) } }))
          }
          return
        }
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'unknown freeroute path' } }))
      }).catch(function (e) {
        try {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { message: emsg(e) } }))
        } catch (e2) { }
      })
    }
