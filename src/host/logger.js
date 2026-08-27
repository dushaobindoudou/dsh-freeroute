// freeroute 本地日志：把运行时日志写到 $DSH_HOME/freeroute.log，
// 不再打印到控制台（避免污染 dsh 宿主进程输出）。
// 动态构建不注入 __nodeFs/__nodeOs，需用 typeof 守卫并优雅降级。
// 由 build-static.mjs 注入的 fs/os 导入在静态构建中天然可用。
// 仅依赖 build-static.mjs 白名单内的 mkdirSync/readFileSync/renameSync/
// statSync/writeFileSync，不使用 openSync/writeSync/closeSync。
// 本片段不走 module.exports：动态构建把所有 HOST_BODY 片段拼接进同一个
// apply() 函数作用域，直接把 log 声明为本作用域函数，供 router.js 等片段调用。

const LOG_DIR = 'freeroute'
const LOG_NAME = 'freeroute.log'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

let __logPath = null

function __freerouteFs () {
  return (typeof __nodeFs === 'object' && __nodeFs !== null) ? __nodeFs : null
}
function __freerouteOs () {
  return (typeof __nodeOs === 'object' && __nodeOs !== null) ? __nodeOs : null
}

function __freerouteResolveLogPath () {
  if (__logPath) return __logPath
  const fs = __freerouteFs()
  const os = __freerouteOs()
  if (!fs || !os) return null
  // DSH_HOME 本身就是 .dsh 根目录（如 ~/.dsh），直接在其下建 freeroute/；
  // 未设置时回退 homedir 并补 .dsh 段。此前无条件拼 '/.dsh/' 会在
  // DSH_HOME=/Users/x/.dsh 时写出 /Users/x/.dsh/.dsh/freeroute/（双重路径）。
  let base = null
  let suffix = '/.dsh'
  if (typeof process === 'object' && process !== null && typeof process.env === 'object' && process.env.DSH_HOME) {
    base = process.env.DSH_HOME
    suffix = ''
  }
  if (!base) {
    try { base = os.homedir() } catch (e) { /* ignore */ }
  }
  if (!base) return null
  __logPath = base + suffix + '/' + LOG_DIR + '/' + LOG_NAME
  return __logPath
}

function __freerouteRotateIfNeeded () {
  const fs = __freerouteFs()
  const path = __freerouteResolveLogPath()
  if (!fs || !path) return
  try {
    const st = fs.statSync(path)
    let rotated = false
    if (st.size > MAX_BYTES) rotated = true
    else {
      const age = Date.now() - (st.mtime && st.mtime.getTime ? st.mtime.getTime() : 0)
      if (age > MAX_AGE_MS) rotated = true
    }
    if (rotated) {
      try { fs.renameSync(path, path + '.1') } catch (e) { /* ignore */ }
    }
  } catch (e) { /* 文件不存在视为无需轮转 */ }
}

function log (message) {
  const fs = __freerouteFs()
  const path = __freerouteResolveLogPath()
  if (!fs || !path) return
  try {
    __freerouteRotateIfNeeded()
    const dir = path.slice(0, path.lastIndexOf('/'))
    try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { /* ignore */ }
    const line = new Date().toISOString() + ' ' + message + '\n'
    fs.writeFileSync(path, line, { flag: 'a' })
  } catch (e) { /* ignore */ }
}