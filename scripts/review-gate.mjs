// 评审门禁（review gate）：把「改动是否达标」变成一条可执行的命令。
//
//   node scripts/review-gate.mjs                 # 完整
//   node scripts/review-gate.mjs --fast          # 集成测试只跑 1 次
//   node scripts/review-gate.mjs --only G2,G11   # 只跑指定项
//
// 退出码：0 = 全过（允许存在 WARN）；1 = 有 FAIL。
//
// 背景：router 的 auto 分层（锚点/同款/同窗/容量）逻辑集中在 src/host/router.js，
// 但真正覆盖它的断言在 freeroute-dynamic/test/integration.mjs —— 而 npm test
// 历史上只跑 smoke + client-integration，CI 也只跑 npm test，于是这些断言长期
// 没有被执行过。门禁把「接线」「口径」「跨版本」都变成硬判据，避免再次出现
// 「写了测试但没接线」「注释还停在旧口径」「CI 随机红」。
//
// 只依赖 Node 内置模块，不联网。G5 会重建派生产物（lib/、freeroute-dynamic/），
// 这是幂等操作：只从 src/ 生成，不改 src/。
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fast = process.argv.includes('--fast')
const onlyIdx = process.argv.indexOf('--only')
const onlyVal = onlyIdx >= 0
  ? (process.argv[onlyIdx + 1] || '')
  : (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '')
const only = onlyVal ? onlyVal.split(',').map((s) => s.trim()).filter(Boolean) : null

const read = (rel) => {
  const p = join(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}
const run = (cmd, args, opts = {}) => {
  try {
    const out = execFileSync(cmd, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout || 300000,
      env: { ...process.env, ...(opts.env || {}) }
    })
    return { code: 0, out }
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      out: (e.stdout || '') + (e.stderr || ''),
      killed: e.killed === true
    }
  }
}

// ------------------------------------------------------------------ 门禁注册
const gates = []
const gate = (id, title, fn) => gates.push({ id, title, fn })

// ---------------------------------------------------------------- G1 接线
gate('G1', '集成测试已接入 npm test（CI 随之一并执行）', () => {
  const pkg = JSON.parse(read('package.json'))
  const t = String((pkg.scripts && pkg.scripts.test) || '')
  const wired = t.includes('integration.mjs')
  const ci = read('.github/workflows/ci.yml') || ''
  const ciRunsTest = /run:\s*npm test/.test(ci)
  const ok = wired && ciRunsTest
  return {
    level: ok ? 'PASS' : 'FAIL',
    detail: 'package.json scripts.test = ' + JSON.stringify(t) + '\n' +
      'CI 是否跑 npm test = ' + (ciRunsTest ? '是' : '否') + '\n' +
      (ok ? '' : '修法：scripts.test 追加 "node freeroute-dynamic/test/integration.mjs"；' +
        'CI 已有 npm test，无需改 workflow。\n' +
        '注意：接入前必须先让 G2 变绿（集成测试当前有 flaky 用例，接进去会让 CI 随机红）。')
  }
})

// ---------------------------------------------------------------- G2 无 flaky
gate('G2', '集成测试连跑 ' + (fast ? 1 : 3) + ' 次零失败（无 flaky）', () => {
  const runs = fast ? 1 : 3
  const lines = []
  let bad = 0
  for (let i = 0; i < runs; i++) {
    const r = run(process.execPath, ['freeroute-dynamic/test/integration.mjs'], { timeout: 180000 })
    const m = r.out.match(/通过 (\d+) 项，失败 (\d+) 项/)
    const fails = r.out.split('\n').filter((l) => l.includes('✗'))
    if (r.code !== 0 || (m && Number(m[2]) > 0)) {
      bad++
      lines.push('第 ' + (i + 1) + '/' + runs + ' 次失败' + (m ? '（' + m[0] + '）' : '（exit ' + r.code + '）'))
      fails.slice(0, 4).forEach((l) => lines.push('    ' + l.trim().slice(0, 200)))
    } else {
      lines.push('第 ' + (i + 1) + '/' + runs + ' 次通过（' + (m ? m[0] : '?') + '）')
    }
  }
  return {
    level: bad === 0 ? 'PASS' : 'FAIL',
    detail: lines.join('\n') + (bad === 0 ? '' : '\n修法见守卫清单 A1/A2：把依赖「池内残留」的段落改成显式 isolatePool。')
  }
})

// ---------------------------------------------------------------- G3 口径一致
gate('G3', '文档与注释口径统一为「交集家数 → 质量档」', () => {
  const stale = []
  const probes = [
    ['src/host/builtin.js', /是 auto 路由的第一排序键/],
    ['src/host/config-schema.js', /第一排序键/],
    ['freeroute-dynamic/catalog/schema.md', /auto 路由的第一排序键/],
    ['README.md', /five layers/i],
    ['README.md', /highest declared `quality`/],
    ['README.zh-CN.md', /分五层/],
    ['README.zh-CN.md', /先比目录声明的/]
  ]
  for (const [rel, re] of probes) {
    const src = read(rel)
    if (src && re.test(src)) stale.push(rel + ' 命中 ' + re)
  }
  const router = read('src/host/router.js') || ''
  if (!/交集|coverage/.test(router)) stale.push('src/host/router.js 里找不到「交集/coverage」口径')
  return {
    level: stale.length === 0 ? 'PASS' : 'FAIL',
    detail: stale.length === 0 ? '未发现旧口径残留' : stale.join('\n') +
      '\n修法：把「quality 是第一排序键」改成「交集家数优先、质量档平局裁决」；' +
      '「五层」按实现改成四层（锚点同款 / 其他同窗 / 够容量 / 兜底）。\n' +
      'CHANGELOG 的 0.9.0 段落是历史记录，不要改。'
  }
})

// ---------------------------------------------------------------- G4 seed 与命名空间一致
gate('G4', '锚点 seed 查找与 META 命名空间一致', () => {
  const router = read('src/host/router.js') || ''
  const namespaced = /function aggKey/.test(router)
  const seedLookup = router.match(/const seed = ([^\n]+)/)
  const raw = seedLookup ? seedLookup[1] : ''
  const bypass = /agg\.get\(canonicalModelId\(/.test(raw)
  const ok = namespaced && !bypass
  return {
    level: ok ? 'PASS' : 'FAIL',
    detail: '是否抽出 aggKey = ' + (namespaced ? '是' : '否') + '\n' +
      'seed 查找表达式 = ' + (raw || '未找到') + '\n' +
      (ok ? '' : '问题：canonicalModelId("orcarouter/free") 得到 "free"，而聚合表里的 key 是 "orcarouter/free"，\n' +
        '取不到 → seed 恒为 undefined，「原首选」这一级裁决静默失效（被 order 兜住，暂无可见后果，但是死代码）。\n' +
        '修法：抽一个 aggKey(upstreamId, modelId) 给两处共用。')
  }
})

// ---------------------------------------------------------------- G5 产物与 src 同步
gate('G5', '构建产物与 src/ 同步（lib-drift）', () => {
  const targets = ['lib/index.js', 'lib/client.js', 'freeroute-dynamic/host.js', 'freeroute-dynamic/client.js']
  const hashOf = (rel) => {
    const p = join(root, rel)
    if (!existsSync(p)) return null
    const buf = readFileSync(p)
    let h = 0
    for (let i = 0; i < buf.length; i++) h = (h * 31 + buf[i]) | 0
    return String(buf.length) + ':' + h
  }
  const before = targets.map((t) => [t, hashOf(t)])
  const r = run('npm', ['run', 'build:static'], { timeout: 180000 })
  if (r.code !== 0) {
    return { level: 'FAIL', detail: 'npm run build:static 失败：\n' + r.out.slice(-800) }
  }
  const changed = []
  for (const [t, h] of before) {
    if (h !== hashOf(t)) changed.push(t + (h === null ? '（原本不存在）' : ''))
  }
  return {
    level: changed.length === 0 ? 'PASS' : 'FAIL',
    detail: changed.length === 0
      ? '重建后产物逐字节一致，无漂移'
      : '重建改变了这些产物（说明提交前没跑 build:static）：\n  ' + changed.join('\n  ') +
        '\n门禁已帮你重建到最新，请把产物一并提交。'
  }
})

// ---------------------------------------------------------------- G6 lint
gate('G6', 'eslint 无告警', () => {
  const r = run('npm', ['run', 'lint'], { timeout: 180000 })
  return { level: r.code === 0 ? 'PASS' : 'FAIL', detail: r.code === 0 ? '' : r.out.slice(-1200) }
})

// ---------------------------------------------------------------- G7 目录 quality 覆盖
gate('G7', '远程目录 quality 标注覆盖', () => {
  const catPath = 'freeroute-dynamic/catalog/freeroute-catalog.json'
  const cat = read(catPath)
  if (!cat) return { level: 'WARN', detail: '未找到 ' + catPath }
  const j = JSON.parse(cat)
  const ups = j.upstreams || []
  let total = 0
  let marked = 0
  for (const u of ups) {
    for (const m of (u.models || [])) {
      total++
      if (Number(m.quality) > 0) marked++
    }
  }
  const pct = total ? Math.round((marked / total) * 100) : 0
  return {
    level: pct >= 50 ? 'PASS' : 'WARN',
    detail: '标注 ' + marked + ' / ' + total + '（' + pct + '%），上游 ' + ups.length + ' 家\n' +
      (pct >= 50 ? '' : '质量档是 coverage 打平时的裁决键。目录不标注 = 裁决键常年失效，\n' +
        '交集多但很弱的款（如 2.6B 级别）会一直压过交集少但很强的款。\n' +
        '要么补标注，要么加质量门（见守卫清单 B3），并在 CHANGELOG 写明现状。')
  }
})

// ---------------------------------------------------------------- G8 测试不挂死
gate('G8', 'npm test 连跑 2 次正常退出（不挂死 / 不 flaky）', () => {
  const lines = []
  let bad = 0
  for (let i = 0; i < 2; i++) {
    const r = run('npm', ['test'], { timeout: 240000 })
    if (r.code === 0 && !r.killed) {
      lines.push('第 ' + (i + 1) + '/2 次通过')
    } else {
      bad++
      lines.push('第 ' + (i + 1) + '/2 次失败' + (r.killed ? '（超时被 kill）' : '（exit ' + r.code + '）'))
      r.out.split('\n').filter((l) => l.includes('AssertionError') || l.includes('✗')).slice(0, 4).forEach((l) => lines.push('    ' + l.trim().slice(0, 180)))
    }
  }
  return {
    level: bad === 0 ? 'PASS' : 'FAIL',
    detail: lines.join('\n') + (bad === 0 ? '' :
      '\n常见根因：插件启动 4s 后的首轮目录同步会拉线上主源，覆盖测试自己建立的增量基线。\n' +
      'integration.mjs 已改成指向立即失败的本地源；test/smoke.mjs 第 5b 段尚未同样处理。')
  }
})

// ---------------------------------------------------------------- G9 版本号三处一致
gate('G9', '版本号三处一致（package / lock / CHANGELOG）', () => {
  const pkg = JSON.parse(read('package.json'))
  const lock = JSON.parse(read('package-lock.json'))
  const ch = read('CHANGELOG.md') || ''
  const chTop = (ch.match(/^## \[([^\]]+)\]/m) || [])[1] || '(无)'
  const v = pkg.version
  const problems = []
  if (lock.version !== v) problems.push('package-lock.json version = ' + lock.version)
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== v) {
    problems.push('package-lock.json packages[""].version = ' + lock.packages[''].version)
  }
  if (chTop !== v) problems.push('CHANGELOG 首个版本段 = ' + chTop)
  return {
    level: problems.length === 0 ? 'PASS' : 'FAIL',
    detail: 'package.json = ' + v + '\n' + (problems.length === 0 ? '三处一致' : problems.join('\n'))
  }
})

// ---------------------------------------------------------------- G10 注释与实现一致
gate('G10', 'router 注释与实现一致', () => {
  const router = read('src/host/router.js') || ''
  const problems = []
  if (/保持相邻/.test(router)) {
    problems.push('router.js 仍写着「层内同款模型的提供方保持相邻」，但实现里同一模型的不同提供方会跨层拆分')
  }
  if (/五层/.test(router)) problems.push('router.js 注释仍写「五层」，实现是四层（tiers 长度 4）')
  return {
    level: problems.length === 0 ? 'PASS' : 'FAIL',
    detail: problems.length === 0 ? '未发现矛盾注释' : problems.join('\n') +
      '\n修法：改成事实描述——同款模型的提供方按各自窗口分层，可能跨层；' +
      '「相邻」只对锚点层成立。'
  }
})

// ---------------------------------------------------------------- G11 跨 Node 版本
gate('G11', '跨 Node 版本跑集成测试（CI 矩阵 18/20/22）', () => {
  const home = process.env.HOME || ''
  const candidates = [
    join(home, '.nvm/versions/node/v18.20.8/bin/node'),
    join(home, '.nvm/versions/node/v20.19.0/bin/node')
  ].filter((p) => existsSync(p))
  if (candidates.length === 0) {
    return {
      level: 'WARN',
      detail: '本机未找到 Node 18/20 可执行文件，跳过交叉验证。\n' +
        '提醒：CI 矩阵含 Node 18，integration.mjs 现在进了 npm test，跨版本 flaky 会在 CI 上随机红。'
    }
  }
  const lines = []
  let bad = 0
  for (const bin of candidates) {
    const v = run(bin, ['-v']).out.trim()
    const r = run(bin, ['freeroute-dynamic/test/integration.mjs'], { timeout: 180000 })
    const m = r.out.match(/通过 (\d+) 项，失败 (\d+) 项/)
    if (r.code !== 0 || (m && Number(m[2]) > 0)) {
      bad++
      lines.push(v + ' 失败' + (m ? '（' + m[0] + '）' : '（exit ' + r.code + '）'))
      r.out.split('\n').filter((l) => l.includes('✗')).slice(0, 3).forEach((l) => lines.push('    ' + l.trim().slice(0, 180)))
    } else {
      lines.push(v + ' 通过（' + (m ? m[0] : '?') + '）')
    }
  }
  return { level: bad === 0 ? 'PASS' : 'FAIL', detail: lines.join('\n') }
})

// ------------------------------------------------------------------ 执行
const results = []
for (const g of gates) {
  if (only && only.indexOf(g.id) < 0) continue
  const r = g.fn()
  results.push({ id: g.id, title: g.title, level: r.level, detail: r.detail })
  const tag = r.level === 'PASS' ? '  ok  ' : r.level === 'WARN' ? ' warn ' : ' FAIL '
  console.log('[' + tag + '] ' + g.id + '  ' + g.title)
  if (r.detail) for (const line of String(r.detail).split('\n')) console.log('         ' + line)
}

const fails = results.filter((r) => r.level === 'FAIL')
const warns = results.filter((r) => r.level === 'WARN')
console.log('\n────────────────────────────────────────')
console.log('门禁结果：' + (results.length - fails.length - warns.length) + ' PASS / ' + warns.length + ' WARN / ' + fails.length + ' FAIL')
if (fails.length) console.log('未通过：' + fails.map((f) => f.id).join(', '))
console.log('────────────────────────────────────────')
process.exit(fails.length ? 1 : 0)
