# dsh-freeroute

**English** | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/dsh-freeroute.svg?style=flat-square)](https://www.npmjs.com/package/dsh-freeroute)
[![License](https://img.shields.io/npm/l/dsh-freeroute.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/dushaobindoudou/dsh-freeroute/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/dushaobindoudou/dsh-freeroute/actions/workflows/ci.yml)

Free-tier model routing for the
[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (dsh):
discover [OpenRouter](https://openrouter.ai) free models (`:free` catalog,
fetched live), rank them with an explainable score, take over every model
request with the best free model, and rotate to the next one **inside the
failing step** when rate limits hit. Your paid configuration is never
touched unless you ask for it.

> Free here means **providers' legitimate free tiers**. This plugin does not
> bypass paid APIs.

## How it works

- `/free status` - takeover state, current best, catalog freshness,
  cooling models, rotation stats
- `/free list [n]` - ranked free models with score + explain flags
- `/free use <id>` - persist a free model as the agent default (new
  turns/sessions)
- `/free rotate` - jump to the best non-cooling free model (persisted)
- `/free on [id]` - **takeover mode**: rewrite every model request to the
  best free model (runtime only; `/free off` restores)
- `/free off` - stop takeover
- `/free test [n]` - live-probe the top-N models (1 tiny request each)
- `/free refresh` / `/free reset` - force catalog reload / clear cooldowns

### Mid-step rotation

When a free model hits `RATE_LIMIT` / `QUOTA` / HTTP 429 / 402, the plugin
marks it exhausted with a cooldown (default 10 min, provider `Retry-After`
honored) and returns a retry decision to the agent loop. The retried request
re-enters the `agent/request` waterfall and lands on the next best free
model - the failing step recovers on its own, no user-visible error. A
per-turn retry budget (default 3) stops the rotation from spinning when the
whole catalog is throttled.

Even without takeover, a free model you selected explicitly self-heals the
same way (free guard).

### Ranking

Models are filtered (chat-capable, tool-capable, not expired, not
safety/moderation classifiers) and scored by context length, output-token
cap, freshness, active-parameter size, and family reputation. `/free list`
shows the score and the flags behind it.

## Install

Mount in your dsh profile (e.g. `~/.dsh/profiles/web/cordis.yml`):

```yaml
plugins:
  - dsh-freeroute
```

Optional config:

```yaml
plugins:
  - id: dsh-freeroute
    config:
      takeover: false        # start with takeover enabled
      autoRotate: true       # free guard: heal throttled free models
      cooldownMinutes: 10    # exhaustion cooldown
      maxStepRetries: 3      # rotation retries per turn
      minContext: 8000       # hard floor on context length
      exclude: []            # substring blocklist for model ids
```

Requirements: Node.js ≥ 18, a configured OpenRouter provider key in dsh
(the catalog itself is fetched from the public endpoint without a key).

### Web panel (optional)

`lib/client.js` registers a "Free Models" settings section in `dsh web`
with the same ranking and one-click default. dsh's web frontend ships
pre-built, so surfacing the panel requires adding this package to the
dsh-web-frontend client bundle and rebuilding it.
`free-models-preview.html` mirrors the panel standalone (serve the repo
root over HTTP and open it) for iteration without that rebuild.

## License

[MIT](LICENSE) © dushaobindoudou
