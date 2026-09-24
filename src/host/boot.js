
    configPath = resolveConfigPath()
    {
      const raw = readConfigFile()
      if (raw !== null) {
        configFileOk = true
        userConfig = sanitizeConfig(raw)
        importDeclaredKeys(raw).catch(function () { })
      } else if (settings !== undefined && typeof settings.register === 'function') {
        // dsh ≤0.1.5：注册 free-proxy 章节 + watch 回退（文件不可写时以 settings 为源）。
        // dsh ≥0.1.7 移除 settings.register（章节改由插件 Config 声明 + profile
        // patch 驱动）——本插件文件优先、设置面板独立挂载，无需章节注册；
        // 此处静默跳过，走 sanitizeConfig({}) 默认值。
        try {
          const scope = settings.register(NS, ConfigSchema)
          const seeded = sanitizeConfig(scope.get())
          // 一次性迁移：settings 里已有配置（或空配置）落成 JSON 文件，之后以文件为准
          if (configPath && fsx !== null) {
            userConfig = seeded
            if (writeConfigFile()) {
              configFileOk = true
              userConfig = sanitizeConfig(readConfigFile() || seeded)
            } else {
              userConfig = seeded
            }
          } else {
            userConfig = seeded
          }
          if (!configFileOk) {
            ctx.effect(function () {
              return scope.watch(function () {
                userConfig = sanitizeConfig(scope.get())
                // 上游增删/启停会改变「就绪」判定（如免鉴权自定义网关），
                // 联动默认模型接管；密钥保存路径另有显式触发。
                checkTakeover().catch(function () { })
              })
            })
          }
        } catch (e) { console.error('[freeroute] settings 注册失败:', emsg(e)) }
      } else if (settings !== undefined) {
        // dsh ≥0.1.7：settings.register 已移除（章节改由插件 Config 声明 +
        // profile patch 驱动，'free-proxy' 这类第三方命名章节无法再注册，
        // settings.update/replace 对未知 ns 一律抛 No configurable plugin
        // entry——applyPatch 等全部 RPC 写路径的 settings 回退都会死）。
        // 文件优先模式下直接以默认值落盘，让全部配置写入走文件路径；
        // 落盘失败才退回 settings 语义（新版必拒，RPC 层已有兜底报错）。
        userConfig = sanitizeConfig({})
        if (configPath && fsx !== null && writeConfigFile()) configFileOk = true
      }
    }
    if (configFileOk) log('[freeroute] 配置文件:', configPath)

    ctx.effect(function () { return llm.registerAdapter([ROUTE], adapter) })
    for (const pair of Object.entries(rpc)) {
      const name = pair[0]
      const handler = pair[1]
      ctx.effect(function () { return harness.handle(name, handler) })
    }
    // 晚到自愈：apply、每轮 tick、buildState 都会调它；已挂载过则幂等跳过。
    let disposeWebRoute = null
    let disposeCommand = null
    function ensureHostBindings() {
      if (webServer === undefined) webServer = ctx.get('webServer')
      if (webServer !== undefined && disposeWebRoute === null) {
        try {
          disposeWebRoute = webServer.register({ kind: 'prefix', path: '/freeroute', handler: routeHandler })
        } catch (e) { console.error('[freeroute] webServer 注册失败:', emsg(e)) }
      }
      if (commands === undefined) commands = ctx.get('commands')
      if (commands !== undefined && disposeCommand === null) {
        try {
          disposeCommand = commands.register({
            name: 'freeproxy',
            description: 'FreeRoute 免费模型代理状态',
            input: { hint: '[status]' },
            handler: function () { return statusText() }
          })
        } catch (e) { console.error('[freeroute] commands 注册失败:', emsg(e)) }
      }
    }
    ensureHostBindings()
    ctx.effect(function () {
      return function () {
        if (disposeWebRoute) { try { disposeWebRoute() } catch (e) { } }
        if (disposeCommand) { try { disposeCommand() } catch (e) { } }
      }
    })
    ctx.effect(function () {
      return timer.timeout(function () {
        const url = (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL
        if (url) syncCatalog().catch(function () { })
        probeAll().catch(function () { })
        ensureHostBindings()
        checkTakeover().catch(function () { })
      }, 4000)
    })
    ctx.effect(function () {
      const refreshMs = (userConfig.catalog && userConfig.catalog.autoRefreshMs >= 60000) ? userConfig.catalog.autoRefreshMs : 1800000
      return timer.interval(function () {
        const url = (userConfig.catalog && userConfig.catalog.remoteUrl) || DEFAULT_CATALOG_URL
        if (url) syncCatalog().catch(function () { })
        ensureHostBindings()
      }, refreshMs)
    })
    ctx.effect(function () {
      return timer.interval(function () { ensureHostBindings(); checkTakeover().catch(function () { }) }, 8000)
    })
    ctx.effect(function () {
      // 免费目录 10 分钟强刷：目录即真相，静态列表只作种子
      return timer.interval(function () { probeAll().catch(function () { }) }, 600000)
    })
    log('[freeroute] v' + VERSION + ' 就绪：路由 ' + ROUTE + '，内置上游 ' + BUILTIN_UPSTREAMS.length + ' 个，支持模型探测与远程目录（Cloudflare JSON / models.dev 格式）')
