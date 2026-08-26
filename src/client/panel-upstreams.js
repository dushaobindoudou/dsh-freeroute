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
      metaBits.push(tr('disabled'))
    } else {
      metaBits.push(tr('freeModels') + ' ' + (u.freeCount || 0) + '/' + (u.modelsCount || 0))
      if (u.noAuth) metaBits.push(tr('noAuth'))
      else if (u.keys > 1) metaBits.push(tr('keyX') + u.keys)
      else if (u.configured) metaBits.push(tr('keyConfigured'))
      else metaBits.push(tr('keyNeeded'))
      if (u.health.state === 'cooling') metaBits.push(tr('cooling') + ' ' + Math.ceil(u.health.cooldownMs / 1000) + tr('coolingUnit'))
      else if (u.health.state === 'degraded') metaBits.push(tr('degraded'))
      metaBits.push(u.probedAt ? (tr('probed') + ' ' + new Date(u.probedAt).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US')) : tr('notProbed'))
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
          key: 'up', className: 'frp-btn frp-btn-ghost frp-iconbtn', title: tr('moveUp'),
          disabled: busy === 'mv-' + u.id || u.priority === 0,
          onClick: function (e) { e.stopPropagation(); act('freeroute.apply-patch', { patch: movePatch('up', u.id) }, 'mv-' + u.id) }
        }, '↑'),
        React.createElement('button', {
          key: 'dn', className: 'frp-btn frp-btn-ghost frp-iconbtn', title: tr('moveDown'),
          disabled: busy === 'mv-' + u.id || u.priority === st.upstreams.length - 1,
          onClick: function (e) { e.stopPropagation(); act('freeroute.apply-patch', { patch: movePatch('down', u.id) }, 'mv-' + u.id) }
        }, '↓'),
        React.createElement('label', {
          key: 'en', className: 'frp-switch', title: tr('enableTitle'),
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

      // 密钥显示/隐藏：隐藏态 = span 内 14 个星号（已配置时）；显示态 =
      // 多行输入框（一行一把，可编辑保存）。未配置时无需掩码，直接多行输入。
      // 切换按钮用 睁眼/闭眼 图标（aria-label + title 同步本地化）。
      if (!u.noAuth) {
        const shown = !!showKeys[u.id]
        const ph = u.configured
          ? tr('phConfigured')
          : tr('phEmpty', { name: u.name })
        // 显示密钥：切换为「显示」态；编辑框为空时预填完整 Key 环（一行一把）
        const revealKeys = function () {
          const n = {}
          n[u.id] = true
          setShowKeys(Object.assign({}, showKeys, n))
          const v = keyViews[u.id]
          const fill = function (keys) {
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
        const keyKids = []
        if (shown || !u.configured) {
          keyKids.push(React.createElement('textarea', {
            key: 'in', className: 'frp-input frp-keyarea', rows: 2, spellCheck: false, autoComplete: 'off',
            placeholder: ph,
            value: drafts[draftKey] || '',
            onChange: function (e) { setDraft(draftKey, e.target.value) }
          }))
        } else {
          // 已配置且隐藏：span + 星号掩码（点击掩码即显示）
          keyKids.push(React.createElement('span', {
            key: 'mask', className: 'frp-keymask',
            title: tr('eyeShow'),
            onClick: revealKeys
          }, '**************'))
        }
        keyKids.push(React.createElement('button', {
          key: 'tg', className: 'frp-btn frp-btn-ghost frp-iconbtn frp-keytoggle',
          title: shown ? tr('eyeHide') : tr('eyeShow'),
          'aria-label': shown ? tr('eyeHide') : tr('eyeShow'),
          'aria-pressed': shown ? 'true' : 'false',
          onClick: function () {
            if (shown) {
              const n = {}
              n[u.id] = false
              setShowKeys(Object.assign({}, showKeys, n))
            } else {
              revealKeys()
            }
          }
        }, shown ? EYE_OFF_ICON : EYE_ON_ICON))
        dk.push(React.createElement('div', { className: 'frp-keyrow', key: 'key' }, keyKids))
      }

      // 底部操作组：隐藏 / 测试连通 / 探测模型 / 保存 + 最右侧小字链接（申请 Key / 申请教程）
      const actRow = []
      actRow.push(React.createElement('button', {
        key: 'hide', className: 'frp-btn frp-btn-ghost',
        title: tr('hideUpstreamTitle'),
        disabled: busy === 'rm-' + u.id,
        onClick: function (e) { e.stopPropagation(); act('freeroute.remove-upstream', { id: u.id }, 'rm-' + u.id) }
      }, tr('hideUpstream')))
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
      }, busy === 't-' + u.id ? tr('testing') : tr('test')))
      actRow.push(React.createElement('button', {
        key: 'probe', className: 'frp-btn',
        disabled: busy === 'pb-' + u.id,
        onClick: function (e) { e.stopPropagation(); act('freeroute.probe', { id: u.id }, 'pb-' + u.id) }
      }, busy === 'pb-' + u.id ? tr('probing') : tr('probe')))
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
        }, tr('save')))
      }
      // 最右侧小字：申请 Key / 申请教程（href；极简目录的教程是 URL，内置教程步骤放悬停提示）
      const links = []
      if (u.signupUrl) {
        links.push(React.createElement('a', { key: 'reg', className: 'frp-a frp-a-sm', href: u.signupUrl, target: '_blank', rel: 'noreferrer' }, tr('applyKey')))
      }
      if (u.tutorialUrl) {
        links.push(React.createElement('a', { key: 'tut', className: 'frp-a frp-a-sm', href: u.tutorialUrl, target: '_blank', rel: 'noreferrer' }, tr('tutorial')))
      } else if (u.signupUrl && u.tutorial && u.tutorial.length > 0) {
        links.push(React.createElement('a', {
          key: 'tut', className: 'frp-a frp-a-sm', href: u.signupUrl, target: '_blank', rel: 'noreferrer',
          title: u.tutorial.map(function (x, si) { return (si + 1) + '. ' + x }).join('\n')
        }, tr('tutorial')))
      }
      if (links.length > 0) {
        actRow.push(React.createElement('span', { className: 'frp-headspace', key: 'sp2' }))
        for (const lk of links) actRow.push(lk)
      }
      dk.push(React.createElement('div', { className: 'frp-drow', key: 'act' }, actRow))

      // 结果反馈（瞬时信息，不常驻文案）
      if (testInfo) {
        const triedNote = Array.isArray(testInfo.tried) && testInfo.tried.length > 1 ? tr('triedModels', { n: testInfo.tried.length }) : ''
        if (testInfo.pending) {
          dk.push(React.createElement('div', { className: 'frp-muted', key: 'pend' }, '…'))
        } else if (testInfo.ok) {
          dk.push(React.createElement('div', { className: 'frp-ok', key: 'ok' }, '✓ ' + testInfo.model + (triedNote ? ' ' + triedNote : '') + ' · ' + testInfo.latencyMs + 'ms'))
        } else {
          dk.push(React.createElement('div', { className: 'frp-err', key: 'bad' }, '✗ ' + (testInfo.error || tr('fail')) + triedNote))
        }
      }
      if (u.health.lastError) {
        dk.push(React.createElement('div', { className: 'frp-err', key: 'lerr' }, String(u.health.lastError).slice(0, 160)))
      }
      if (Array.isArray(u.health.keyFails) && u.health.keyFails.length > 0) {
        dk.push(React.createElement('div', { className: 'frp-warn', key: 'kf' },
          u.health.keyFails.map(function (f) {
            return tr('keyFailWarn', { i: f.index, code: f.code })
          }).join('\n')))
      }

      kids.push(React.createElement('div', { className: 'frp-pdetail', key: 'detail' }, dk))
    }
    rows.push(React.createElement('div', { key: u.id }, kids))
  }
  // ---- 已隐藏上游（removed 标记）：一行汇总 + 逐家恢复 ----
  const hiddenList = Array.isArray(st.hiddenUpstreams) ? st.hiddenUpstreams : []
  if (hiddenList.length > 0) {
    const hk = []
    hk.push(React.createElement('span', { className: 'frp-muted', key: 'lbl' },
      tr('hiddenPrefix') + ' ' + hiddenList.length + tr('hiddenUnit') + '：'))
    hiddenList.forEach(function (h, hi) {
      hk.push(React.createElement('button', {
        key: 'r' + hi, className: 'frp-btn frp-btn-ghost frp-hiddenchip',
        title: tr('restore') + ' ' + h.name,
        disabled: busy === 'rs-' + h.id,
        onClick: function () { act('freeroute.restore-upstream', { id: h.id }, 'rs-' + h.id) }
      }, h.name + ' ↩'))
    })
    rows.push(React.createElement('div', { className: 'frp-hiddenrow', key: 'hidden' }, hk))
  }
  self.push(React.createElement('div', { className: 'frp-card frp-plist', key: 'ups' }, rows))

