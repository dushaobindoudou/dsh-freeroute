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
   failures after output surface to the caller. Keys rotate individually on
   AUTH / rate-limit, and a per-key failure is surfaced in the panel.
4. **Three-layer config** — builtin catalog → remote catalog (JSON hosted on
   Cloudflare Pages/R2 for ship-free updates; native format or models.dev
   `api.json`, zero-cost models auto-filtered) → user patch persisted under
   the `free-proxy` settings namespace.
5. **Local endpoint** — `/freeroute/v1/chat/completions` +
   `/freeroute/v1/models` let any OpenAI client ride the same free pool.

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

There is no sibling freeroute item in the settings nav (a standalone section
appears only if the host ships no wrappable models entry). The `/freeproxy`
command prints a text status.

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
  the SAME physical copy the dsh host uses. A private pnpm copy makes the
  Typert Remote marker class differ from the host's, so `/api/freeroute/*`
  never registers (client sees `HTTP 404`). `postinstall` runs
  `scripts/link-host-typert.mjs`, which symlinks the workspace package onto
  the global dsh install's copy (same fix as dsh-refine). If you ever see
  `transport failure for /api/freeroute/state: HTTP 404` after an install,
  run `node scripts/link-host-typert.mjs` and restart `dsh web`.

## Honest limits

This plugin aggregates **free tiers you register yourself**. If you need
multi-tenant billing or channel management, run uni-api, new-api, or LiteLLM
yourself and mount it as a custom upstream here — the two complement each
other instead of reinventing.

## License

[MIT](LICENSE) © dushaobindoudou
