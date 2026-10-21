# Soren Universal Skill Router

An extension of the existing Next.js/Vercel MCP service, with a one-shot six-client installer, private skill reviews, durable operations, health monitoring, controlled releases, and an operations dashboard.

**Status:** local implementation verified on Windows and in Ubuntu CI. The [acceptance ledger](docs/acceptance-matrix.csv) records 41 verified requirements and 24 blocked gates. Hosted private identity, production activation, real client invocation, external scheduled delivery, and release signing require their own evidence. Default updater mode is **observe**. Publishing this source does not deploy it or arm updates.

## Start locally

Use Node.js 22.9 or newer and the committed lockfile:

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run start
```

Public bundled skills and local routing work without cloud credentials. External federation requires the shared quota store; private operations fail closed without their configured identity and database. Copy the blank names in [.env.example](.env.example) only when configuring an approved environment. Do not commit credentials or user profiles.

## Project guide

- [Architecture and source map](docs/project-map.md)
- [Verified source admission](docs/work-admission.md)
- [Installer and safe removal](docs/installer.md)
- [Offline installer archive](artifacts/installer/soren-agents-installer-1.0.0.tgz) and [unsigned integrity manifest](artifacts/installer/soren-agents-installer-1.0.0.tgz.manifest.json)
- [Private operations and authorization](docs/operations-implementation.md)
- [Read-only activation preflight](docs/activation-preflight.md) and [release-gate progress](docs/release-gates-progress-20261020.md)
- [Update policy](docs/update-policy.md) and [rollback](docs/rollback.md)
- [Current verification results](docs/verification-results.md)
- [Current 65-requirement acceptance ledger](docs/acceptance-matrix.csv)
- [Original handoff index](docs/handoff-index.md) and [complete implementation specification](docs/implementation/00_START_HERE.md)

The original 25-file handoff remains unchanged under `docs/implementation/`. Verify its 24 manifest-listed payload files with `python docs/implementation/verify_package.py`. Its initial NOT_RUN matrix is preserved as source material; current execution evidence lives under `docs/`.

## Public MCP contract

```text
Endpoint: https://soren-shared-mcp-skills.vercel.app/api/mcp
Alias: soren-skills
MCP identity: soren-universal-skill-router
MCP contract: 2.2.0
Package: 1.0.0
```

The eight tool names and four bundled skill resources remain stable. Public tools are read-only. Curated instructions are optional reference material; external candidates require exact-version review. Router advice never overrides the host agent's permissions or project instructions.

Open Discover at `/`, client guidance at `/connect`, approved skills at `/registry`, and private management at `/reviews`, `/health`, `/updates`, or `/manage`. Configuration, protocol connection, native invocation, fresh health, and approved execution authority are distinct states.

## Verification and installer commands

```sh
npm run typecheck
npm run test:contracts
npm run test:installer
npm run test:security
npm run test:operations
npm run test:updates
npm run test:db
npm run test:routing
npm run test:browser
npm run agents:inspect
npm run activation:preflight
npm run package:installer
npm run evaluate:routing
```

Browser tests use an isolated Chromium profile; install the matching Playwright Chromium or set `PLAYWRIGHT_CHANNEL=chrome` for an installed Chrome. Successful private UI fixtures are labeled fixtures and do not establish live OAuth or owner approval.

The activation preflight is configuration-only and exits `2` while live activation gates remain; it neither activates services nor returns secrets.

The installer runs explicitly and exits. It refuses unsupported versions, duplicates, changed preimages, unsafe paths, and edited owned sections. No resident Windows service, startup entry, or local update scheduler is created. The local installer tarball is unsigned and must not be advertised as an authenticated release.

## Release boundary

Cloud workflows remain owner-gated. Production-intended staging, signed artifact/evidence identity, expiring owner authorization, database fences, current revocations, independent watcher evidence, and post-release observation are required. Unknown network outcomes reconcile before retry. Vercel's unproven atomic parent compare-and-swap blocks unattended promotion; manual exact-artifact owner authorization is separate.

No production or signing secrets belong in public MCP responses, browser bundles, pull-request jobs, or this repository. Actual dependency-audit findings and unverified entitlements remain release blockers, not passing checks.
