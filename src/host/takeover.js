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
    //
    // v0.7.2 接管纪律（修复「安装后把用户原配置的默认模型清掉」）：
    // 1. 未经明确授权（explicit），只在用户从未显式配置过默认模型时接管
    //    ——settings 用户层没有 agent-default-model 时不打扰既有选择；
    // 2. 接管状态持久化（autoInjected + takeoverBackup 存入配置）：
    //    重启后关闭开关仍能恢复原默认；用户手动把默认改走则视为
    //    撤回授权，清除标记、之后不再自动接管；
    // 3. 显式把「自动接管」开关打开（explicit）= 明确授权覆盖当前默认，
    //    原值写入 takeoverBackup，关闭时恢复。
    const DEFAULT_MODEL_NS_NAME = 'agent-default-model'

    // settings 用户层是否已显式配置默认模型（settings.section 读原始用户层，
    // 与组合 base 默认无关：仅用户亲手写过才算「显式配置」）
    function userDefaultExplicit() {
      try {
        if (settings === undefined) return false
        const sec = settings.section(DEFAULT_MODEL_NS_NAME)
        return !!(sec && typeof sec.provider === 'string' && sec.provider.length > 0 && typeof sec.model === 'string' && sec.model.length > 0)
      } catch (e) { return false }
    }

    // 持久化接管标记与原值备份（JSON 文件模式 / settings 模式）
    function persistTakeoverState(injected, backup) {
      if (injected === true) userConfig.autoInjected = true
      else delete userConfig.autoInjected
      if (backup && typeof backup.provider === 'string' && typeof backup.model === 'string') userConfig.takeoverBackup = { provider: backup.provider, model: backup.model }
      else delete userConfig.takeoverBackup
      if (configFileOk) {
        writeConfigFile()
      } else if (settings !== undefined) {
        try {
          if (injected === true) {
            const patch = { autoInjected: true }
            if (userConfig.takeoverBackup) patch.takeoverBackup = userConfig.takeoverBackup
            settings.update(NS, patch).catch(function () { })
          } else {
            // 清除标记：unset 两个内部键（settings.update 是 merge，删不掉）
            settings.mutate(NS, [
              { op: 'unset', path: ['autoInjected'] },
              { op: 'unset', path: ['takeoverBackup'] }
            ]).catch(function () { })
          }
        } catch (e) { }
      }
    }

    // 撤销注入：清掉接管写进用户层的 provider/model（回落到组合 base 默认）。
    // 只 unset 这两个键，用户自己写过的其它键（如 reasoningEffort）不动。
    async function unsetInjectedDefault() {
      const s = settings
      if (s === undefined) return
      try {
        await s.mutate(DEFAULT_MODEL_NS_NAME, [
          { op: 'unset', path: ['provider'] },
          { op: 'unset', path: ['model'] }
        ])
      } catch (e) { }
    }

    async function checkTakeover(explicit) {
      try {
        if (userConfig.autoTakeover === false && explicit !== true) return
        // 调用时再取：该服务可能晚于本插件启动
        const defaultModelSvc = ctx.get('agentDefaultModel')
        if (defaultModelSvc === undefined) return
        const sel = defaultModelSvc.currentSelection()
        // 上次接管过（持久标记）而现在默认已改走：用户手动改回了自己的
        // 选择——尊重之，清除接管标记，此后不再自动接管（显式开关除外）
        if (userConfig.autoInjected && sel && sel.provider !== ROUTE) {
          persistTakeoverState(false, null)
          if (explicit !== true) return
        }
        if (sel && sel.provider === ROUTE) { takeoverDone = true; return }
        let ready = false
        try { ready = await anyReadyUpstream() } catch (e) { }
        if (!ready) return
        // 用户已显式配置默认模型：未经明确授权（开关显式打开）不打扰
        if (explicit !== true && userDefaultExplicit()) return
        const prev = (sel && sel.provider) ? sel : null
        await defaultModelSvc.saveSelection({ provider: ROUTE, model: 'auto' })
        takeoverDone = true
        takeoverPrev = prev
        persistTakeoverState(true, prev)
        console.log('[freeroute] 检测到免费上游就绪，已把默认模型切到 ' + ROUTE + '/auto' + (prev ? '（原默认 ' + prev.provider + '/' + prev.model + ' 已备份，关闭自动接管可恢复）' : '（未发现显式默认模型配置）'))
      } catch (e) { }
    }
