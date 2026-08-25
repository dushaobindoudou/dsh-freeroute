    async function anyReadyUpstream() {
      for (const u of orderedUpstreams()) {
        if (!isEnabled(u.id)) continue
        if (await hasCredential(u)) return true
      }
      return false
    }

    // ---- 就绪联动 ----
    // 任一已启用上游就绪（配好 Key 或免鉴权）即触发一次默认模型接管
    // （切到 ROUTE/auto）。设置 -> 模型 页的呈现由客户端完成：包装组件在
    // 标题/介绍之后插「默认 | 免费」页签（对齐插件设置页）；不再经
    // llm.registerConfigurableProviders 登记目录（那会在 DeepSeek 之后产生
    // 第二条行、编辑器还是死胡同）。
    async function checkTakeover() {
      try {
        if (takeoverDone) return
        if (userConfig.autoTakeover === false) return
        // 调用时再取：该服务可能晚于本插件启动
        const defaultModelSvc = ctx.get('agentDefaultModel')
        if (defaultModelSvc === undefined) return
        let ready = false
        try { ready = await anyReadyUpstream() } catch (e) { }
        if (!ready) return
        const sel = defaultModelSvc.currentSelection()
        if (sel && sel.provider === ROUTE) { takeoverDone = true; return }
        takeoverPrev = (sel && sel.provider) ? sel : null
        await defaultModelSvc.saveSelection({ provider: ROUTE, model: 'auto' })
        takeoverDone = true
        console.log('[freeroute] 检测到免费上游就绪，已自动把默认模型切到 ' + ROUTE + '/auto（本次进程生效一次；原选择可随时在模型选择器改回）')
      } catch (e) { }
    }

