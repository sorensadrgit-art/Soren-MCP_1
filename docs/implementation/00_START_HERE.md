# Soren Universal Skill Router — Work Build Handoff

**Prepared:** October 19, 2026  
**Deliverable type:** Implementation specification and execution handoff, not a newly installed application.  
**Target:** Extend the existing V2.2 service into an installable, verifiable, cloud-maintained system with a controlled updater.  
**Execution destination:** Work, with access to the source and authorized connectors verified there.

## Start instruction

Paste this instruction into Work and attach this package:

> Implement the Soren Universal Skill Router system specified in this package. Begin with `00_START_HERE.md`, `01_BASELINE_AND_EVIDENCE.md`, `02_SYSTEM_SPEC.md`, and `10_IMPLEMENTATION_PLAN.md`. Use the existing source at `C:\Users\soren\projects\soren-shared-mcp-skills` only after verifying that Work actually has authorized access to that Windows host, or use a verified source checkout supplied through an available connector. Do not assume this chat's filesystem, credentials, approvals, or tools transfer into Work. Preserve the existing endpoint, eight tool names, bundled skills, and unrelated agent configurations. Build the one-shot installer, tests, private operations storage and access controls, cloud health maintainer, controlled updater, and release/rollback workflows in the listed milestone order. Run tests before claiming completion, keep progress and acceptance evidence, and stop only the affected operation at a real access, cost, signing, or human-approval boundary. Do not deploy untested code, approve changed third-party skill instructions, start a permanent Windows router, or weaken operating-system protections. Create the required evidence artifacts and report actual client invocation, not configuration presence. Follow the approved policy; do not substitute a different app builder or create a new production project.

## What this package authorizes and what it does not

The user requested preparation of the complete installation, verification, health maintenance, and automatic-update system for creation in Work. This package captures that requested scope. Work may inspect, implement, and test the specified project using its available permissions. Existing tool-level confirmations and host approvals still apply.

First deployment of the new private operations plane, first production rollout, and arming unattended production promotion require an explicit owner gate over the tested artifact and operating policy. Once the owner arms a narrowly defined stable release channel, eligible, already-reviewed releases may be promoted automatically under that policy. New expenses, privileged identity grants, breaking contracts, and changed skill instructions never inherit blanket approval from a successful test.

This handoff does not itself start Work, install a scheduler, send alerts, or arm an updater. Its JSON policy files are proposed implementation inputs, not already deployed settings. Canonical architect artifacts must be validated in the target host before persistence; this package is not represented as having passed the AI Software Architect plugin's native hooks.

## Invariants

1. Public connection stays `https://soren-shared-mcp-skills.vercel.app/api/mcp`; alias stays `soren-skills`.
2. Public MCP remains read-only. Installation, approval, repair, and deployment are separate, authenticated control paths—not new public mutation tools.
3. The installer runs on demand and exits. Zero new Windows services, startup items, scheduled router jobs, or persistent local database workers.
4. No automatic approval of new/changed third-party instruction bytes. A publisher name, scan pass, star count, or semver patch is not approval.
5. A host agent's system/developer/user/project instructions and native permissions retain priority. Router advice cannot enforce host-model behavior or coordinate repository writes by itself.
6. Public metadata caches and anonymous responses never include private knowledge, authentication material, or user prompts.
7. No replacement of Basic Memory or bulk migration of personal information in this release.
8. One installer-owned registration and one managed guide block per client. Preserve unrelated tools and user changes.
9. Unknown, stale, configured, connected, and verified are distinct states. No invented green health indicators.
10. No production action from a stale lease, unknown deployment result, unsigned release identity, or revoked artifact.

## Read order

- `01_BASELINE_AND_EVIDENCE.md`: actual observed source/deployment metadata and historical audit facts.
- `02_SYSTEM_SPEC.md`: scope, operating boundaries, contract preservation, and release modes.
- `03_ARCHITECTURE_AND_DATA.md`: ownership, component boundaries, durable states, and interfaces.
- `04_INSTALLATION_AND_CLIENTS.md`: six-client setup, ownership, transactions, removal, and verification.
- `05_VERIFICATION_AND_ACCEPTANCE.md`: required tests and evidence gates.
- `06_HEALTH_MAINTAINER.md`: health checks, scheduler, incidents, safe remediation, and failure classification.
- `07_CONTROLLED_AUTO_UPDATER.md`: four update lanes, signed identities, staging, policy decisions, and rollback.
- `08_SECURITY_AND_PERMISSIONS.md`: public/private boundaries, authorization, secrets, and supply chain.
- `09_DEPLOYMENT_AND_OPERATIONS.md`: staged production delivery and lifecycle operations.
- `10_IMPLEMENTATION_PLAN.md`: ordered build milestones and owned files.
- `11_DASHBOARD_AND_AGENT_UX.md`: connection, review, maintenance, and agent navigation.
- `12_PRIMARY_SOURCES.md`: verified official documentation and implementation caveats.
- `13_RUNBOOKS.md`: exact operator scenarios and safe responses.
- `config/operating-policy.json`: initial observe-mode defaults and thresholds.
- `contracts/*.schema.json`: draft machine-readable evidence and manifest contracts.
- `acceptance/acceptance-matrix.csv`: traceable release acceptance requirements; initially NOT_RUN.
- `evidence/source-baseline.json`: current locator, IDs, locked versions, and selected source hashes.
- `PACKAGE_MANIFEST.json` and `PACKAGE_CHECKS.md`: handoff package integrity and validation results.

## First actions in Work

Open the package without executing downloaded project code. Verify package hashes using a trusted local hashing tool, then verify source location and current version. The handoff does **not** contain the application source. A Windows path is a locator, not proof that Work can read it. If access is unavailable, prepare source acquisition through the authorized Desktop Commander or repository connector; do not fabricate a clone URL or start a replacement app.

Inspect existing source, repository instructions, Git state, lockfile, and deployment metadata. The selected-file hashes are drift detectors, not an instruction to overwrite changed files. Reconcile drift with the current owner before editing an affected contract. Create a private source-controlled baseline after reviewing it and before implementing. Do not commit credentials or the user's agent configuration files.

Use the installed Superpowers process for milestone execution and test-first changes. Use Software/Data/AI Copilot for repository preservation and Agent Skills for relevant specialist checks. Use AI Software Architect for approved decision recording and boundary review; native hook validation must be established before claiming its protected `.ai-architect/` workflow is operational. If hooks are not supported in Work, continue with ordinary reviewed design documents and explicitly record that limitation rather than claiming equivalent hook assurance.

## Required completion records

Deliver `installation-inventory.md`, `verification-results.md`, `health-verification.md`, `update-policy.md`, `update-verification.md`, `rollback.md`, `release-manifest.json`, and the actual packaged installer/plugin outputs. Every record must identify the execution host, tested source revision, timestamp, test method, and result. Do not mark any requirement complete from the package's existence alone.

The final status must say which of: implementation complete; tested in staging; deployed in production; clients verified; health schedules active; updater observing; updater armed. These are separate claims with separate evidence.
