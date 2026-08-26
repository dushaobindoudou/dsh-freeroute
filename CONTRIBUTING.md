# Contributing to dsh-freeroute

Thanks for your interest in improving `dsh-freeroute`! This document covers the
basics: development setup, code style, testing, and how a release happens.

## Project scope

`dsh-freeroute` is deliberately a **thin UX layer** over the
[`dsh-continual-harness`](https://github.com/jasen215/dsh-continual-harness)
engine:

- It provides the `/refine` human command and the settings panel (browse, history
  timeline, rollback, auto-gate audit).
- It has **zero code dependency** on the engine and **zero runtime
  dependencies** — it reads the engine's state files and dispatches the engine's
  registered tool. Keep it that way; heavier logic belongs in the engine.

Before proposing a feature, please open an issue first so we can decide whether
it belongs here or upstream in the engine.

## Development setup

```bash
git clone https://github.com/0xrushmoon/dsh-freeroute.git
cd dsh-freeroute
npm install
```

Requirements: Node.js ≥ 18, npm ≥ 9.

For live development against a real dsh install, mount the checkout with a
`link:` entry in your dsh profile (see the README), and restart `dsh web` after
host-side changes.

## Testing and linting

```bash
npm run lint      # ESLint over lib/ and smoke-host.mjs
npm run lint:fix  # auto-fix what ESLint can
npm test          # hermetic smoke suite (no engine required)
```

The smoke suite mirrors the real seams the plugin touches (engine ESP files,
`tools.execute` signal contract, reader compat). If `dsh` is on `PATH`, it also
exercises host registration against your real install; otherwise those
assertions are skipped. **Every PR must keep `npm run lint` and `npm test`
green.**

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/) one-liners:

```
feat: add /refine prune command
fix: always pass an AbortSignal to tools.execute
docs: explain peer-dep pinning in README
chore: bump ESLint to 9.x
```

## Changelog policy

User-visible changes go into [`CHANGELOG.md`](CHANGELOG.md) under `Unreleased`,
following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Do not edit
released sections. The project follows [Semantic Versioning](https://semver.org/);
as a rule of thumb:

- `PATCH` — bug fixes, docs, tooling
- `MINOR` — new commands/panel capabilities, backward-compatible changes
- `MAJOR` — breaking changes to the public surface or peer requirements

## Releases

1. Move the `Unreleased` changelog entries into a new version section, dated.
2. Bump `version` in `package.json`.
3. Commit as `release: X.Y.Z — <summary>`, tag `vX.Y.Z`, and push the tag.
4. The [`publish.yml`](.github/workflows/publish.yml) workflow runs the tests,
   publishes to npm with provenance, and creates the GitHub Release with the
   changelog notes. Releases are never published from a laptop.

## Reporting bugs and security issues

See [`SECURITY.md`](SECURITY.md) for security issues; use the issue templates
for everything else.
