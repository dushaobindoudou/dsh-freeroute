  const st0 = React.useState(null)
  const stateVal = st0[0]
  const setState = st0[1]
  // 面板文案语言：跟随 dsh 的 locale 服务（zh/en），切换即时重渲染
  const lang = useLang()
  const tr = makeT(lang)
  const er0 = React.useState('')
  const error = er0[0]
  const setError = er0[1]
  const bs0 = React.useState('')
  const busy = bs0[0]
  const setBusy = bs0[1]
  const dr0 = React.useState({})
  const drafts = dr0[0]
  const setDrafts = dr0[1]
  const ts0 = React.useState({})
  const tests = ts0[0]
  const setTests = ts0[1]
  const op0 = React.useState(null)
  const openId = op0[0]
  const setOpenId = op0[1]
  const ad0 = React.useState(false)
  const advOpen = ad0[0]
  const setAdvOpen = ad0[1]
  const ca0 = React.useState(null)
  const catUrl = ca0[0]
  const setCatUrl = ca0[1]
  // 全局代理草稿（与 catUrl 同理：hook 必须在无条件区声明，片段里只引用）
  const px0 = React.useState(null)
  const pxDraft = px0[0]
  const setPxDraft = px0[1]
  const mo0 = React.useState(false)
  const modelsOpen = mo0[0]
  const setModelsOpen = mo0[1]
  const om0 = React.useState(null)
  const openModel = om0[0]
  const setOpenModel = om0[1]
  const sk0 = React.useState({})
  const showKeys = sk0[0]
  const setShowKeys = sk0[1]
  const kv0 = React.useState({})
  const keyViews = kv0[0]
  const setKeyViews = kv0[1]

  React.useEffect(function () {
    let alive = true
    const tick = function () {
      host.call('freeroute.state').then(function (v) { if (alive) setState(v) }).catch(function (e) { if (alive) setError(String((e && e.message) || e)) })
    }
    tick()
    const d = ctxRef.interval(tick, 5000)
    return function () { alive = false; d() }
  }, [])

  const refresh = function () {
    host.call('freeroute.state').then(function (v) { setState(v) }).catch(function (e) { })
  }
  const act = function (method, args, tag, after) {
    setBusy(tag)
    host.call(method, args).then(function (r) {
      setBusy('')
      if (r && r.ok === false) { setError(r.error || '操作失败'); return }
      setError('')
      if (after) after(r)
      refresh()
    }).catch(function (e) { setBusy(''); setError(String((e && e.message) || e)) })
  }
  const setDraft = function (k, v) {
    const n = {}
    n[k] = v
    setDrafts(Object.assign({}, drafts, n))
  }

  // 形状守卫：state 必须是含 totals/upstreams 的完整对象。任何非预期形状
  // （如未解包的信封、纯文本错误页）都降级为错误卡，绝不炸掉整个设置槽。
  const stBad = !stateVal || typeof stateVal !== 'object' || !stateVal.totals || !Array.isArray(stateVal.upstreams)
  if (stBad) {
    const hint = error
      ? (tr('loadFail') + error)
      : (stateVal ? tr('stateBad') : tr('loading'))
    return React.createElement('div', { className: 'frp' },
      React.createElement('div', { className: 'frp-card frp-muted' }, hint))
  }

  const st = stateVal
  const cur = st.currentSelection
