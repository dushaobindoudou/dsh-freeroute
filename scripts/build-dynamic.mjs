// Stage 1 of the build pipeline: assemble the src/ layer fragments into
// freeroute-dynamic/{host,client}.js - the single-function-body sources the
// dynamic plugin loader and the integration rig
// (freeroute-dynamic/test/integration.mjs) consume. Stage 2
// (build-static*.mjs) then mechanically transforms those into lib/.
//
// Assembly is pure ordered concatenation around fixed wrapper strings, so the
// generated files stay byte-stable and diffable in CI (lib-drift guard).
//
// Scope model - fragments share ONE function scope per target. Which scope a
// fragment lives in is decided solely by which manifest array below lists it
// (file names carry no ordering or scope information):
//   HOST_HEAD is top-level; HOST_BODY lives inside apply(ctx) (4-space
//   indent), spliced between the plugin wrapper's open/close lines.
//   CLIENT_TOP is top-level; CLIENT_PANEL lives inside Section() (2-space
//   indent); CLIENT_TAIL is top-level again.
// Version is injected from package.json (single source of truth).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const VERSION_PLACEHOLDER = "'__FREEROUTE_PACKAGE_VERSION__'"

// ---- host: top-level head, plugin wrapper opens apply(ctx), body, close ----
const HOST_HEAD = [
  'constants.js',
  'builtin.js',
  'utils.js',
  'config-schema.js',
  'catalog-parse.js',
]
const HOST_BODY = [
  'context.js',
  'registry.js',
  'keys.js',
  'probe.js',
  'models.js',
  'health.js',
  'transport.js',
  'router.js',
  'http.js',
  'takeover.js',
  'state.js',
  'rpc.js',
  'commands.js',
  'endpoint.js',
  'boot.js',
]
// Must stay byte-identical to the marker build-static.mjs splits on.
const HOST_WRAPPER_OPEN = "return {\n  inject: ['llm', 'timer', 'settings', 'credentials', 'subprocess'],\n  apply(ctx) {\n"
const HOST_WRAPPER_CLOSE = '  }\n}\n'

// ---- client: styles/context, Section() body, models page + plugin tail ----
const CLIENT_TOP = [
  'styles.js',
  'context.js',
  'i18n.js',
]
const CLIENT_PANEL = [
  'panel-state.js',
  'panel-header.js',
  'panel-upstreams.js',
  'panel-advanced.js',
  'panel-models.js',
]
const CLIENT_TAIL = [
  'models-page.js',
  'integration.js',
  'plugin.js',
]
// Must stay byte-identical to the markers build-static-client.mjs rewrites.
const SECTION_OPEN = 'function Section(props) {\n'
const SECTION_CLOSE = '}\n'

const frag = (dir, name) => readFileSync(join(root, 'src', dir, name), 'utf8')
const cat = (dir, names) => names.map((n) => frag(dir, n)).join('')

let host = cat('host', HOST_HEAD) + HOST_WRAPPER_OPEN + cat('host', HOST_BODY) + HOST_WRAPPER_CLOSE
const nSub = host.split(VERSION_PLACEHOLDER).length - 1
if (nSub !== 1) throw new Error('VERSION placeholder must occur exactly once in src/host/constants.js, found ' + nSub)
host = host.replace(VERSION_PLACEHOLDER, "'" + pkg.version + "'")

const client = cat('client', CLIENT_TOP) + SECTION_OPEN + cat('client', CLIENT_PANEL) + SECTION_CLOSE + cat('client', CLIENT_TAIL)

// ---- guards ----
// Backticks would break the integration rig's new Function wrapping.
for (const [name, src] of [['host', host], ['client', client]]) {
  if (src.includes('`')) throw new Error('assembled ' + name + '.js contains a backtick')
}
// Compile check: new Function only parses the body, it never executes it.
new Function('harness', "'use strict'; return (async function () {\n" + host + "\n})()")
new Function(client)
// Downstream stage-2 markers must survive assembly.
if (!host.includes(HOST_WRAPPER_OPEN.trimEnd())) throw new Error('stage-2 wrapper marker missing from assembled host')
if (!client.includes('function Section(props) {')) throw new Error('Section marker missing from assembled client')
if (!client.includes("return {\n  inject: ['slots', 'timer'],")) throw new Error('plugin tail marker missing from assembled client')

writeFileSync(join(root, 'freeroute-dynamic', 'host.js'), host)
writeFileSync(join(root, 'freeroute-dynamic', 'client.js'), client)
console.log('freeroute-dynamic/host.js written:', host.length, 'bytes (v' + pkg.version + ')')
console.log('freeroute-dynamic/client.js written:', client.length, 'bytes')
