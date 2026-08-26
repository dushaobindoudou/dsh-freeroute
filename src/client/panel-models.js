  const plainModels = st.models.filter(function (m) { return m.id !== 'auto' })
  const upName = {}
  for (const u of st.upstreams) upName[u.id] = u.name || u.id
  const modelRows = []
  for (let i = 0; i < plainModels.length; i++) {
    const m = plainModels[i]
    const via = Array.isArray(m.via) ? m.via : []
    const mOpen = openModel === m.id
    const rowKids = []
    rowKids.push(React.createElement('div', {
      key: 'row', className: 'frp-mrow',
      onClick: function () { setOpenModel(mOpen ? null : m.id) }
    },
      React.createElement('span', { className: 'frp-model-id', key: 'id' }, m.id),
      React.createElement('span', { className: 'frp-muted frp-pmeta', key: 'meta' }, via.length + tr('providersUnit')),
      React.createElement('span', { key: 'ctl', className: 'frp-pctl' },
        React.createElement('button', {
          key: 'dt', className: 'frp-btn frp-btn-ghost frp-iconbtn',
          onClick: function (e) { e.stopPropagation(); setOpenModel(mOpen ? null : m.id) }
        }, tr('detail')))))
    if (mOpen) {
      const viaRows = via.map(function (v, vi) {
        return React.createElement('div', { key: 'v' + vi },
          React.createElement('span', { className: 'frp-mk' }, vi === 0 ? tr('provider') : ''),
          (upName[v.upstream] || v.upstream) + '（' + v.model + '）')
      })
      rowKids.push(React.createElement('div', { className: 'frp-mdetail', key: 'detail' },
        React.createElement('div', { key: 'nm' },
          React.createElement('span', { className: 'frp-mk' }, tr('modelName')), m.name && m.name !== m.id ? m.name : m.id),
        React.createElement('div', { key: 'ctx' },
          React.createElement('span', { className: 'frp-mk' }, tr('contextWindow')), m.contextWindow ? (String(m.contextWindow) + ' tokens') : tr('unknown')),
        viaRows.length > 0
          ? React.createElement('div', { key: 'via', style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, viaRows)
          : React.createElement('div', { key: 'via-none' },
              React.createElement('span', { className: 'frp-mk' }, tr('provider')), tr('unknown'))))
    }
    modelRows.push(React.createElement('div', { key: m.id }, rowKids))
  }
  self.push(React.createElement('div', {
    key: 'models', className: 'frp-card frp-plist',
    onClick: function () { setModelsOpen(!modelsOpen) }
  },
    React.createElement('div', { className: 'frp-prow frp-prow-solo' },
      React.createElement('span', { className: 'frp-pname' }, tr('modelsTitle')),
      React.createElement('span', { className: 'frp-pmeta' }, plainModels.length + tr('countUnit')),
      React.createElement('span', { className: 'frp-chev' + (modelsOpen ? ' frp-chev-open' : '') }, '›')),
    modelsOpen ? React.createElement('div', { className: 'frp-models', key: 'list' }, modelRows) : null))

  // ---- 高级设置：远程目录 JSON（低频配置，折叠收纳）----
  self.push(React.createElement('div', {
    key: 'adv', className: 'frp-card frp-plist',
    onClick: function () { setAdvOpen(!advOpen) }
  },
    React.createElement('div', { className: 'frp-prow frp-prow-solo' },
      React.createElement('span', { className: 'frp-pname' }, tr('advancedTitle')),
      React.createElement('span', { className: 'frp-pmeta' }, tr('remoteCatalog')),
      React.createElement('span', { className: 'frp-chev' + (advOpen ? ' frp-chev-open' : '') }, '›'))))
  if (advOpen) {
    self.push(pxCard)
    self.push(catCard)
  }
  // ---- 高级设置：远程目录 / 自定义上游（低频配置，折叠收纳）----

  return React.createElement('div', { className: 'frp' }, self)
