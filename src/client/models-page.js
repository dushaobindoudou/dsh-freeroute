
// ---------------------------------------------------------------- 设置 -> 模型 页底部扩展区
// 渲染位置：官方子插槽 settings.models.footer（提供方行与「添加」区之后）。
// 相比 0.8.7 的「换血内置 component + DOM 插页签条」，这里不再触碰宿主 DOM：
// 面板是插槽的普通内容，随设置页正常参与 React 渲染与卸载。
// 默认展开（模型页就是免费池的配置入口，少一次点击）；标题行可折叠。
// 完整面板（Section）在展开时才挂载：它每 5s 轮询 freeroute.state，收起即停。
function FreeRouteModelsFooter() {
  const lang = useLang()
  const tr = makeT(lang)
  const op0 = React.useState(true)
  const open = op0[0]
  const setOpen = op0[1]

  const toggle = function () { setOpen(!open) }
  const onKey = function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  }

  const head = React.createElement('div', {
    key: 'head',
    className: 'frp-footerhead',
    role: 'button',
    tabIndex: 0,
    'aria-expanded': open ? 'true' : 'false',
    onClick: toggle,
    onKeyDown: onKey
  },
    React.createElement('span', { className: 'frp-footertitle', key: 'title' }, tr('footerTitle')),
    React.createElement('span', { className: 'frp-muted frp-footernote', key: 'note' }, tr('footerNote')),
    React.createElement('span', { className: 'frp-chev' + (open ? ' frp-chev-open' : ''), key: 'chev' }, '›'))

  const kids = [head]
  if (open) {
    kids.push(React.createElement('div', { className: 'frp-footerbody', key: 'body' },
      React.createElement(Section, { key: 'panel' })))
  }
  return React.createElement('div', { className: 'frp-footer' }, kids)
}

