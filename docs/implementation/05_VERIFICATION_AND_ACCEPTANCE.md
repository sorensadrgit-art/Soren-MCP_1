# Verification System and Release Acceptance

## Test policy

Tests prove behavior, not implementation trivia. Each change begins with a failing behavioral test, implements the smallest correct change, then reruns the affected tests and full required suites. Preserve the existing 22-test baseline until refactoring transparently replaces coverage. Increasing test counts without testing the new risk is not progress.

All evidence binds a source revision, lockfile digest, target environment, timestamp, command/invocation, result, and artifact reference. Empty templates start NOT_RUN. This package does not prepopulate future checks as PASS.

## Test layers

**Unit tests:** update eligibility; version identity; routing relevance; instruction precedence metadata; redaction; incident transitions; retry timing; lease/fence validation; manifest parsing; installer planning and semantic diff; revocation checks. Fake clocks and deterministic fixtures eliminate sleeps and date dependence.

**Integration tests:** actual Postgres constraints and row-level policies; two concurrent job claims; stale fence rejection; crash/retry after uncertain side effect; staged file integrity; approved retrieval with revocation; authorization audience/client/grant checks; admin mutation denial through read-only credentials; provider protocol fixtures.

**Live MCP tests:** existing eight tools; all four bundled resources; supported legacy and current protocol paths using the actual SDK; transport content negotiation; invalid parameters; bounded body/content; origin rejection; permission rejection; current provider response shape; classified degradation. Test different concurrent tasks, not just identical labels.

**Installer tests:** fixtures across supported client versions, JSONC comments, TOML tables, Unicode, BOM, CRLF, read-only files, reparse points, active file locks, missing executables, project overrides, duplicates, plugin ownership, checksum drift, repeat apply, repeat remove, crash recovery, unknown version no-write, and unchanged unrelated configuration.

**Browser/native tests:** keyboard-operated client picker, exact copy payload, clipboard-denied fallback, status freshness, review diff, owner approval, update pause/arm, audit evidence, narrow screens, reduced motion, and error states. Test real desktop invocation sequentially for each claimed supported client.

**Update rehearsal:** wrong signing identity; expired/missing metadata; rollback/freeze/mix-and-match; modified artifact after tests; invalid expected parent; revoked previous release; permission-changing patch; stale health evidence; database migration rollback boundary; interrupted deployment; watcher failure; kill switch during promotion; one-rollback cap.

## Required test entry points to implement

Keep `npm test`, `npm run build`, and `npm run verify:mcp`. Add:

```text
npm run test:contracts
npm run test:installer
npm run test:security
npm run test:operations
npm run test:updates
npm run test:db
npm run test:browser
npm run verify:release -- --manifest <actual-reviewed-manifest>
npm run health:once -- --profile <resolved-profile> --read-only
npm run updates:check -- --mode observe
```

These are future package scripts. Do not print them as installed until Work creates and executes them. Tests requiring credentials must run only in the correct trusted environment; public/fork pull requests receive no production secrets. Avoid logging test tokens even when synthetic fixtures are used.

## Evidence format

Use `contracts/verification-evidence.schema.json`. Include `status`, `scope`, `sourceRevision`, `testId`, `method`, `startedAt`, `finishedAt`, `environment`, `evidenceRefs`, and `observed` summary. Never serialize complete source task bodies, tokens, or user configuration into evidence. Each SKIPPED equivalent must become NOT_RUN/BLOCKED/NOT_APPLICABLE with an explicit reason, not PASS.

`installation-inventory.md` lists detected executable/version, effective config scope, ownership mode, Soren registration, native invocation state, and host. `verification-results.md` covers all acceptance IDs. `health-verification.md` proves scheduled execution and stale heartbeat detection. `update-verification.md` proves observe/arm/pause and rollback behavior with a rehearsal artifact.

## Hard gates versus optional providers

Hard failures: contract break, unauthorized action/data access, wrong artifact, invalid signature, cross-workspace cache leak, malformed config overwrite, skipped required tests, stale signing trust, or invalid ownership. These block promotion.

Provider availability may be a warning only when local bundled functionality, privacy gates, and failure classification pass. If the candidate release changes that provider adapter, its fixture compatibility and at least one live authorized check are required before promotion; an outage keeps that adapter change pending rather than making its test optional.

No warning can waive permission checks. Missing credentials or missing test runtime is BLOCKED, not a successful degraded mode.

## Routing evaluation set

Create at least 60 reviewed tasks: 10 direct single-domain, 15 mixed-capability, 10 irrelevant/trivial, 10 provider-specific, 5 conflicting names, 5 explicit user choices, 5 unavailable/incompatible skills. Freeze expected acceptable top-three sets and bypass decisions before scoring the candidate version.

Initial target: >=90% top-three relevance on human-labeled tasks; 100% preservation of explicit user selection and approval constraints. Track false-positive routing on trivial work. Do not train the answers into hardcoded per-prompt matches or rewrite the expected labels to make a release pass.

## Performance verification

Use a trusted cloud runner in the same documented region and a separate external vantage point. Report warm and cold runs independently; measure at least 100 warm local requests and 30 bounded federated cases within provider quotas. Compute p50/p95, payload size, quota use, and error class. The target values in the operating policy are budgets, not guaranteed performance across every client/network.

Test 20 concurrent local-only requests and controlled 4-way provider requests with a shared quota stub. Do not load-test upstream services without permission. Cold starts and external timeouts must be bounded and reported rather than hidden from the statistics.

## Schedules and updater acceptance

A cron expression in a file is not active maintenance. Prove scheduler registration, an authenticated scheduled delivery, persisted job result, duplicate delivery reconciliation, stale heartbeat detection by the separate watcher, and deduplicated alert/recovery.

A PR bot is not an automatic updater. Prove the full narrow lane: eligible reviewed release -> manifest verification -> staged production -> tests -> policy decision -> exact promotion -> probation -> stable or bounded rollback. The first arming action remains owner-approved.

## Final acceptance ledger

Use `acceptance/acceptance-matrix.csv`. Every listed hard gate must PASS. Environment-dependent gates may be BLOCKED during development, but must not be described as complete production capabilities. Required evidence includes screenshots for browser checks, native-client tool transcripts with sensitive data redacted, and release controller state history.
