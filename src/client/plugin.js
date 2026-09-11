// 清扫孤儿样式：dsh web 进程重启/插件热更后，长开的浏览器页签里会残留旧
// 版本的 <style>（其 disposer 已随旧进程消亡，无人再移除），旧规则会层叠
// 泄漏——新表未显式声明的属性（如 0.8.10 的 width:100% / 旧 padding）被旧
// 表顶掉。挂载时按版本标记清掉所有非当前版本的 freeroute 样式。
function sweepStaleStyles() {
  if (typeof document !== 'object' || document === null) return
  const want = 'dsh-freeroute-client-css v' + CSS_VERSION + ' */'
  const nodes = document.querySelectorAll('style')
  for (let i = 0; i < nodes.length; i++) {
    const t = nodes[i].textContent
    if (typeof t !== 'string') continue
    // 只动确认是 freeroute 的样式（.frp-tab/.frp-cards 是我们独有的选择器）；
    // 宿主与第三方样式不含这些前缀，不会误删。
    if (t.indexOf('.frp-tab') < 0 && t.indexOf('.frp-cards') < 0 && t.indexOf(want) < 0) continue
    if (t.indexOf(want) >= 0) continue
    nodes[i].remove()
  }
}

return {
  inject: ['slots', 'timer'],
  apply(ctx) {
    ctxRef = ctx
    const slots = ctx.slots
    sweepStaleStyles()
    styles.insert(CSS)
    slots.inject('settings.section', function () {
      const integ = freerouteModelsIntegration(slots)
      const stop = slots.subscribe('settings.section', integ.attempt)
      integ.attempt()
      return [stop, integ.dispose]
    })
  }
}
