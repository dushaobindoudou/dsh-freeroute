# Contributing to dsh-freeroute

Thanks for your interest in improving `dsh-freeroute`! This document covers the
basics: development setup, code style, testing, and how a release happens.

## Project scope

`dsh-freeroute` is a **zero-runtime-dependency** dsh plugin that routes agent
traffic to OpenRouter's legitimate free tier:

- Host entry `lib/index.js`: catalog discovery + explainable ranking, the
  `/free` command family, the `agent/request` takeover waterfall, and the
  `agent/request-error` rotation watcher.
- Client entry `lib/client.js`: the optional "Free Models" web settings
  section (needs integration into the dsh-web-frontend bundle to appear).
- It only uses public dsh service seams (`agentDefaultModel`, `commands`,
  `llm`, the agent events). Keep it dependency-free and degrade gracefully
  when a service is missing.

Before proposing a feature, please open an issue first so we can decide
whether it belongs here or upstream in dsh.

## Development setup

```bash
git clone https://github.com/dushaobindoudou/dsh-freeroute.git
cd dsh-freeroute
npm install
```

Requirements: Node.js ≥ 18, npm ≥ 9.

For live development against a real dsh install, mount the checkout with a
`link:` entry in your dsh profile (see the README), and restart `dsh web`
after host-side changes. `free-models-preview.html` mirrors the web panel
standalone: serve the repo root over HTTP (`python3 -m http.server 8099`)
and open it - the page imports the real ranking from `lib/index.js`.

## Testing and linting

```bash
npm run lint      # ESLint over lib/ and smoke-host.mjs
npm run lint:fix  # auto-fix what ESLint can
npm test          # hermetic smoke suite (no dsh install required)
```

The smoke suite fakes every host seam the plugin touches (commands,
agentDefaultModel, llm.stream, the agent/request and agent/request-error
waterfalls) and covers takeover, free guard, cooldowns, retry budget, and
degradation. **Every PR must keep `npm run lint` and `npm test` green.**

When touching host integration, re-verify the exact dsh seams against the
installed dsh source (`@deepseek-ai/dsh` under `node_modules`) - the
waterfall payloads and service methods documented in `lib/index.js`'s
header comment were verified there.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/) one-liners:

```
feat: add /free test probe command
fix: honor provider Retry-After in cooldowns
docs: explain takeover mode in README
chore: bump ESLint to 10.x
```

## Changelog policy

User-visible changes go into [`CHANGELOG.md`](CHANGELOG.md) under `Unreleased`,
following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Do not edit
released sections. The project follows [Semantic Versioning](https://semver.org/);
as a rule of thumb:

- `PATCH` - bug fixes, docs, tooling
- `MINOR` - new commands/panel capabilities, backward-compatible changes
- `MAJOR` - breaking changes to the public surface or peer requirements

## Releases

1. Move the `Unreleased` changelog entries into a new version section, dated.
2. Bump `version` in `package.json`.
3. Commit as `release: X.Y.Z - <summary>`, tag `vX.Y.Z`, and push the tag.
4. The [`publish.yml`](.github/workflows/publish.yml) workflow runs the tests,
   publishes to npm with provenance, and creates the GitHub Release with the
   changelog notes. Releases are never published from a laptop.

## Reporting bugs and security issues

See [`SECURITY.md`](SECURITY.md) for security issues; use the issue templates
for everything else.
