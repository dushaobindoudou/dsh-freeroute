// Build lib/index.js from freeroute-dynamic/host.js (dynamic-plugin body)
// into the static Cordis plugin module format consumed by dsh profiles.
// Mechanical transform: ESM header + FreerouteRemote (Typert) replaces the
// dynamic harness.handle RPC loop; everything else stays byte-identical.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = readFileSync(join(root, 'freeroute-dynamic', 'host.js'), 'utf8')

const marker = "return {\n  inject: ['llm', 'timer', 'settings', 'credentials', 'subprocess'],\n  apply(ctx) {"
const i = src.indexOf(marker)
if (i < 0) throw new Error('apply wrapper marker not found')
const head = src.slice(0, i)
let body = src.slice(i + marker.length)
// strip the two closers the dynamic wrapper appended: apply's `}` and the
// return object's `}` — the body itself ends at the final console.log.
body = body.replace(/\s*\}\s*\}\s*$/, '\n')

const loop = `    for (const pair of Object.entries(rpc)) {
      const name = pair[0]
      const handler = pair[1]
      ctx.effect(function () { return harness.handle(name, handler) })
    }`
if (!body.includes(loop)) throw new Error('rpc registration loop not found')
body = body.replace(loop, `    // Client panel RPC: the dynamic harness.handle loop becomes a Typert
    // Remote namespace; method bodies stay the exact rpc handler map above.
    new FreerouteRemote(ctx, rpc)`)
if (body.includes('harness.handle(')) throw new Error('unexpected residual harness.handle call')

const METHODS = [
  ['state', 'freeroute.state'],
  ['setKey', 'freeroute.set-key'],
  ['clearKey', 'freeroute.clear-key'],
  ['applyPatch', 'freeroute.apply-patch'],
  ['removeUpstream', 'freeroute.remove-upstream'],
  ['restoreUpstream', 'freeroute.restore-upstream'],
  ['catalogSync', 'freeroute.catalog.sync'],
  ['probe', 'freeroute.probe'],
  ['test', 'freeroute.test'],
  ['setDefault', 'freeroute.set-default'],
  ['getKeys', 'freeroute.get-keys'],
]

const methodLines = METHODS.map(([m, ep]) =>
  `  async ${m}(request) { return this._rpc['${ep}'](request || {}) }`).join('\n')
const markList = METHODS.map((p) => p[0]).map((m) => `'${m}'`).join(', ')

const out = `/**
 * dsh-freeroute — free-tier model aggregation for the DeepSeek Harness (dsh).
 *
 * Registers the \`freeroute\` model provider backed by a user-configured pool
 * of free-quota upstreams (OpenCode Zen / OpenRouter / SenseNova built in,
 * plus remote catalog + custom gateways). Requests fail over transparently
 * between upstreams before the first token reaches the session;
 * an OpenAI-compatible local endpoint is served under \`/freeroute/v1\`.
 * 设置 → 模型 integration: the built-in models page is wrapped with a
 * 默认 | 免费 tab bar below the intro (client-side; Typert Remote
 * \`freeroute\` carries the panel data).
 *
 * Assembled from src/ (scripts/build-dynamic.mjs) into the dynamic-plugin
 * body (freeroute-dynamic/), integration-tested (137 assertions) - edit
 * src/, never the generated files. */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'

/**
 * Apply one \`@Remote(method)\` marker without decorator syntax: the shim
 * mimics the decorator context \`addMarkerInitializer\` expects, and the
 * initializer marks the prototype exactly like a real decorator would.
 */
function markRemoteMethod(prototype, method) {
  const decorator = Remote(method)
  decorator(undefined, {
    name: method,
    private: false,
    static: false,
    addInitializer(fn) { fn.call(Object.create(prototype)) },
  })
}

/**
 * \`freeroute\` Remote namespace consumed by the settings panel over the
 * client Connection RPC carrier (\`/api\`, endpoint \`freeroute/<method>\`).
 * Thin delegation onto the rpc handler map built inside apply(), so the
 * dynamic-plugin handler bodies stay the single source of truth.
 */
class FreerouteRemote extends TypertRemoteService {
  constructor(c, rpcMap) {
    super(c, 'freeroute')
    this._rpc = rpcMap
  }

${methodLines}
}
for (const m of [${markList}]) markRemoteMethod(FreerouteRemote.prototype, m)

${head.trimStart()}
export const inject = ['llm', 'timer', 'settings', 'credentials', 'subprocess']

export function apply(ctx, _config = {}) {
  // JSON 配置文件层（~/.dsh/freeroute.json）所需的 node 能力；动态沙箱里
  // 这两个标识符不存在，host 体内用 typeof 守卫降级到 settings 服务。
  const __nodeFs = { mkdirSync, readFileSync, renameSync, statSync, writeFileSync }
  const __nodeOs = { homedir }
${body}
}
`

writeFileSync(join(root, 'lib', 'index.js'), out)
console.log('lib/index.js written:', out.length, 'bytes')
