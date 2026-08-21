# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-08-21

### Added

- `/free` command: `status` / `list` / `use <id>` / `rotate` / `reset`.
- Live OpenRouter free-model discovery (public `/api/v1/models` endpoint,
  `:free` ids only, 1h cache, sorted by context length).
- Free-first default: `use`/`rotate` rewrite the `agent-default-model`
  settings user layer via `settings.merge`.
- Rate-limit watcher on `agent/request-error`: marks the active free model
  exhausted on 429-class failures and rotates the default (turn/session
  boundary granularity — the dsh loop does not support mid-request provider
  switching).
- Zero runtime dependencies; missing host services degrade to guidance.

[0.1.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.1.0
