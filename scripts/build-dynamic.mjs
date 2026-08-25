// Stage 1 of the build pipeline: assemble the src/ layer fragments into
// freeroute-dynamic/{host,client}.js - the single-function-body sources the
// dynamic plugin loader and the integration rig
// (freeroute-dynamic/test/integration.mjs) consume. Stage 2
// (build-static*.mjs) then mechanically transforms those into lib/.
//
// Assembly is pure ordered concatenation around fixed wrapper strings, so the
// generated files stay byte-stable and diffable in CI (lib-drift guard).
//
// Scope model - fragments share ONE function scope per target:
//   src/host/00-40 are top-level; 50-99 live inside apply(ctx) (4-space
//   indent) and are spliced between the plugin wrapper's open/close lines.
//   src/client/00-05 are top-level; 10-50 live inside Section() (2-space
//   indent); 60-80 are top-level again.
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
  '00-constants.js',
  '10-builtin.js',
  '20-utils.js',
  '30-config-schema.js',
  '40-catalog-parse.js',
]
const HOST_BODY = [
  '50-context.js',
  '55-registry.js',
  '60-keys.js',
  '65-probe.js',
  '70-models.js',
  '75-health.js',
  '80-transport.js',
  '85-router.js',
  '88-http.js',
  '90-takeover.js',
  '92-state.js',
  '94-rpc.js',
  '96-commands.js',
  '97-endpoint.js',
  '99-boot.js',
]
// Must stay byte-identical to the marker build-static.mjs splits on.
const HOST_WRAPPER_OPEN = "return {\n  inject: ['llm', 'timer', 'settings', 'credentials', 'subprocess'],\n  apply(ctx) {\n"
const HOST_WRAPPER_CLOSE = '  }\n}\n'

// ---- client: styles/context, Section() body, models page + plugin tail ----
const CLIENT_TOP = [
  '00-styles.js',
  '05-context.js',
]
const CLIENT_PANEL = [
  '10-panel-state.js',
  '20-panel-header.js',
  '30-panel-upstreams.js',
  '40-panel-advanced.js',
  '50-panel-models.js',
]
const CLIENT_TAIL = [
  '60-models-page.js',
  '70-integration.js',
  '80-plugin.js',
]
// Must stay byte-identical to the markers build-static-client.mjs rewrites.
const SECTION_OPEN = 'function Section(props) {\n'
const SECTION_CLOSE = '}\n'

const frag = (dir, name) => readFileSync(join(root, 'src', dir, name), 'utf8')
const cat = (dir, names) => names.map((n) => frag(dir, n)).join('')

let host = cat('host', HOST_HEAD) + HOST_WRAPPER_OPEN + cat('host', HOST_BODY) + HOST_WRAPPER_CLOSE
const nSub = host.split(VERSION_PLACEHOLDER).length - 1
if (nSub !== 1) throw new Error('VERSION placeholder must occur exactly once in src/host/00-constants.js, found ' + nSub)
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
