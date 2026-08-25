return {
  inject: ['slots', 'timer'],
  apply(ctx) {
    ctxRef = ctx
    const slots = ctx.slots
    styles.insert(CSS)
    slots.inject('settings.section', function () {
      const integ = freerouteModelsIntegration(slots)
      const stop = slots.subscribe('settings.section', integ.attempt)
      integ.attempt()
      return [stop, integ.dispose]
    })
  }
}
