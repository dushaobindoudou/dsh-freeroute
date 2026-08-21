# dsh-freeroute

**English** | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/dsh-freeroute.svg?style=flat-square)](https://www.npmjs.com/package/dsh-freeroute)
[![License](https://img.shields.io/npm/l/dsh-freeroute.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/dushaobindoudou/dsh-freeroute/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/dushaobindoudou/dsh-freeroute/actions/workflows/ci.yml)

Free-tier model routing for the
[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (dsh):
discover [OpenRouter](https://openrouter.ai) free models (`:free` catalog,
fetched live), apply the best free model as the agent default, and
auto-rotate to the next free model when the current one hits rate limits.
Your paid configuration is never touched unless you ask for it.

> Free here means **providers' legitimate free tiers**. This plugin does not
> bypass paid APIs.

## How it works

- `/free status` — current default, catalog size, exhausted marks, rotation mode
- `/free list` — live OpenRouter `:free` models, sorted by context length
- `/free use <id>` — set the agent default model (new turns/sessions)
- `/free rotate` — jump to the best non-exhausted free model
- `/free reset` — clear exhausted marks

On `agent/request-error` with a rate-limit code while a free model is active,
the model is marked exhausted and the default rotates for future turns —
mid-request provider switching is not supported by the dsh loop, so rotation
lands at the next turn/session boundary.

## Install

Mount in your dsh profile (e.g. `~/.dsh/profiles/web/cordis.yml`):

```yaml
plugins:
  - dsh-freeroute
```

Requirements: Node.js ≥ 18, a configured OpenRouter provider key in dsh
(the catalog itself is fetched from the public endpoint without a key).

## License

[MIT](LICENSE) © dushaobindoudou
