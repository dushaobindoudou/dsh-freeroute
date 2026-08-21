# Security Policy

## Supported versions

Only the latest release line receives security fixes.

| Version | Supported |
| ------- | --------- |
| >= 1.0.x | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Use [GitHub's private vulnerability reporting](https://github.com/dushaobindoudou/dsh-freeroute/security/advisories/new)
instead (the "Report a vulnerability" button under this repository's
*Security* tab). Please include:

- a description of the issue and its impact,
- steps or a proof of concept to reproduce it,
- affected versions (`dsh-freeroute`, dsh, Node.js).

You should receive a response within 72 hours. If the issue is confirmed, we
will patch it, cut a release, and credit you in the changelog unless you prefer
to stay anonymous.

## Scope notes

`dsh-freeroute` itself is a thin UX layer: it reads JSON state files under the dsh
home directory and dispatches a tool registered by the
`dsh-continual-harness` engine. Reports about the dsh host itself belong
upstream; reports about the engine belong in its repository — cross-references
are welcome once the root cause is identified.
