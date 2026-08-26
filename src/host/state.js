    async function buildState() {
      ensureHostBindings()
      maybeReloadConfig()
      const list = []
      let injectedNow = false
      try {
        const dsvc = ctx.get('agentDefaultModel')
        const sel0 = dsvc ? dsvc.currentSelection() : null
        injectedNow = takeoverDone && !!sel0 && sel0.provider === ROUTE
      } catch (e) { }
      let priority = 0
      for (const u of orderedUpstreams()) {
        const h = health.get(u.id) || {}
        const s = stats.get(u.id) || {}
        const cfgEnabled = isEnabled(u.id)
        const merged = mergedModels(u)
        const probe = probeCache.get(u.id)
        let freeCount = 0
        for (const m of merged) { if (m.free) freeCount++ }
        let cred = { configured: !!u.noAuth, source: null, writable: false, keys: u.noAuth ? 1 : 0 }
        if (!u.noAuth && credentials !== undefined) {
          try {
            let keys = 0
            let first = null
            for (const ref of keyRefsFor(u)) {
              const d = await credentials.describe(ref)
              if (d && d.configured) { keys += 1; if (!first) first = d }
            }
            cred = { configured: keys > 0, source: first ? (first.source || null) : null, writable: first ? !!first.writable : false, keys: keys }
          } catch (e) { }
        }
        list.push({
          id: u.id,
          name: u.name,
          source: u.source || 'builtin',
          priority: priority++,
          note: u.note || '',
          signupUrl: u.signupUrl || '',
          tutorialUrl: u.tutorialUrl || '',
          keyRef: u.keyRef,
          noAuth: !!u.noAuth,
          defaultModel: defaultModelFor(u) || '',
          enabled: cfgEnabled,
          configured: cred.configured,
          keys: cred.keys || 0,
          credSource: cred.source,
          writable: cred.writable,
          modelsCount: merged.length,
          freeCount: freeCount,
          probedAt: (probe && probe.at) || null,
          probedError: (probe && probe.error) || '',
          tutorial: TUTORIALS[u.id] || null,
          health: {
            state: cooling(u.id) ? 'cooling' : ((h.consecutiveFailures || 0) > 0 ? 'degraded' : 'up'),
            cooldownMs: Math.max(0, (h.cooldownUntil || 0) - Date.now()),
            consecutiveFailures: h.consecutiveFailures || 0,
            lastError: h.lastError || null,
            lastErrorAt: h.lastErrorAt || null,
            keyFails: (keyFailNotes.get(u.id) || []).map(function (f) { return { index: f.index, code: f.code, at: f.at } })
          },
          stats: {
            requests: s.requests || 0, ok: s.ok || 0, failed: s.failed || 0,
            tokensIn: s.tokensIn || 0, tokensOut: s.tokensOut || 0,
            lastLatencyMs: s.lastLatencyMs || null, lastUsedAt: s.lastUsedAt || null
          }
        })
      }
      // 面板与选择器同源：通用模型名 + via 平台表（哪家上游提供哪个真实模型）。
      // 与 listModels 相同的「免费且可用」过滤：未就绪上游的模型不展示。
      const readySet = await readyUpstreamIdSet()
      const models = [{ id: 'auto', name: 'Auto（自动切换）', contextWindow: null, upstream: '_', via: [] }]
      for (const entry of buildAliasIndex().values()) {
        if (entry.free !== true) continue
        const viaReady = entry.via.filter(function (v) { return readySet.has(v.upstream) })
        if (viaReady.length === 0) continue
        models.push({ id: entry.id, name: entry.name || entry.id, contextWindow: entry.contextWindow, upstream: viaReady[0].upstream, free: true, via: viaReady })
      }
      let current = null
      const defaultModelSvc = ctx.get('agentDefaultModel')
      if (defaultModelSvc !== undefined) {
        try {
          const sel = defaultModelSvc.currentSelection()
          if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') current = { provider: sel.provider, model: sel.model }
        } catch (e) { }
      }
      let requests = 0, ok = 0, failed = 0, tokensIn = 0, tokensOut = 0
      for (const s of stats.values()) { requests += s.requests; ok += s.ok; failed += s.failed; tokensIn += s.tokensIn; tokensOut += s.tokensOut }
      // 本地隐藏的上游（removed 标记）：名字从原始来源（内置/远程/自定义）取，
      // 供面板「已隐藏 N 家 · 恢复」入口使用。
      const hidden = []
      {
        const uc = userConfig.upstreams || {}
        const nameOf = function (id) {
          for (const b of BUILTIN_UPSTREAMS) { if (b.id === id) return b.name }
          const r = remoteUpstreams.get(id)
          if (r) return r.name || id
          const c = uc[id] && uc[id].custom
          return (c && c.name) || id
        }
        for (const pair of Object.entries(uc)) {
          if (pair[1] && pair[1].removed) hidden.push({ id: pair[0], name: nameOf(pair[0]) })
        }
      }
      return {
        version: VERSION,
        route: ROUTE,
        configPath: configFileOk ? configPath : '',
        settingsNs: NS,
        persistence: settings !== undefined,
        autoTakeover: userConfig.autoTakeover !== false,
        autoInjected: injectedNow,
        globalProxy: userConfig.proxy || '',
        catalog: {
          remoteUrl: (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL,
          autoRefreshMs: (userConfig.catalog && userConfig.catalog.autoRefreshMs) || 1800000,
          lastSyncAt: catalogMeta.lastSyncAt,
          lastSyncError: catalogMeta.lastError || null,
          lastCount: catalogMeta.lastCount,
          lastFormat: catalogMeta.lastFormat,
          lastSyncUrl: catalogMeta.lastSyncUrl || null,
          lastUsedFallback: catalogMeta.lastUsedFallback
        },
        currentSelection: current,
        totals: { requests: requests, ok: ok, failed: failed, tokensIn: tokensIn, tokensOut: tokensOut },
        upstreams: list,
        hiddenUpstreams: hidden,
        models: models,
        endpoint: webServer !== undefined ? { base: 'http://127.0.0.1:' + webServer.port + '/freeroute/v1' } : null
      }
    }

    function requireSettings() {
      if (settings === undefined) throw mkFail('settings 服务不可用，配置无法持久化', 'CONFIG')
      return settings
    }

