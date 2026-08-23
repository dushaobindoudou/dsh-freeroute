# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-08-24

### Added

- Takeover mode `/free on [id]` / `/free off`: an `agent/request` waterfall
  listener rewrites every model request to the best free model - runtime
  only, the persisted (paid) default is never touched.
- Mid-step rotation: on `RATE_LIMIT` / `QUOTA` / HTTP 429 / 402 failures the
  free model enters a cooldown and the watcher returns `{ kind: 'retry' }`;
  the retried request re-enters `agent/request` and lands on the next best
  free model inside the failing step (the dsh loop re-enters the waterfall
  on every retry).
- Free guard: even without takeover, an explicitly-selected free model that
  hits its limit self-heals on the next attempt.
- Explainable ranking: score from context length, output-token cap,
  freshness, active-parameter size (parsed from MoE ids / descriptions),
  and family reputation; `/free list` shows score + flag tokens.
- Catalog hard filters: non-chat classifiers (content-safety/guard/
  moderation), tool-less models, expired models, sub-floor context,
  user `exclude` substrings.
- Cooldown-based health: exhaustion expires after 10 minutes by default
  (configurable), provider `Retry-After` honored (clamped to 1 min - 24 h);
  `/free reset` clears manually.
- Per-turn rotation retry budget (`maxStepRetries`, default 3), reset when
  the agent goes idle, so a fully-throttled catalog surfaces the error
  instead of spinning.
- `/free refresh` (force catalog reload) and `/free test [n]` (live probe
  of the top-N models through `llm.stream`, maxTokens 16; probe rate-limits
  enter cooldown).
- Config surface: `takeover`, `autoRotate`, `cooldownMinutes`,
  `maxStepRetries`, `minContext`, `exclude`.
- Web client panel `lib/client.js`: "Free Models" settings section via the
  `settings.section` slot, same ranking as the host, one-click default via
  `api.settings.mutate` (requires integration into the dsh-web-frontend
  bundle; `free-models-preview.html` mirrors it standalone).
- Shared `rankFreeModels` export consumed by host, client, and preview.

### Fixed

- Default-model writes now use the supported `agentDefaultModel`
  `currentSelection()` / `saveSelection()` seam (0.1.0 called a
  non-existent `settings.merge` / `.source()` against current dsh).
- OpenRouter `created` timestamps are unix seconds - now converted to ms
  before freshness scoring.
- `/free list` no longer ranks non-chat models first (0.1.0 sorted by raw
  context length, which surfaced a 1M-context safety classifier on top).

## [0.1.0] - 2026-08-21

### Added

- `/free` command: `status` / `list` / `use <id>` / `rotate` / `reset`.
- Live OpenRouter free-model discovery (public `/api/v1/models` endpoint,
  `:free` ids only, 1h cache, sorted by context length).
- Free-first default: `use`/`rotate` rewrite the `agent-default-model`
  settings user layer.
- Rate-limit watcher on `agent/request-error`: marks the active free model
  exhausted on 429-class failures and rotates the default.
- Zero runtime dependencies; missing host services degrade to guidance.

[0.2.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.2.0
[0.1.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.1.0
