// 「设置 -> 模型」页集成：官方子插槽版（dsh 0.1.x）。
//
// dsh 的内置模型页给第三方留了两个加法子插槽：
//   - settings.models.footer        ：提供方行与「添加」区之后的整块扩展区（list）
//   - settings.models.provider-card ：单张提供方卡片扩展区（keyed，按 settingsNs 派发）
// 早期版本（<=0.8.7）走的是「把 models 条目的 component 换成包装组件，再用
// MutationObserver 往内置 DOM 里插页签条、隐藏兄弟节点」——依赖 h2/intro 的
// DOM 形状与 React reconciliation 的巧合，宿主一改版就会错位/闪烁。
// 现在改用官方 footer 插槽：面板作为模型页底部的独立区块渲染，零 DOM 手术，
// 停止时由插槽自己撤销注册（完全可逆）。
//
// 兜底：宿主没有声明 footer 子槽时（旧 dsh / 未加载模型页插件），宽限期后
// 退回「独立 freeroute 设置页」，保证面板永远可达；footer 一旦声明，兜底页
// 自动撤下，不会出现两个入口。
function freerouteModelsIntegration(slots) {
  let disposed = false
  let footerDeclared = false
  let footerOff = null
  let fallbackOff = null

  function dropFallback() {
    if (fallbackOff) { try { fallbackOff() } catch (e) { } fallbackOff = null }
  }

  // 挂起对官方 footer 声明的等待：声明已存在时同步注册，否则声明落地时注册。
  function start() {
    if (disposed || footerOff) return
    try {
      footerOff = slots.inject('settings.models.footer', function () {
        footerDeclared = true
        dropFallback()
        return slots.register({ name: 'settings.models.footer', id: 'freeroute', order: 20 }, FreeRouteModelsFooter)
      })
    } catch (e) {
      // inject 对未知 key 不做静态校验，仍然保守兜底：视为「宿主没有该子槽」，
      // 交给宽限期走独立设置页。
      footerOff = null
      footerDeclared = false
    }
  }

  // 宽限期到点仍没有 footer 声明 -> 独立设置页兜底。
  function fallback() {
    if (disposed || footerDeclared || fallbackOff) return
    try {
      fallbackOff = slots.register({ name: 'settings.section', id: 'freeroute', order: 11, label: 'freeroute' }, Section)
    } catch (e) { fallbackOff = null }
  }

  function dispose() {
    disposed = true
    if (footerOff) { try { footerOff() } catch (e) { } footerOff = null }
    dropFallback()
  }

  return { start: start, fallback: fallback, dispose: dispose }
}
