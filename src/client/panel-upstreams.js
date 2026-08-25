  const rows = []
  for (let i = 0; i < st.upstreams.length; i++) {
    const u = st.upstreams[i]
    const open = openId === u.id
    const dotClass = !u.enabled
      ? 'frp-dot-off'
      : (u.health.state === 'cooling'
        ? 'frp-dot-cooling'
        : (u.health.state === 'degraded' ? 'frp-dot-degraded' : (u.configured || u.noAuth ? 'frp-dot-up' : 'frp-dot-off')))
    const draftKey = 'draft-' + u.id
    const testInfo = tests[u.id]
    const metaBits = []
    if (!u.enabled) {
      metaBits.push('已停用')
    } else {
      metaBits.push('免费 ' + (u.freeCount || 0) + '/' + (u.modelsCount || 0))
      if (u.noAuth) metaBits.push('免鉴权')
      else if (u.keys > 1) metaBits.push('Key ×' + u.keys)
      else if (u.configured) metaBits.push('Key 已配置')
      else metaBits.push('待配置 Key')
      if (u.health.state === 'cooling') metaBits.push('冷却 ' + Math.ceil(u.health.cooldownMs / 1000) + 's')
      else if (u.health.state === 'degraded') metaBits.push('状态不佳')
      metaBits.push(u.probedAt ? ('探测 ' + new Date(u.probedAt).toLocaleTimeString()) : '未探测')
    }
    const kids = []
    kids.push(React.createElement('div', {
      key: 'row', className: 'frp-prow',
      onClick: function () { setOpenId(open ? null : u.id) }
    },
      React.createElement('span', { className: 'frp-dot ' + dotClass, key: 'dot', title: u.health.state }),
      React.createElement('span', { className: 'frp-pname' + (u.enabled ? '' : ' frp-muted'), key: 'nm' }, u.name),
      React.createElement('span', { className: 'frp-pmeta', key: 'meta' }, metaBits.join(' · ')),
      React.createElement('span', { key: 'ctl', className: 'frp-pctl' },
        React.createElement('button', {
          key: 'up', className: 'frp-btn frp-btn-ghost frp-iconbtn', title: '上移',
          disabled: busy === 'mv-' + u.id || u.priority === 0,
          onClick: function (e) { e.stopPropagation(); act('freeroute.apply-patch', { patch: movePatch('up', u.id) }, 'mv-' + u.id) }
        }, '↑'),
        React.createElement('button', {
          key: 'dn', className: 'frp-btn frp-btn-ghost frp-iconbtn', title: '下移',
          disabled: busy === 'mv-' + u.id || u.priority === st.upstreams.length - 1,
          onClick: function (e) { e.stopPropagation(); act('freeroute.apply-patch', { patch: movePatch('down', u.id) }, 'mv-' + u.id) }
        }, '↓'),
        React.createElement('label', {
          key: 'en', className: 'frp-switch', title: '启用 / 停用该上游',
          onClick: function (e) { e.stopPropagation() }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: u.enabled,
            disabled: busy === 'en-' + u.id,
            onChange: function (e) { act('freeroute.apply-patch', { patch: patchUpstream(u.id, { enabled: !!e.target.checked }) }, 'en-' + u.id) }
          }),
          React.createElement('span', { className: 'frp-slider' })),
        React.createElement('span', { className: 'frp-chev' + (open ? ' frp-chev-open' : ''), key: 'chev' }, '›'))))

    if (open) {
      const dk = []

      // 密钥：隐藏态=不可编辑的 **** 掩码（未配置时可直接输入）；
      // 「显示」态=编辑框内按「一行一把」预填已配置的 Key，可直接编辑后保存
      if (!u.noAuth) {
        const shown = !!showKeys[u.id]
        const ph = u.configured
          ? '输入新值可覆盖已配置的 Key；多把用换行/逗号分隔'
          : ('粘贴 ' + u.name + ' 的 API Key（多把用换行/逗号分隔，自动轮换）')
        const keyKids = []
        if (shown) {
          keyKids.push(React.createElement('textarea', {
            key: 'in', className: 'frp-input frp-keyarea', rows: 2, spellCheck: false, autoComplete: 'off',
            placeholder: ph,
            value: drafts[draftKey] || '',
            onChange: function (e) { setDraft(draftKey, e.target.value) }
          }))
        } else if (u.configured) {
          // 已配置且隐藏：不可编辑，仅展示掩码
          keyKids.push(React.createElement('input', {
            key: 'in', className: 'frp-input', type: 'password', readOnly: true, spellCheck: false, autoComplete: 'off',
            value: '\u2022\u2022\u2022\u2022\u2022\u2022',
            title: '点击「显示」查看并编辑已配置的 Key'
          }))
        } else {
          // 未配置且隐藏：直接输入
          keyKids.push(React.createElement('input', {
            key: 'in', className: 'frp-input', type: 'password', spellCheck: false, autoComplete: 'off',
            placeholder: ph,
            value: drafts[draftKey] || '',
            onChange: function (e) { setDraft(draftKey, e.target.value) }
          }))
        }
        keyKids.push(React.createElement('button', {
          key: 'tg', className: 'frp-btn frp-btn-ghost frp-keytoggle',
          title: shown ? '隐藏密钥内容' : '显示已配置的完整密钥',
          onClick: function () {
            const next = !shown
            const n = {}
            n[u.id] = next
            setShowKeys(Object.assign({}, showKeys, n))
            if (!next) return
            const v = keyViews[u.id]
            const fill = function (keys) {
              // 编辑框为空时才预填完整 Key 环（一行一把），不覆盖正在输入的内容
              if (!(drafts[draftKey] || '').trim() && Array.isArray(keys) && keys.length > 0) {
                setDraft(draftKey, keys.join('\n'))
              }
            }
            if (v && v.loaded) { fill(v.keys); return }
            host.call('freeroute.get-keys', { id: u.id }).then(function (r) {
              const keys = (r && r.ok && Array.isArray(r.keys)) ? r.keys : []
              const nv = {}
              nv[u.id] = { loaded: true, keys: keys }
              setKeyViews(Object.assign({}, keyViews, nv))
              fill(keys)
            }).catch(function () {
              const nv = {}
              nv[u.id] = { loaded: true, keys: [] }
              setKeyViews(Object.assign({}, keyViews, nv))
            })
          }
        }, shown ? '隐藏' : '显示'))
        dk.push(React.createElement('div', { className: 'frp-keyrow', key: 'key' }, keyKids))
      }

      // 底部操作组：删除 / 测试连通 / 探测模型 / 保存 / 清除 + 最右侧小字链接（申请 Key / 申请教程）
      const actRow = []
      actRow.push(React.createElement('button', {
        key: 'btn', className: 'frp-btn',
        disabled: busy === 't-' + u.id,
        onClick: function () {
          const n = {}
          n[u.id] = { pending: true }
          setTests(Object.assign({}, tests, n))
          host.call('freeroute.test', { id: u.id }).then(function (r) {
            const n2 = {}
            n2[u.id] = r
            setTests(Object.assign({}, tests, n2))
            refresh()
          }).catch(function (e) {
            const n3 = {}
            n3[u.id] = { ok: false, error: String((e && e.message) || e) }
            setTests(Object.assign({}, tests, n3))
          })
        }
      }, busy === 't-' + u.id ? '测试中…' : '测试连通'))
      actRow.push(React.createElement('button', {
        key: 'probe', className: 'frp-btn',
        disabled: busy === 'pb-' + u.id,
        onClick: function () { act('freeroute.probe', { id: u.id }, 'pb-' + u.id) }
      }, busy === 'pb-' + u.id ? '探测中…' : '探测模型'))
      if (!u.noAuth) {
        actRow.push(React.createElement('button', {
          key: 'save', className: 'frp-btn frp-btn-primary',
          disabled: busy === 'key-' + u.id || !(drafts[draftKey] || '').trim(),
          onClick: function () { act('freeroute.set-key', { id: u.id, key: drafts[draftKey] }, 'key-' + u.id, function () {
            setDraft(draftKey, '')
            const nv = {}; nv[u.id] = { loaded: false, keys: null }
            setKeyViews(Object.assign({}, keyViews, nv))
            // 保存成功：直接回到隐藏掩码态（不再停留在「显示」的明文编辑态）
            const nh = {}; nh[u.id] = false
            setShowKeys(Object.assign({}, showKeys, nh))
          }) }
        }, '保存'))
      }
      // 最右侧小字：申请 Key / 申请教程（href；极简目录的教程是 URL，内置教程步骤放悬停提示）
      const links = []
      if (u.signupUrl) {
        links.push(React.createElement('a', { key: 'reg', className: 'frp-a frp-a-sm', href: u.signupUrl, target: '_blank', rel: 'noreferrer' }, '申请 Key ↗'))
      }
      if (u.tutorialUrl) {
        links.push(React.createElement('a', { key: 'tut', className: 'frp-a frp-a-sm', href: u.tutorialUrl, target: '_blank', rel: 'noreferrer' }, '申请教程 ↗'))
      } else if (u.signupUrl && u.tutorial && u.tutorial.length > 0) {
        links.push(React.createElement('a', {
          key: 'tut', className: 'frp-a frp-a-sm', href: u.signupUrl, target: '_blank', rel: 'noreferrer',
          title: u.tutorial.map(function (x, si) { return (si + 1) + '. ' + x }).join('\n')
        }, '申请教程 ↗'))
      }
      if (links.length > 0) {
        actRow.push(React.createElement('span', { className: 'frp-headspace', key: 'sp2' }))
        for (const lk of links) actRow.push(lk)
      }
      dk.push(React.createElement('div', { className: 'frp-drow', key: 'act' }, actRow))

      // 结果反馈（瞬时信息，不常驻文案）
      if (testInfo) {
        const triedNote = Array.isArray(testInfo.tried) && testInfo.tried.length > 1 ? ('（已试 ' + testInfo.tried.length + ' 个模型）') : ''
        if (testInfo.pending) {
          dk.push(React.createElement('div', { className: 'frp-muted', key: 'pend' }, '…'))
        } else if (testInfo.ok) {
          dk.push(React.createElement('div', { className: 'frp-ok', key: 'ok' }, '✓ ' + testInfo.model + (triedNote ? ' ' + triedNote : '') + ' · ' + testInfo.latencyMs + 'ms'))
        } else {
          dk.push(React.createElement('div', { className: 'frp-err', key: 'bad' }, '✗ ' + (testInfo.error || '失败') + triedNote))
        }
      }
      if (u.health.lastError) {
        dk.push(React.createElement('div', { className: 'frp-err', key: 'lerr' }, String(u.health.lastError).slice(0, 160)))
      }
      if (Array.isArray(u.health.keyFails) && u.health.keyFails.length > 0) {
        dk.push(React.createElement('div', { className: 'frp-warn', key: 'kf' },
          u.health.keyFails.map(function (f) {
            return '⚠ 第 ' + f.index + ' 把 Key 失效(' + f.code + ')，已自动轮换'
          }).join('\n')))
      }

      kids.push(React.createElement('div', { className: 'frp-pdetail', key: 'detail' }, dk))
    }
    rows.push(React.createElement('div', { key: u.id }, kids))
  }
  self.push(React.createElement('div', { className: 'frp-card frp-plist', key: 'ups' }, rows))

