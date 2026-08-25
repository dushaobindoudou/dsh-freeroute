    function statusText() {
      const lines = ['FreeRoute 免费模型代理 v' + VERSION + '（路由: ' + ROUTE + '）']
      const ups = orderedUpstreams()
      const promises = []
      for (const u of ups) promises.push(hasCredential(u))
      return Promise.all(promises).then(function (flags) {
        let ready = 0
        for (let i = 0; i < ups.length; i++) {
          const en = isEnabled(ups[i].id)
          if (en && flags[i]) ready++
          const h = health.get(ups[i].id) || {}
          const mark = !en ? '○ 关闭' : (cooling(ups[i].id) ? '◐ 冷却' : (flags[i] ? '● 就绪' : '◌ 无Key'))
          lines.push(mark + ' ' + ups[i].id + (h.lastError ? '（最近错误: ' + String(h.lastError).slice(0, 60) + '）' : ''))
        }
        const cat = userConfig.catalog && userConfig.catalog.remoteUrl
        lines.push('就绪上游 ' + ready + '/' + ups.length + '；远程目录: ' + (cat ? cat : '未配置') + (catalogMeta.lastSyncAt ? '（上次同步 ' + new Date(catalogMeta.lastSyncAt).toISOString() + '）' : ''))
        lines.push('把默认模型切到 ' + ROUTE + '/auto 即可开始使用；外部工具可用 ' + (webServer !== undefined ? ('http://127.0.0.1:' + webServer.port + '/freeroute/v1') : '（webServer 未挂载）'))
        return { kind: 'success', text: lines.join('\n') }
      })
    }

