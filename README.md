# Soren MCP — Full Implementation & Execution Plan

This repository contains the complete **Soren Universal Skill Router** implementation specification and Work handoff prepared on **October 19, 2026**.

> **Status: planning and handoff materials, not a newly implemented application.** The package does not include the existing application's source code. Publishing these documents does not install software, start Work, schedule health checks, deploy the service, or arm automatic updates. All 65 implementation acceptance requirements remain `NOT_RUN` until evidence is produced during execution.

## Start here

1. Read [the Work start instructions](docs/implementation/00_START_HERE.md).
2. Inspect [the baseline and evidence](docs/implementation/01_BASELINE_AND_EVIDENCE.md), then read [the complete system specification](docs/implementation/02_SYSTEM_SPEC.md).
3. Follow [the full implementation and execution plan](docs/implementation/10_IMPLEMENTATION_PLAN.md) in milestone order, M0 through M9.
4. Track completion using [the 65-requirement acceptance matrix](docs/implementation/acceptance/acceptance-matrix.csv), without treating historical test results as current verification.

## Complete plan

| Document | Purpose |
| --- | --- |
| [00 — Start here](docs/implementation/00_START_HERE.md) | Work handoff, scope, invariants, read order, and completion records |
| [01 — Baseline and evidence](docs/implementation/01_BASELINE_AND_EVIDENCE.md) | Observed source metadata, historical audit results, and outstanding verification boundaries |
| [02 — System specification](docs/implementation/02_SYSTEM_SPEC.md) | Installation, verification, maintenance, updater, and public/private operating model |
| [03 — Architecture and data](docs/implementation/03_ARCHITECTURE_AND_DATA.md) | Component ownership, durable state, interfaces, identities, and authorization boundaries |
| [04 — Installation and clients](docs/implementation/04_INSTALLATION_AND_CLIENTS.md) | Six version-aware client adapters, one-shot setup, safe removal, and connection verification |
| [05 — Verification and acceptance](docs/implementation/05_VERIFICATION_AND_ACCEPTANCE.md) | Required behavioral, integration, security, browser, and native-client tests |
| [06 — Health maintainer](docs/implementation/06_HEALTH_MAINTAINER.md) | Cloud probes, scheduling, incident handling, safe remediation, and independent observation |
| [07 — Controlled auto-updater](docs/implementation/07_CONTROLLED_AUTO_UPDATER.md) | Update lanes, owner policy, artifact verification, promotion, probation, and rollback |
| [08 — Security and permissions](docs/implementation/08_SECURITY_AND_PERMISSIONS.md) | Identity, least privilege, privacy, approval, and supply-chain controls |
| [09 — Deployment and operations](docs/implementation/09_DEPLOYMENT_AND_OPERATIONS.md) | Reproducible delivery, exact-artifact release, recovery, and operational ownership |
| [10 — Implementation plan](docs/implementation/10_IMPLEMENTATION_PLAN.md) | Ordered milestones M0–M9, file responsibilities, tests, and exit gates |
| [11 — Dashboard and agent UX](docs/implementation/11_DASHBOARD_AND_AGENT_UX.md) | Connection, review, library, health, and update navigation |
| [12 — Primary sources](docs/implementation/12_PRIMARY_SOURCES.md) | The original handoff's reference documentation and caveats |
| [13 — Runbooks](docs/implementation/13_RUNBOOKS.md) | Operator scenarios and bounded responses |

## Machine-readable handoff

- [Operating policy](docs/implementation/config/operating-policy.json): initial **observe** mode and bounded operational defaults.
- [Contract schemas](docs/implementation/contracts/): installation plan, health observation, release manifest, and verification evidence.
- [Acceptance matrix](docs/implementation/acceptance/acceptance-matrix.csv): 65 requirements, each initially `NOT_RUN`.
- [Source baseline](docs/implementation/evidence/source-baseline.json): source location, selected file hashes, dependency versions, and deployment identifiers recorded during preparation.
- [Verification template](docs/implementation/evidence/verification-template.json): evidence structure for implementation work.
- [Package manifest](docs/implementation/PACKAGE_MANIFEST.json) and [package checks](docs/implementation/PACKAGE_CHECKS.md): original handoff integrity and preparation results.

All **25 files** under `docs/implementation/` are the original extracted handoff package. Its source content, terminology, status labels, and relative directory structure are preserved.

## Verify package integrity

From a checkout, with Python 3.9 or newer:

```bash
python docs/implementation/verify_package.py
```

This checks the 24 payload files listed in the included manifest. It establishes consistency with that manifest, **not** author authentication, signed-release provenance, application correctness, or successful installation.

## Deployment boundary

The existing public connection to preserve is:

```text
Alias: soren-skills
Endpoint: https://soren-shared-mcp-skills.vercel.app/api/mcp
```

The plan calls for a read-only public MCP, separately authenticated management operations, an installer that exits after use, cloud-based health maintenance, and controlled updates. Changed third-party skill instructions require new approval. The router's suggestions do not override host-agent, user, or project instructions.

The source preparation references a private application baseline. **This repository is public and currently holds planning materials only**; publishing the plan does not authorize uploading credentials, private memory, user profiles, or private application source.

## For Work and coding agents

Use `docs/implementation/00_START_HERE.md` as the entry point. Establish authorized access to the real existing source before implementing. Execute `docs/implementation/10_IMPLEMENTATION_PLAN.md` task by task, preserving the stable endpoint, eight tool names, bundled skills, and unrelated agent configurations.

Keep implementation, staging verification, production deployment, native-client invocation, active health schedules, and updater arming as separate evidence-backed completion states. Initial update mode is **observe**; owner approval is required for the protected production and arming gates defined in the handoff.
