# src/ - layered sources

This directory is the **single hand-edited authority** for the plugin code.
`scripts/build-dynamic.mjs` assembles the fragments into
`freeroute-dynamic/{host,client}.js` (single-function-body format for the
dynamic plugin loader and the integration rig), and `build-static*.mjs` then
mechanically transforms those into `lib/` (the npm artifact). Never edit the
generated files - CI fails on drift.

## Why fragments instead of modules

The dynamic-plugin loader and the integration rig evaluate each source as ONE
function body (`new Function`), so the code cannot use `import`/`require`.
Layering is therefore expressed as ordered fragment files that share a single
scope per target, assembled by pure concatenation around fixed wrapper lines:

- `src/host/`: files in `HOST_HEAD` are top-level; those in `HOST_BODY` live
  **inside `apply(ctx)`** (hence their 4-space indent) and are spliced between
  the plugin wrapper's lines.
- `src/client/`: files in `CLIENT_TOP` are top-level; those in `CLIENT_PANEL`
  live **inside `Section()`** (2-space indent); `CLIENT_TAIL` is top-level
  again.

Fragment order and scope placement are both declared in the manifest arrays of
`scripts/build-dynamic.mjs` - file names carry no ordering or scope meaning.
Function declarations hoist inside the shared scope, so layers may call each
other freely; `const`/`let` bindings keep their textual order (all state is
declared in `host/context.js` or at first use before any side effect runs).

## host/ layers (bottom-up)

| Fragment | Layer |
|---|---|
| `constants.js` | VERSION (injected from package.json at build), ROUTE, NS, UA, TRAILER |
| `builtin.js` | BUILTIN_UPSTREAMS, TUTORIALS, KNOWN_BASE (static catalog seed) |
| `utils.js` | emsg, mkFail error helpers |
| `config-schema.js` | sanitizeConfig + field pickers (config shape contract) |
| `catalog-parse.js` | catalog JSON / models.dev api.json parsing |
| `context.js` | apply(ctx) entry: service bindings + shared mutable state (Maps, config, takeover flags) |
| `registry.js` | config persistence (JSON file, atomic write, hot reload) + effective upstream registry + free-model predicate |
| `keys.js` | multi-key ring: rotation, per-key cooldown, failure notes |
| `probe.js` | GET /models probing (catalog-as-truth refresh) |
| `models.js` | model registry: merge/alias index/defaults/reprobe scheduling |
| `health.js` | stats + health records, upstream cooldown, readiness |
| `transport.js` | curl spawn, dsh<->OpenAI serialization, SSE translator |
| `router.js` | the adapter core: per-key attempt, candidates, transparent failover |
| `http.js` | rawGet + remote catalog sync |
| `takeover.js` | default-model auto takeover |
| `state.js` | buildState (panel/model-picker data contract) |
| `rpc.js` | freeroute.* RPC handlers |
| `commands.js` | /freeproxy text status command |
| `endpoint.js` | local OpenAI-compatible /freeroute/v1 endpoint |
| `boot.js` | config boot, adapter/RPC/commands/web registration, timers |

## client/ layers

| Fragment | Layer |
|---|---|
| `styles.js` | scoped CSS |
| `context.js` | module-level ctxRef handoff (dynamic sandbox only; stripped in static build) |
| `panel-state.js` | Section(): hooks, polling, act()/setDraft helpers, shape guard |
| `panel-header.js` | header card: endpoint/default/stats + integration hint |
| `panel-upstreams.js` | upstream cards: enable/priority/key field (masked <-> editable ring)/actions/health |
| `panel-advanced.js` | advanced settings card: remote catalog JSON form + example |
| `panel-models.js` | free-model list card + advanced fold + Section return |
| `models-page.js` | ModelsSectionWithFreeRoute: reversible wrap of the built-in models settings page (默认/免费 tabs) |
| `integration.js` | settings.slot wrapping/unwrapping lifecycle |
| `plugin.js` | client plugin tail (inject/apply) |

## Build pipeline

```
src/** --(build-dynamic.mjs: concat + version inject + compile check)--> freeroute-dynamic/*.js
       --(build-static*.mjs: RPC->Typert Remote, node fs/os injection)--> lib/*
```

`npm run build:static` runs both stages. After editing anything under `src/`,
rebuild and commit the regenerated `freeroute-dynamic/` + `lib/` together.
