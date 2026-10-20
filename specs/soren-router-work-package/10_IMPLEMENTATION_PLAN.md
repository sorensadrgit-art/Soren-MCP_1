# Soren Universal Router — Implementation Plan for Work

**Goal:** Deliver the specified installation, verification, health, and update system around the existing service.  
**Architecture:** Existing Next.js/Vercel application with provider/client adapters, private managed operations state, and a separate bounded release runner.  
**Stack:** Existing locked application; Node installer; Postgres/private storage via approved Supabase; authorized cloud CI; managed OAuth; existing official MCP SDK.  
**Specification:** `02_SYSTEM_SPEC.md` and the specialist documents in this package.  
**Execution:** One accountable integration owner. Parallel workers only on explicitly disjoint files/worktrees, followed by independent review.

This plan is preparation, not a report that the code has been written. Use the target host's Superpowers execution workflow task-by-task. When required architectural native hooks are available, formalize and validate ADRs/contracts before the first implementation milestone. Otherwise mark that assurance unavailable and use ordinary reviewed docs; do not manufacture hook receipts.

## Global constraints

Preserve endpoint/alias/eight tools; public read-only; zero new desktop resident services; no changed third-party instruction auto-approval; no private-memory migration; no unrelated MCP repairs; no unapproved spending; no production/signing credentials exposed to unreviewed source; no skipped hard tests. All operation state is attributable and evidence-bound. New default discovery mode is opt-in, not a breaking change.

## Review focus

The highest-risk conditions are: existing client configuration changed after planning; identity-valid but unauthorized agent requests; duplicate jobs and late network side effects; provider-only outages triggering false deployment rollback; and accepted release bytes changing after verification. Each is explicitly covered below and in the acceptance matrix.

## M0 — Admit the project and preserve a baseline

**Read:** real `package.json`, lockfile, `lib/client-contract.mjs`, `AUDIT-20261019.md`, applicable source/agent instructions, deployment metadata.  
**Create:** `docs/installation-inventory.md`, `docs/work-admission.md`, safe `.gitignore`, source-controlled baseline and `release/version-policy.md`.

- [ ] Verify actual source access; compare selected-file hashes and reconcile drift instead of overwriting.
- [ ] Inspect current Git/remote state. Create a private baseline only through an authorized provider, excluding secrets and user profiles.
- [ ] Reproduce existing tests/build in a trusted environment after source review, without interpreting historical audit counts as fresh results.
- [ ] Capture effective client versions and available scheduler/auth/signing/monitor entitlements; do not launch every desktop app.
- [ ] Resolve package/MCP version reporting deliberately; record source/deployment identities separately.
- [ ] Review and commit only baseline/docs changes. Exit gates: `BASE-01`, `BASE-02`, `META-01`.

## M1 — Lock the interface and evidence contracts

**Modify:** `lib/client-contract.mjs`, `scripts/verify-mcp.mjs`, `tests/client-contract.test.mjs`.  
**Create:** `lib/contracts/{installer,health,release,evidence}.ts`, `tests/contracts/*.test.mjs`.

- [ ] Write failing tests for retained legacy fields/types, permitted additive fields, unknown versions, and namespaced client identity.
- [ ] Define all internal types listed in `03_ARCHITECTURE_AND_DATA.md` with no unresolved references.
- [ ] Validate evidence/release objects against the draft schemas; require explicit NOT_RUN/BLOCKED states and source/environment binding.
- [ ] Add independent tests that annotations remain accurate without being treated as permissions.
- [ ] Run contract tests and existing full suite; review and commit. Exit gates: `MCP-01`, `MCP-02`, `EVID-01`.

## M2 — Implement the one-shot installer transaction engine

**Create:** `scripts/setup-agents.mjs`, `installer/{detect,plan,apply,verify,remove,journal}.mjs`, `installer/adapters/{factory,codex,antigravity,opencode,claude,qwen}.mjs`, `tests/installer/` fixtures.

- [ ] Begin with fail/no-write fixtures: unsupported versions, invalid configs, stale checksums, escaping paths, scope duplicates and read-only files.
- [ ] Implement inspect/plan with version-specific adapters, native CLI preference, safe argument arrays, and secret-free output.
- [ ] Implement atomic or journaled per-client apply with OS identity checks, CAS preconditions, and exact owned semantic changes.
- [ ] Implement receipts, repeat apply no-op, conflict-preserving removal, interruption reconciliation, and concise managed guide updates.
- [ ] Verify no persistent process/startup artifact is created; do not auto-install underlying desktop apps.
- [ ] Run installer/unit suites, inspect diffs, and commit. Exit gates: `INST-01` through `INST-08`, `AGENT-01`.

## M3 — Create durable operations storage and authorization

**Create:** `supabase/migrations/`, `supabase/tests/`, `lib/registry/`, `lib/security/{identity,grants,policy}.ts`, `lib/operations/{jobs,leases,events}.ts`, protected admin routes.

- [ ] Write database concurrency/isolation tests first: two claims one intent, different payload rejection, stale fence denial, workspace cross-read denial.
- [ ] Implement tables/constraints and least-privilege roles; tenant scoping cannot exist only in application code.
- [ ] Implement OAuth/resource validation and application grants, separating read-only agent access from human review/arming.
- [ ] Add revocation checks and cache-scope tests. Invalid supplied identity cannot downgrade to anonymous private access.
- [ ] Implement append-only attributable operation records and redaction. No generic admin secret for agent reads.
- [ ] Run real isolated database/auth integration tests; review migrations/security boundaries; commit. Exit gates: `AUTH-01` through `AUTH-05`, `JOB-01`, `JOB-02`.

## M4 — Add immutable approved skill retrieval

**Modify:** `lib/catalog.mjs`, `lib/federation.mjs` only behind preserved interfaces.  
**Create:** `lib/providers/`, `lib/routing/`, `lib/retrieval/`, `lib/registry/{versions,reviews,generations}.ts`, `tests/routing/`, `tests/registry/`.

- [ ] Add identity fixtures for duplicate display names, nested repository paths, branches containing slashes, and changed digests.
- [ ] Implement canonical repo/path/revision identities with provisional alias resolution, eligibility before ranking, and optional auto-discovery mode.
- [ ] Implement staged manifest inspection, exact-version human approvals, approved reads, supporting-file boundaries, and monotonic revocation.
- [ ] Test private retrieval fallback denial and preservation of four bundled public resources during DB outage.
- [ ] Add the 60-task evaluation set, bounded provider fetches, quota sharing, partial results and circuit behavior.
- [ ] Run baseline plus routing/registry/live provider checks within quota; review and commit. Exit gates: `REG-01` through `REG-05`, `ROUTE-01`, `NET-01`, `PRIV-01`.

## M5 — Build health state and the maintenance dispatcher

**Create:** `lib/operations/{probes,health,incidents,housekeeping}.ts`, `app/api/health/{live,ready}/route.ts`, `app/api/cron/maintenance/route.ts`, `app/api/admin/health/route.ts`, `scripts/health-once.mjs`, `tests/operations/`.

- [ ] Write fake-clock tests for three-failure/two-success transitions, stale evidence, duplicate samples, and provider-versus-core classification.
- [ ] Implement minimal public health and detailed private diagnostics. Database failure must not convert private requests to public success.
- [ ] Implement bounded due-slot jobs, leases/fences, retry policy, failed queue state, and redacted incident/recovery records.
- [ ] Implement only allowlisted housekeeping; validate refusal to alter unrelated systems.
- [ ] Generate a plan-entitled schedule profile; prove authenticated actual scheduled delivery and independent deadman observation.
- [ ] Run integration/fault-injection tests and document entitlement gates; commit. Exit gates: `HEALTH-01` through `HEALTH-07`.

## M6 — Implement updater decisions and signed release ingestion

**Create:** `lib/updates/{classify,manifest,evidence,state,policy}.ts`, `scripts/{updates-check,verify-release}.mjs`, signed artifact verification adapter, `tests/updates/`.

- [ ] Write all deny cases first: expired trust, wrong identity, changed instruction digest, new permissions, protected-file changes, stale evidence and pause generation.
- [ ] Implement four independent update lanes and observe/armed/paused modes with expiring owner arming grant.
- [ ] Implement maintained TUF/provenance verification under actual available entitlements; no custom signature scheme.
- [ ] Implement reviewed stable release eligibility and human review gates; bind policy/digests/expected parent/fence.
- [ ] Test unknown external outcome reconciliation before retries; prove a manifest cannot grant its own authority.
- [ ] Run update/security suites and owner review of the policy; commit. Exit gates: `UPD-01` through `UPD-08`, `SUPPLY-01`.

## M7 — Deliver staged production release and recovery automation

**Create:** `.github/workflows/{quality,integration,dependency-proposals,release,health-watch,update-check}.yml`, `scripts/{release,rollback,reconcile-release}.mjs`, `lib/updates/{promote,rollback}.ts`.

- [ ] Test secret-free untrusted PR behavior and signed/protected release entry before enabling workflows.
- [ ] Implement production-intended staging without live domain assignment. Compare tested artifact and promoted artifact identities.
- [ ] Implement pre-promotion freshness, parent, lease, revocation, budget and independent watcher gates.
- [ ] Implement probation, attributable failure analysis, one eligible rollback, cooldown, and post-rollback cron reconciliation.
- [ ] Rehearse failed promotion, unknown outcome, incompatible schema, revoked previous version, missed watcher and owner kill switch using nonproduction test targets.
- [ ] Commit release code after independent security review. Exit gates: `REL-01` through `REL-06`.

## M8 — Complete user and agent navigation

**Modify:** existing `app/page.tsx`, `app/globals.css`; preserve visual language and working behaviors.  
**Create:** `app/{connect,registry,reviews,health,updates}/` views, `components/operations/`, browser test suite.

- [ ] Define failing browser tests for exact client snippet, effective status, empty/error/loading states, approval digest, pause/arm authorization, and clipboard failure.
- [ ] Implement accessible pages using shared validated contracts, not copied per-page policy strings.
- [ ] Distinguish configuration, native connection, actual invocation, historical health, stale data, read approval, and execution authority.
- [ ] Verify keyboard, narrow layouts, reduced motion and real clipboard paths. Do not use stock screenshots as evidence.
- [ ] Review UX and accessibility findings; commit. Exit gates: `UX-01` through `UX-04`.

## M9 — Pilot, install, activate, and hand over

**Create/update:** `docs/{installation-inventory,verification-results,health-verification,update-policy,update-verification,rollback}.md`, `release-manifest.json`, actual installer/plugin release outputs.

- [ ] Verify six clients sequentially; reuse current configurations and update only installer-owned entries. Preserve unrelated MCPs and existing guides.
- [ ] Run full staged production checks and one benign tool call in every supported real client; record unverified GUIs explicitly.
- [ ] Obtain the first owner production gate over exact artifact, cost/scheduler profile, and data/access configuration.
- [ ] Promote the tested artifact, verify aliases, run probation, demonstrate actual health delivery and alerts; maintain observe mode initially.
- [ ] After the controlled release rehearsal, present the exact stable-channel arming policy for one-time owner consent. If not armed, report installed and observing—not unattended updating.
- [ ] Verify process inventory contains zero newly resident desktop router services. Produce final evidence and ownership-based removal instructions.
- [ ] Exit only with full acceptance matrix or an honest per-feature BLOCKED status. Exit gates: `CLIENT-01` through `CLIENT-06`, `OPS-01`, `OPS-02`, `EVID-02`.

## Task handoff rule

No worker marks another worker's verification PASS from a summary alone. The integration owner checks actual artifacts and reruns affected checks. Security, installer mutation, release control, and authorization require independent review when an appropriate reviewer is available. If not available, label the review mode accurately; do not invent a subagent run.
