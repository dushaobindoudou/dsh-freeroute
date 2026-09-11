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
  // ---- 模型 / 高级设置：与上游同款可展开卡片（插件页 PluginCard 形态）----
  const ucardHead = function (name, desc, isOpen, toggle) {
    return React.createElement('div', {
      className: 'frp-ucard-head', role: 'button', tabIndex: 0,
      'aria-expanded': isOpen ? 'true' : 'false',
      onClick: toggle,
      onKeyDown: function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }
    },
      React.createElement('div', { className: 'frp-ucard-text', key: 'txt' },
        React.createElement('span', { className: 'frp-ucard-name', key: 'nm' }, name),
        React.createElement('span', { className: 'frp-ucard-desc', key: 'ds' }, desc)),
      React.createElement('span', { className: 'frp-chev' + (isOpen ? ' frp-chev-open' : ''), key: 'chev' }, '›'))
  }
  self.push(React.createElement('div', {
    key: 'models', className: 'frp-ucard' + (modelsOpen ? ' frp-ucard-open' : '')
  },
    ucardHead(tr('modelsTitle'), plainModels.length + tr('countUnit'), modelsOpen, function () { setModelsOpen(!modelsOpen) }),
    modelsOpen ? React.createElement('div', { className: 'frp-ucard-body', key: 'body' },
      React.createElement('div', { className: 'frp-fgroup', key: 'listwrap' },
        React.createElement('div', { className: 'frp-models', key: 'list' }, modelRows))) : null))

  // ---- 高级设置：全局代理 / 远程目录（低频配置，折叠收纳为一张卡）----
  self.push(React.createElement('div', {
    key: 'adv', className: 'frp-ucard' + (advOpen ? ' frp-ucard-open' : '')
  },
    ucardHead(tr('advancedTitle'), tr('remoteCatalog'), advOpen, function () { setAdvOpen(!advOpen) }),
    advOpen ? React.createElement('div', { className: 'frp-ucard-body', key: 'body' },
      React.createElement('div', { className: 'frp-fgroup', key: 'px' }, pxKids),
      React.createElement('div', { className: 'frp-fgroup', key: 'cat' }, catKids)) : null))

  return React.createElement('div', { className: 'frp' }, self)
