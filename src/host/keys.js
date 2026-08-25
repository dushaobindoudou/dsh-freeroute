    // ---- 多 Key 轮换 ----
    // 免费额度按账号计：同厂商多账号多把 Key 是常态。约定扩展引用
    // FREEROUTE_X_API_KEY / _2 / _3…（至多 8 把）：鉴权或限流失败换下一把
    // （Key 级冷却），全部失败才把失败上报给上游级熔断。
    const keyHealth = new Map() // ref -> cooldownUntil（Key 级冷却）
    const keyCursor = new Map() // upstreamId -> 轮转起始下标（成功后推进，均匀分摊配额）
    const keyFailNotes = new Map() // upstreamId -> 最近 Key 级失败 [{index, code, at}]（面板「第几把失效」提示）

    // 用户配置的第几把：ref 无 _N 后缀为第 1 把，_2/_3… 依此类推
    function keyNumber(ref) {
      const m = /_(\d+)$/.exec(ref || '')
      return m ? parseInt(m[1], 10) : 1
    }
    function noteKeyFail(id, index, code) {
      let arr = keyFailNotes.get(id)
      if (!arr) { arr = []; keyFailNotes.set(id, arr) }
      arr.unshift({ index: index, code: code, at: Date.now() })
      if (arr.length > 3) arr.length = 3
    }

    function keyRefsFor(up) {
      const refs = [up.keyRef]
      for (let i = 2; i <= 8; i++) refs.push(up.keyRef + '_' + i)
      return refs
    }

    async function keyRing(up) {
      if (up.noAuth) return [{ ref: null, key: '' }]
      if (credentials === undefined) return []
      const ring = []
      for (const ref of keyRefsFor(up)) {
        try {
          const hit = await credentials.resolve(ref)
          if (hit && typeof hit.value === 'string' && hit.value.trim().length > 0) ring.push({ ref: ref, key: hit.value.trim() })
        } catch (e) { }
      }
      return ring
    }

    function orderKeys(up, ring) {
      if (ring.length <= 1) return ring.slice()
      const start = ((keyCursor.get(up.id) || 0) % ring.length + ring.length) % ring.length
      const now = Date.now()
      const ordered = []
      for (let i = 0; i < ring.length; i++) {
        const ke = ring[(start + i) % ring.length]
        if ((keyHealth.get(ke.ref) || 0) <= now) ordered.push(ke)
      }
      if (ordered.length === 0) {
        // 全部在冷却：按轮转序全量使用（总比直接判死刑好）
        for (let i = 0; i < ring.length; i++) ordered.push(ring[(start + i) % ring.length])
      }
      return ordered
    }

    function coolKey(ref, err) {
      if (!ref) return
      const code = String((err && err.code) || '')
      const ms = code === 'AUTH' ? 1800000 : ((err && err.providerRetryAfterMs) || 300000)
      keyHealth.set(ref, Date.now() + ms)
    }

    async function maybeKey(up) {
      const ring = await keyRing(up)
      return ring.length > 0 ? ring[0].key : ''
    }

