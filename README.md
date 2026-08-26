# dsh-freeroute

**English** | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/dsh-freeroute.svg?style=flat-square)](https://www.npmjs.com/package/dsh-freeroute)
[![License](https://img.shields.io/npm/l/dsh-freeroute.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/0xrushmoon/dsh-freeroute/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/0xrushmoon/dsh-freeroute/actions/workflows/ci.yml)

Free-tier model aggregation for the
[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (dsh):
registers a `freeroute` model provider backed by a pool of free-quota
upstreams (OpenCode Zen / B.AI / OpenRouter / SenseNova built in, plus remote
catalogs and custom gateways; other vendors join via the remote catalog).
Configure any one API key and you are running; when an upstream rate-limits,
dies, or loses its key, requests fail over to the next one **before the first
token reaches your session**. A local OpenAI-compatible endpoint is included.

> Free here means **providers' legitimate free tiers**, with keys you register
> yourself. This is not a shared-account pool and does not bypass paid APIs.

## Key management

- **Multi-key rotation** — free quotas are per-account, so each upstream
  accepts up to 8 keys (separated by newlines/commas in the field, or
  `KEY_2`…`KEY_8` env vars). AUTH / rate-limit failures cool down that single
  key and rotate to the next one before any upstream is penalized; successes
  advance the cursor so free quota spreads evenly across accounts.
- **Privacy by default** — the key field shows a read-only `••••••` mask until
  you click **显示** (show), which opens the editor prefilled with the full key
  ring (one key per line) ready to edit; saving returns straight to the masked
  state. Keys live only in the credentials service, never in plaintext config.
- **Failure visibility** — when a key is detected as dead mid-rotation, the
  panel warns **「第 N 把 Key 失效」** (which key failed and why), so a dying
  account is obvious without digging through logs.

## How it works

1. **Adapter registration** — `llm.registerAdapter(['freeroute'], adapter)`
   exposes `freeroute/auto` (automatic failover) and
   `freeroute/<upstream>/<model>` (pinned model) in the model picker.
2. **Translation** — dsh internal messages ⇄ OpenAI Chat Completions SSE, with
   reasoning, tool_calls, and usage passed through. Keys live only in the
   credentials service, never in plaintext config.
3. **Health & failover** — failures cool down by class (auth/config 10 min,
   rate limit 60 s, others exponential backoff capped at 10 min). `auto`
   picks the highest-priority enabled, keyed, non-cooling upstream; failures
   before any output switch to the next candidate (empty responses included),
   failures after output surface to the caller. A **pinned single model**
   degrades to the `auto` chain when all of its providers fail (or sit in
   cooldown) instead of aborting the turn — picking one model is a
   preference, not exclusivity. Keys rotate individually on
   AUTH / rate-limit, and a per-key failure is surfaced in the panel.
4. **Three-layer config** — builtin catalog → remote catalog (JSON hosted on
   Cloudflare Pages/R2 for ship-free updates; native format or models.dev
   `api.json`, zero-cost models auto-filtered) → user patch persisted under
   the `free-proxy` settings namespace.
5. **Local endpoint** — `http://127.0.0.1:<port>/freeroute/v1` is an
6. **Global proxy (off by default)**: set one `http://127.0.0.1:7890`-style
   proxy under `Settings → Models → Free → Advanced`; every upstream without
   its own proxy (chat requests and model probing) goes through it. Per-upstream
   `custom.proxy` and catalog-declared `proxy` win over the global one; catalog
   sync always connects directly. One entry covers Clash/v2ray users — no
   per-upstream configuration needed.
   OpenAI-compatible base URL (chat/completions with streaming, tools and
   usage; models; health). No API key required, CORS enabled — any other
   agent or client (CLI or browser) can ride the same free pool.

## Settings panel

dsh's built-in Settings -> 模型 (models) page is reversibly wrapped: the
title and intro stay in place, and a **默认 | 免费** tab bar sits right below
the intro (structure mirrors the Settings -> 插件 page: underline tabs, ARIA
roles, arrow-key navigation, visited panels stay mounted):

- **默认** keeps the stock model settings untouched;
- **免费** hosts the full freeroute panel: per-upstream cards (enable /
  priority / signup tutorial / key save / connectivity test / health & stats),
  a one-click integration wizard, remote-catalog configuration, and a
  custom-upstream form (works with local uni-api / new-api / LiteLLM gateways).
  Non-standard gateways are supported in the config file via `custom.chatPath`
  (override `/chat/completions`) and `custom.requestExtra` (extra scalar body
  fields; `model: null` omits the model field — e.g. GMI's `/autoroute`).

There is no sibling freeroute item in the settings nav (a standalone section
appears only if the host ships no wrappable models entry). The `/freeproxy`
command prints a text status.

## Let other agents / tools use the pool (always auto)

While `dsh web` runs, the plugin serves an **OpenAI-compatible endpoint** on the
same port — any agent or tool that accepts a custom base URL can reuse the free
pool:

- **Base URL**: `http://127.0.0.1:<dsh web port>/freeroute/v1`
  (default port 3080; the Free panel footer shows the exact URL)
- **API key**: none needed (loopback only). Tools that demand a non-empty key
  accept a placeholder like `sk-freeroute`
- **Model**: set `auto`, or **omit it entirely** (auto is the default) — picks
  enabled free upstreams by priority, fails over across the whole chain on
  errors / rate limits / pre-first-token drops, and degrades single-model
  requests to chain fallback automatically
- **Capabilities**: `stream`, `tools` (function calling), `stop`,
  `temperature`, `max_tokens` pass through; CORS is open for browser extensions
- **Health**: `GET /freeroute/health`; **model list**:
  `GET /freeroute/v1/models` (`auto` is the first entry)

Minimal curl (no model field = auto):

```sh
curl http://127.0.0.1:3080/freeroute/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

Notes: the endpoint lives as long as the `dsh web` process (same machine);
configure at least one upstream key in the Free panel so the auto chain has a
usable node.

## Install

```sh
dsh plugin --profile web add dsh-freeroute
```

Requirements: Node.js ≥ 18; the host provides `llm` / `timer`; `settings` /
`credentials` / `subprocess` / `webServer` / `commands` / `agentDefaultModel`
are optional and degrade gracefully when absent.

## Development

Layered sources (see `src/README.md`):

- `src/` is the single hand-edited authority, split into `src/host/` (20
  fragments: constants → catalog parse → context/state → keys/probe/models/
  health → transport/router/http → takeover/rpc/commands/endpoint/boot) and
  `src/client/` (10 fragments: styles/context → panel state/header/upstreams/
  advanced/models → models page/integration/plugin tail).
- `npm run build:dynamic` assembles `src/**` into `freeroute-dynamic/
  {host,client}.js` (single-function-body form for the dynamic plugin loader,
  with the version injected from package.json).
- `freeroute-dynamic/` carries a 137-assertion integration suite:
  `node freeroute-dynamic/test/integration.mjs`.
- `npm run build:static` mechanically generates `lib/` from those assembled
  sources (the dynamic RPC layer is swapped for a Typert Remote + Connection
  carrier) — never hand-edit just one side; `npm run build:static` runs both.
- `npm run lint && npm test` — lint plus a smoke test on a real cordis root.
- **Module-instance rule**: `@deepseek-ai/dsh-typert-protocol` must resolve to
  the SAME physical copy the dsh host uses. The host gateway reads Remote
  method markers from a WeakMap private to ITS copy of the module; a private
  pnpm copy in the plugin workspace registers into a different WeakMap, so
  `/api/freeroute/*` silently registers zero routes (client sees `HTTP 404`,
  no error anywhere). Since v0.7.3 `lib/index.js` resolves the host's own copy
  at load time (running dsh CLI entry → global npm layout → fallback), so no
  postinstall, symlink, or host version is required. If you ever see
  `transport failure for /api/freeroute/state: HTTP 404` on an older version,
  upgrading to ≥0.7.3 fixes it permanently.

## Honest limits

This plugin aggregates **free tiers you register yourself**. If you need
multi-tenant billing or channel management, run uni-api, new-api, or LiteLLM
yourself and mount it as a custom upstream here — the two complement each
other instead of reinventing.

## License

[MIT](LICENSE) © dushaobindoudou
