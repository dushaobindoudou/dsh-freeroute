  const plainModels = st.models.filter(function (m) { return m.id !== 'auto' })
  const upName = {}
  for (const u of st.upstreams) upName[u.id] = u.name || u.id
  const modelRows = []
  for (let i = 0; i < plainModels.length; i++) {
    const m = plainModels[i]
    const via = Array.isArray(m.via) ? m.via : []
    const mOpen = openModel === m.id
    // 条目 = 默认模型页 modelEntry 形态：小边框盒 + 网格行（等宽 id | 名称·上下文 | chevron），
    // 点击展开「供应商」字段行列出各家上游与实际映射模型。
    const metaBits = []
    if (m.name && m.name !== m.id) metaBits.push(m.name)
    metaBits.push(m.contextWindow ? (String(m.contextWindow) + ' tokens') : tr('unknown'))
    modelRows.push(React.createElement('div', { key: m.id, className: 'frp-mentry' },
      React.createElement('div', {
        className: 'frp-mrow2', role: 'button', tabIndex: 0,
        'aria-expanded': mOpen ? 'true' : 'false',
        onClick: function () { setOpenModel(mOpen ? null : m.id) },
        onKeyDown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpenModel(mOpen ? null : m.id)
          }
        }
      },
        React.createElement('span', { className: 'frp-mid', key: 'id' }, m.id),
        React.createElement('span', { className: 'frp-mmeta', key: 'meta' }, metaBits.join(' · ')),
        React.createElement('span', { className: 'frp-chev' + (mOpen ? ' frp-chev-open' : ''), key: 'chev' }, '›')),
      mOpen ? React.createElement('div', { className: 'frp-mbody', key: 'detail' },
        React.createElement('div', { className: 'frp-field', key: 'via' },
          React.createElement('span', { className: 'frp-fieldlabel', key: 'l' }, tr('provider')),
          via.length > 0
            ? React.createElement('div', { className: 'frp-vialist', key: 'vl' }, via.map(function (v, vi) {
              return React.createElement('div', { key: 'v' + vi, className: 'frp-viarow' },
                React.createElement('span', { className: 'frp-vianame', key: 'n' }, upName[v.upstream] || v.upstream),
                React.createElement('span', { className: 'frp-mid', key: 'm' }, v.model))
            }))
            : React.createElement('span', { className: 'frp-fieldval', key: 'none' }, tr('unknown')))) : null))
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
        React.createElement('span', { className: 'frp-tag', key: 'ds' }, desc)),
      React.createElement('span', { className: 'frp-chev' + (isOpen ? ' frp-chev-open' : ''), key: 'chev' }, '›'))
  }
  self.push(React.createElement('div', {
    key: 'models', className: 'frp-ucard' + (modelsOpen ? ' frp-ucard-open' : '')
  },
    ucardHead(tr('modelsTitle'), plainModels.length + tr('countUnit'), modelsOpen, function () { setModelsOpen(!modelsOpen) }),
    modelsOpen ? React.createElement('div', { className: 'frp-ucard-body', key: 'body' },
      React.createElement('div', { className: 'frp-models', key: 'list' }, modelRows)) : null))

  // ---- 高级设置：全局代理 / 远程目录（低频配置，折叠收纳为一张卡）----
  self.push(React.createElement('div', {
    key: 'adv', className: 'frp-ucard' + (advOpen ? ' frp-ucard-open' : '')
  },
    ucardHead(tr('advancedTitle'), tr('remoteCatalog'), advOpen, function () { setAdvOpen(!advOpen) }),
    advOpen ? React.createElement('div', { className: 'frp-ucard-body', key: 'body' },
      React.createElement('div', { className: 'frp-fgroup', key: 'px' }, pxKids),
      React.createElement('div', { className: 'frp-fgroup', key: 'cat' }, catKids)) : null))

  return React.createElement('div', { className: 'frp' }, self)
