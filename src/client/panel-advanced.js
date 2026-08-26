  const catKids = []
  catKids.push(React.createElement('h3', { className: 'frp-title', key: 't' }, tr('catTitle')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'cfg1' },
    tr('configFile') + (st.configPath || tr('settingsFallback'))))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'cfg2' }, tr('copyHint')))
  const catRow = []
  catRow.push(React.createElement('input', {
    key: 'url',
    className: 'frp-input frp-input-wide',
    type: 'text',
    placeholder: tr('catPlaceholder'),
    value: catUrl === null ? st.catalog.remoteUrl : catUrl,
    onChange: function (e) { setCatUrl(e.target.value) }
  }))
  catRow.push(React.createElement('button', {
    key: 'save',
    className: 'frp-btn frp-btn-primary',
    disabled: busy === 'cat',
    onClick: function () {
      const url = (catUrl === null ? st.catalog.remoteUrl : catUrl).trim()
      const cat = {}
      cat.catalog = { remoteUrl: url }
      act('freeroute.apply-patch', { patch: cat }, 'cat', function () {
        host.call('freeroute.catalog.sync').then(function (r) {
          if (r && r.ok) setError('')
          else setError((r && r.error) || tr('syncFailed'))
          refresh()
        }).catch(function (e) { setError(String((e && e.message) || e)) })
      })
    }
  }, tr('saveSync')))
  catRow.push(React.createElement('button', {
    key: 'sync', className: 'frp-btn',
    disabled: busy === 'catsync',
    onClick: function (e) { e.stopPropagation(); act('freeroute.catalog.sync', {}, 'catsync') }
  }, tr('syncOnly')))
  catKids.push(React.createElement('div', { className: 'frp-form-row', key: 'row' }, catRow))
  catKids.push(React.createElement('pre', { className: 'frp-pre', key: 'fmt' },
    '[\n' +
    '  {\n' +
    '    "providerName": "B.AI",\n' +
    '    "getkey": "https://chat.b.ai/chat?invite_code=…",\n' +
    '    "tutorial": "https://your.site/bai-tutorial",\n' +
    '    "api": "https://api.b.ai/v1",\n' +
    '    "apikey": ["sk-xxx"],\n' +
    '    "freeModels": ["deepseek-v4-flash", "hy3"],\n' +
    '    "proxy": "http://127.0.0.1:7890"\n' +
    '  }\n' +
    ']'))
  const catStatus = st.catalog.lastSyncAt
    ? (tr('lastSync') + ' ' + new Date(st.catalog.lastSyncAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') + ' · ' + st.catalog.lastCount + tr('providersUnit2') + ' · ' + st.catalog.lastFormat + tr('formatUnit'))
    : tr('notSynced')
  catKids.push(React.createElement('div', { className: 'frp-stats', key: 's' },
    catStatus + (st.catalog.lastSyncError ? (tr('errorLabel') + st.catalog.lastSyncError) : '')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h1' },
    tr('catHint1')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h2' },
    tr('catHint2')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h3' },
    tr('catHint3')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h4' },
    tr('catHint4')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h5' },
    tr('catHint5')))
  const catCard = React.createElement('div', { className: 'frp-card' }, catKids)
