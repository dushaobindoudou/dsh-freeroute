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

- `src/host/00-40` are top-level; `50-99` live **inside `apply(ctx)`** (hence
  their 4-space indent) and are spliced between the plugin wrapper's lines.
- `src/client/00-05` are top-level; `10-50` live **inside `Section()`**
  (2-space indent); `60-80` are top-level again.

Fragment order is declared in `scripts/build-dynamic.mjs`. Function
declarations hoist inside the shared scope, so layers may call each other
freely; `const`/`let` bindings keep their textual order (all state is declared
in `50-context.js` or at first use before any side effect runs).

## host/ layers (bottom-up)

| Fragment | Layer |
|---|---|
| `00-constants.js` | VERSION (injected from package.json at build), ROUTE, NS, UA, TRAILER |
| `10-builtin.js` | BUILTIN_UPSTREAMS, TUTORIALS, KNOWN_BASE (static catalog seed) |
| `20-utils.js` | emsg, mkFail error helpers |
| `30-config-schema.js` | sanitizeConfig + field pickers (config shape contract) |
| `40-catalog-parse.js` | catalog JSON / models.dev api.json parsing |
| `50-context.js` | apply(ctx) entry: service bindings + shared mutable state (Maps, config, takeover flags) |
| `55-registry.js` | config persistence (JSON file, atomic write, hot reload) + effective upstream registry + free-model predicate |
| `60-keys.js` | multi-key ring: rotation, per-key cooldown, failure notes |
| `65-probe.js` | GET /models probing (catalog-as-truth refresh) |
| `70-models.js` | model registry: merge/alias index/defaults/reprobe scheduling |
| `75-health.js` | stats + health records, upstream cooldown, readiness |
| `80-transport.js` | curl spawn, dsh<->OpenAI serialization, SSE translator |
| `85-router.js` | the adapter core: per-key attempt, candidates, transparent failover |
| `88-http.js` | rawGet + remote catalog sync |
| `90-takeover.js` | default-model auto takeover |
| `92-state.js` | buildState (panel/model-picker data contract) |
| `94-rpc.js` | freeroute.* RPC handlers |
| `96-commands.js` | /freeproxy text status command |
| `97-endpoint.js` | local OpenAI-compatible /freeroute/v1 endpoint |
| `99-boot.js` | config boot, adapter/RPC/commands/web registration, timers |

## client/ layers

| Fragment | Layer |
|---|---|
| `00-styles.js` | scoped CSS |
| `05-context.js` | module-level ctxRef handoff (dynamic sandbox only; stripped in static build) |
| `10-panel-state.js` | Section(): hooks, polling, act()/setDraft helpers, shape guard |
| `20-panel-header.js` | header card: endpoint/default/stats + integration hint |
| `30-panel-upstreams.js` | upstream cards: enable/priority/key field (masked <-> editable ring)/actions/health |
| `40-panel-advanced.js` | advanced settings card: remote catalog JSON form + example |
| `50-panel-models.js` | free-model list card + advanced fold + Section return |
| `60-models-page.js` | ModelsSectionWithFreeRoute: reversible wrap of the built-in models settings page (默认/免费 tabs) |
| `70-integration.js` | settings.slot wrapping/unwrapping lifecycle |
| `80-plugin.js` | client plugin tail (inject/apply) |

## Build pipeline

```
src/** --(build-dynamic.mjs: concat + version inject + compile check)--> freeroute-dynamic/*.js
       --(build-static*.mjs: RPC->Typert Remote, node fs/os injection)--> lib/*
```

`npm run build:static` runs both stages. After editing anything under `src/`,
rebuild and commit the regenerated `freeroute-dynamic/` + `lib/` together.
