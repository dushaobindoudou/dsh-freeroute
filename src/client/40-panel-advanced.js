  const catKids = []
  catKids.push(React.createElement('h3', { className: 'frp-title', key: 't' }, '远程目录（JSON）'))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'cfg1' },
    '配置文件：' + (st.configPath || 'settings.yaml（JSON 文件不可用时兜底）')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'cfg2' },
    '拷贝该文件即迁移/替换 · 改动约 5 秒自动生效 · 可选 "keys" 字段一次性导入密钥（仅补空位，不覆盖已保存的 Key）'))
  const catRow = []
  catRow.push(React.createElement('input', {
    key: 'url',
    className: 'frp-input frp-input-wide',
    type: 'text',
    placeholder: 'https://<你的域名>/freeroute.json',
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
          else setError((r && r.error) || '同步失败')
          refresh()
        }).catch(function (e) { setError(String((e && e.message) || e)) })
      })
    }
  }, '保存并同步'))
  catRow.push(React.createElement('button', {
    key: 'sync', className: 'frp-btn',
    disabled: busy === 'catsync',
    onClick: function () { act('freeroute.catalog.sync', {}, 'catsync') }
  }, '仅同步'))
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
    ? ('上次同步 ' + new Date(st.catalog.lastSyncAt).toLocaleString() + ' · ' + st.catalog.lastCount + ' 个厂商 · ' + st.catalog.lastFormat + ' 格式')
    : '尚未同步'
  catKids.push(React.createElement('div', { className: 'frp-stats', key: 's' },
    catStatus + (st.catalog.lastSyncError ? (' · 错误: ' + st.catalog.lastSyncError) : '')))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h1' },
    '目录 JSON 一行一个厂商（字段见下）：'))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h2' },
    '· apikey 可选：多把 Key 同步时整环导入并参与轮换'))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h3' },
    '· freeModels 可选：模型名不带 free 字样时声明免费名单'))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h4' },
    '· proxy 可选：该上游需走代理时填'))
  catKids.push(React.createElement('div', { className: 'frp-stats frp-muted', key: 'h5' },
    '模型列表无需写死——同步后自动探测；也兼容 models.dev 的 api.json。'))
  const catCard = React.createElement('div', { className: 'frp-card' }, catKids)

