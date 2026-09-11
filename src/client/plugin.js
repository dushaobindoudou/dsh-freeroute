return {
  inject: ['slots', 'timer'],
  apply(ctx) {
    ctxRef = ctx
    const slots = ctx.slots
    styles.insert(CSS)
    const integ = freerouteModelsIntegration(slots)
    // 官方 footer 子槽存在则同步注册（正常路径）；宽限期后仍缺席则退回独立
    // 设置页，保证面板在任何 profile 里都可达。
    integ.start()
    const grace = ctx.timeout(function () { integ.fallback() }, 2500)
    ctx.effect(function () {
      return function () {
        try { grace() } catch (e) { }
        integ.dispose()
      }
    })
  }
}
