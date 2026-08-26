function freerouteModelsIntegration(slots) {
  let disposed = false
  let wrapped = null
  let fallbackDispose = null

  function bump() {
    // 注册后立即注销：两次变更在同一微任务 flush 前完成，导航不会看到临时行，
    // 但 slot 版本前进，内容出口（uSES 按 version 订阅）会重新读取 component。
    try {
      const d = slots.register({ name: 'settings.section', id: 'freeroute-bump' }, function () { return null })
      d()
    } catch (e) { }
  }

  function readModelsEntry() {
    try {
      const all = slots.entries('settings.section') || []
      for (const e of all) {
        if (e && e.options && e.options.id === 'models') return e
      }
    } catch (e) { }
    return null
  }

  function attempt() {
    if (disposed) return
    const models = readModelsEntry()
    if (models) {
      if (fallbackDispose) { try { fallbackDispose() } catch (e2) { } fallbackDispose = null }
      if (!models.__freerouteWrap) {
        wrapped = { entry: models, component: models.component }
        wrappedOriginalComponent = models.component
        try { models.__freerouteWrap = true } catch (e3) { }
        models.component = ModelsSectionWithFreeRoute
        bump()
        console.log('[freeroute] 已在 设置 → 模型 页内嵌「免费模型」入口（可逆包装内置模型页）')
      }
      return
    }
    // 宿主没有可包装的 models 条目（id 变更/模块缺失）时，退回独立设置页，
    // 保证面板永远可达；models 条目稍后出现的话上面分支会撤掉它。
    if (!fallbackDispose) {
      try {
        fallbackDispose = slots.register({ name: 'settings.section', id: 'freeroute-proxy', order: 11, label: 'freeroute' }, Section)
      } catch (e4) { fallbackDispose = null }
    }
  }

  function dispose() {
    disposed = true
    if (wrapped) {
      if (wrapped.entry.component === ModelsSectionWithFreeRoute) wrapped.entry.component = wrapped.component
      try { wrapped.entry.__freerouteWrap = false } catch (e) { }
      wrapped = null
      wrappedOriginalComponent = null
      bump()
    }
    if (fallbackDispose) { try { fallbackDispose() } catch (e) { } fallbackDispose = null }
  }

  return { attempt: attempt, dispose: dispose }
}

