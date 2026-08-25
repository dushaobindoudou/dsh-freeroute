  const self = []

  // 写入约定：沙箱侧 settings.update 只接受宿主对象，所以由客户端构造完整
  // patch，经 RPC（JSON 边界）送达后由 host 只读校验并原样透传。
  const patchUpstream = function (id, entry) {
    const ups = {}
    ups[id] = entry
    return { upstreams: ups }
  }
  const movePatch = function (direction, id) {
    const ids = st.upstreams.map(function (x) { return x.id })
    const i = ids.indexOf(id)
    const j = direction === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return null
    const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp
    return { order: ids }
  }
  // ---- 头部：名字 + 版本 + 自动接管开关 + 一行关键信息（对齐原生设置页风格）----
  const headBits = ['端点 ' + (st.endpoint ? st.endpoint.base : '未挂载（webServer 不可用）')]
  headBits.push('默认 ' + (cur ? (cur.provider + '/' + cur.model) : '未设置'))
  headBits.push('请求 ' + st.totals.requests + ' · 成功 ' + st.totals.ok + ' · 失败 ' + st.totals.failed)
  if (st.totals.tokensIn || st.totals.tokensOut) headBits.push('tokens ↑' + st.totals.tokensIn + ' ↓' + st.totals.tokensOut)
  self.push(React.createElement('div', { className: 'frp-head', key: 'head' },
    React.createElement('div', { className: 'frp-headrow', key: 'row' },
      React.createElement('h3', { className: 'frp-headtitle' }, 'freeroute'),
      React.createElement('span', { className: 'frp-tag', key: 'v' }, 'v' + st.version),
      React.createElement('span', { className: 'frp-headspace', key: 'sp' }),
      st.autoInjected ? React.createElement('span', { className: 'frp-ok', key: 'inj', title: '本次进程已自动把默认模型切到 ' + st.route + '/auto' }, '已接管') : null,
      React.createElement('label', {
        key: 'tk', className: 'frp-switch',
        title: '自动接管：检测到可用的免费上游时，自动把默认模型切到 ' + st.route + '/auto（申请教程见各供应商详情）'
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: st.autoTakeover,
          disabled: busy === 'tk',
          onChange: function (e) {
            const p = {}
            p.autoTakeover = !!e.target.checked
            act('freeroute.apply-patch', { patch: p }, 'tk')
          }
        }),
        React.createElement('span', { className: 'frp-slider' }),
        React.createElement('span', { className: 'frp-switchtext' }, '自动接管'))),
    React.createElement('div', { className: 'frp-muted frp-headline', key: 'line' },
      headBits.map(function (b, i) { return React.createElement('span', { key: 'b' + i }, (i > 0 ? ' · ' : '') + b) }))))

  if (error) {
    self.push(React.createElement('div', { className: 'frp-err', key: 'err' }, error))
  }

  // ---- 供应商列表：行只放核心内容，点击展开详情与编辑（对齐原生模型页交互）----
