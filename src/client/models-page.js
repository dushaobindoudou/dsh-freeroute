
// ---------------------------------------------------------------- 设置 -> 模型 页内嵌
// dsh 的「模型」设置页（settings.section id 'models'）没有给第三方的子插槽，
// 导航行又由原始条目表直接生成--再注册一个同名条目会产生两个「模型」行。
// 因此这里采用「单属性换血」：把内置 models 条目的 component 换成下面的包装
// 组件（options/label/order 原样保留，导航仍是一行「模型」），结构对齐宿主
// 「设置 -> 插件」页：标题与介绍保持原位不动，页签条插在介绍之后、内容之前。
// 页签条是纯 DOM 节点（不归 React 管，插入内置页内部不会破坏其
// reconciliation），两个页签「默认 | 免费」：
//   - 默认：内置模型页原样展示（DeepSeek 等提供方行、添加区）；
//   - 免费：隐藏页签之后的内置内容，下方渲染完整 freeroute 面板（Section）。
// 访问过的面板保持挂载（轮询与表单状态不丢）；插件停止时换回原组件、移除
// 页签条并还原可见性，完全可逆。渲染端 SlotOutlet 每次渲染都从活条目读
// entry.component，bump 一次 slot 版本即可让内容出口重新取件。
let wrappedOriginalComponent = null

function ModelsSectionWithFreeRoute(props) {
  const tabsId = (typeof React.useId === 'function' ? React.useId() : 'frp-models-tabs')
  // 页签文案跟随 dsh 语言；语言切换时下方 effect 会重建页签条
  const lang = useLang()
  const tr = makeT(lang)
  const scopeRef = React.useRef(null)
  const barRef = React.useRef(null)
  const activeRef = React.useRef('default')
  const a0 = React.useState('default')
  const active = a0[0]
  const setActive = a0[1]
  const v0 = React.useState(function () { return { default: true } })
  const visited = v0[0]
  const setVisited = v0[1]
  const select = function (id) {
    setActive(id)
    setVisited(function (v) { if (v[id]) return v; const n = Object.assign({}, v); n[id] = true; return n })
  }

  // 页签条落位 + 常驻守护（React 重渲染挪走后自动归位）。只动自己创建的节点。
  React.useEffect(function () {
    const root = scopeRef.current
    if (!root || typeof document !== 'object' || document === null) return undefined
    const view = root.ownerDocument && root.ownerDocument.defaultView
    let mo = null

    function sectionOf() {
      const h2 = root.querySelector('h2')
      return h2 && h2.parentElement ? h2.parentElement : null
    }

    function buildBar() {
      const bar = document.createElement('div')
      bar.setAttribute('data-frp', 'tabbar')
      bar.className = 'frp-tabs'
      bar.setAttribute('role', 'tablist')
      bar.setAttribute('aria-label', tr('tablistAria'))
      const defs = [
        { id: 'default', label: tr('tabDefault') },
        { id: 'free', label: tr('tabFree') }
      ]
      const btns = []
      defs.forEach(function (d, index) {
        const b = document.createElement('button')
        b.type = 'button'
        b.setAttribute('role', 'tab')
        b.id = tabsId + '-tab-' + d.id
        b.className = 'frp-tab'
        b.setAttribute('aria-controls', tabsId + '-panel-' + d.id)
        b.textContent = d.label
        b.addEventListener('click', function () { select(d.id) })
        b.addEventListener('keydown', function (event) {
          let next
          if (event.key === 'ArrowRight') next = (index + 1) % defs.length
          else if (event.key === 'ArrowLeft') next = (index - 1 + defs.length) % defs.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = defs.length - 1
          else return
          event.preventDefault()
          select(defs[next].id)
          const t = btns[next]
          if (t && typeof t.focus === 'function') t.focus()
        })
        btns.push(b)
        bar.appendChild(b)
      })
      return bar
    }

    function place() {
      try {
        const sec = sectionOf()
        if (!sec) return
        if (barRef.current === null || !barRef.current.isConnected) {
          const bar = buildBar()
          const h2 = sec.querySelector('h2')
          const intro = h2 ? h2.nextElementSibling : null
          const anchor = (intro && intro.tagName === 'P') ? intro : h2
          if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling)
          barRef.current = bar
          syncBar()
        }
      } catch (e) { }
    }

    function syncBar() {
      const bar = barRef.current
      if (!bar || !bar.isConnected) return
      const cur = activeRef.current
      const btns = bar.children
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i]
        const selected = (i === 0) === (cur === 'default')
        b.setAttribute('aria-selected', selected ? 'true' : 'false')
        b.setAttribute('data-active', selected ? 'true' : 'false')
        b.tabIndex = selected ? 0 : -1
      }
    }

    function syncVisibility() {
      const sec = sectionOf()
      if (!sec) return
      const bar = barRef.current
      const h2 = sec.querySelector('h2')
      const intro = h2 ? h2.nextElementSibling : null
      const free = activeRef.current === 'free'
      for (const el of Array.prototype.slice.call(sec.children)) {
        if (el === h2 || el === intro) continue
        if (bar && el === bar) continue
        if (el.getAttribute && el.getAttribute('data-frp')) continue
        if (free) {
          if (el.style.display !== 'none') {
            el.setAttribute('data-frp-hidden', '1')
            el.style.display = 'none'
          }
        } else if (el.getAttribute && el.getAttribute('data-frp-hidden') === '1') {
          el.removeAttribute('data-frp-hidden')
          el.style.display = ''
        }
      }
    }

    const sync = function () { syncBar(); syncVisibility() }
    place()
    sync()
    if (view && typeof view.MutationObserver === 'function') {
      mo = new view.MutationObserver(function () { place(); sync() })
      mo.observe(root, { childList: true, subtree: true })
    }
    return function () {
      if (mo) mo.disconnect()
      if (barRef.current) {
        if (barRef.current.parentNode) barRef.current.parentNode.removeChild(barRef.current)
        barRef.current = null
      }
      const sec = sectionOf()
      if (sec) {
        for (const el of Array.prototype.slice.call(sec.children)) {
          if (el.getAttribute && el.getAttribute('data-frp-hidden') === '1') {
            el.removeAttribute('data-frp-hidden')
            el.style.display = ''
          }
        }
      }
    }
  }, [lang])

  React.useEffect(function () {
    activeRef.current = active
    const root = scopeRef.current
    if (!root || typeof document !== 'object' || document === null) return
    const bar = barRef.current
    if (!bar || !bar.isConnected) return
    const btns = bar.children
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i]
      const selected = (i === 0) === (active === 'default')
      b.setAttribute('aria-selected', selected ? 'true' : 'false')
      b.setAttribute('data-active', selected ? 'true' : 'false')
      b.tabIndex = selected ? 0 : -1
    }
    const sec = (function () {
      const h2 = root.querySelector('h2')
      return h2 && h2.parentElement ? h2.parentElement : null
    })()
    if (!sec) return
    const h2 = sec.querySelector('h2')
    const intro = h2 ? h2.nextElementSibling : null
    const free = active === 'free'
    for (const el of Array.prototype.slice.call(sec.children)) {
      if (el === h2 || el === intro) continue
      if (el === bar) continue
      if (el.getAttribute && el.getAttribute('data-frp')) continue
      if (free) {
        if (el.style.display !== 'none') {
          el.setAttribute('data-frp-hidden', '1')
          el.style.display = 'none'
        }
      } else if (el.getAttribute && el.getAttribute('data-frp-hidden') === '1') {
        el.removeAttribute('data-frp-hidden')
        el.style.display = ''
      }
    }
  }, [active])

  const kids = []
  kids.push(React.createElement('div', {
    className: 'frp-models-scope',
    key: 'orig',
    ref: scopeRef,
    id: tabsId + '-panel-default',
    role: 'tabpanel',
    'aria-labelledby': tabsId + '-tab-default'
  },
    wrappedOriginalComponent
      ? React.createElement(wrappedOriginalComponent, Object.assign({}, props, { key: 'models-orig' }))
      : React.createElement('div', { className: 'frp-card frp-muted', key: 'models-missing' },
          tr('modelsMissing'))))
  if (visited.free) {
    kids.push(React.createElement('div', {
      key: 'panel-free',
      id: tabsId + '-panel-free',
      className: 'frp-panel',
      role: 'tabpanel',
      'aria-labelledby': tabsId + '-tab-free',
      hidden: active !== 'free'
    }, React.createElement(Section, { key: 'freeroute' })))
  }
  return React.createElement('div', { className: 'frp-tabpage' }, kids)
}


