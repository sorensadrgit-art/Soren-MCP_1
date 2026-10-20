# Controlled Automatic Updater

## Product promise

The cloud can automatically discover changes, prepare reviewed release candidates, verify exact artifacts, deliver eligible releases, and recover from attributable regressions. It must not silently trust changed third-party instructions, edit desktop configurations while the user is working, or promote arbitrary dependency code because its version looks small.

The updater is a deterministic policy/state machine, not an LLM with a production token and an instruction to “fix everything.” A coding agent may propose a patch in an isolated branch, but cannot approve or deploy its own patch.

## Four update lanes

| Lane | Automatic work allowed | Human or host-owned gate |
| --- | --- | --- |
| Catalog metadata | Refresh names, descriptions, provider availability, revisions; cache under quota | Metadata is untrusted and never grants approval |
| Skill instruction content/assets | Fetch fixed-source staged candidate; hash, diff, scan, compare license/capabilities | Every changed instruction/asset digest needs a new exact-version approval |
| Application/dependencies | Generate dependency proposals/PRs, run unprivileged tests, build reviewed releases, stage and verify | Source review and protected-path checks; approved stable channel may automate promotion |
| Desktop installer/client metadata | Discover supported adapter updates and offer a verified installer release | Apply only on explicit installer invocation or a verified native plugin updater; no resident daemon |

External provider data cannot modify dependency files, workflows, trust roots, source allowlists, or instructions. A community skill's own version number is never an app-release version.

## Modes

`paused`: no update discovery or promotion; read-only health continues.  
`observe`: discovery, diffing, unprivileged checks, and visible proposals; no production mutation. This is the installation default.  
`armed`: an owner-approved stable policy allows narrowly scoped promotion of already reviewed, authenticated releases after all gates. Changed skills remain review-only.

Arming stores owner identity, policy SHA-256, allowed lane/class, scope, timestamp, expiry, and evidence of rehearsal. Default arming grant expires after 30 days; renewal requires an owner action. Pause is immediate, increments policy generation, and invalidates pending promotion authority. Failed renewal returns to observe, never “continue permissively.”

## Eligibility classification

Default auto-promotion allowlist contains only reviewed, non-breaking application maintenance releases from the protected release branch, with exact code and lockfile identities, no new package publisher/source, no new install scripts, no permission changes, no protocol changes, and no database migration.

Changes to `lib/security/`, `lib/updates/`, `lib/client-contract.mjs`, `.github/workflows/`, installer writers, authorization, signing roots, required tests, schedule policy, environment variables, and production targets are human-gated. Any new package, major runtime/framework upgrade, changed scripts, persistent schema migration, or increased resource/billing requirement is human-gated. Semver patch alone is insufficient.

Dependency automation uses one chosen bot/configuration, not multiple competing bots. Default is one proposal/day, maximum three open update proposals, grouped only where dependencies must move together. Do not disable branch protection or required checks so the bot can merge. Development/test infrastructure is isolated from production secrets until source review completes.

## Release state machine

`DISCOVERED -> CLASSIFIED -> REVIEW_REQUIRED or ELIGIBLE -> BUILDING -> BUILT -> STAGED -> VERIFYING -> APPROVED_FOR_PROMOTION -> PROMOTING -> PROBATION -> STABLE`.

Terminal/side states: `REJECTED`, `PAUSED`, `FAILED`, `UNKNOWN_OUTCOME`, `ROLLED_BACK`, `REVOKED`. Do not infer promotion success from submitting a command. Persist provider deployment identifiers and verify routing aliases independently.

A promotion authorization binds the exact manifest digest, environment, policy generation, expected current deployment, catalog generation, schema compatibility, evidence age, and active lease fence. Any mismatch invalidates the authorization and returns to verification.

## Authenticity and supply-chain controls

Use an established update-signing framework such as TUF for downloadable installer releases. Provision a trusted root through an owner-controlled channel separate from the release mirror; metadata expiry, monotonic versions, target hashes/lengths, delegation rules, and authorized key rotation must be checked by a maintained client. Do not design custom cryptography or accept a new root merely because it was downloaded beside the candidate artifact. [S06]

For cloud builds, bind repository, commit, workflow, environment, and artifact digest using supported build provenance plus owner release authorization. GitHub artifact attestations are entitlement-dependent for private repositories; discover availability rather than making the repo public or silently upgrading plans. If unavailable, use an approved external signing/provenance path and verify it. Without an authenticated release identity, keep unattended release consumption disabled. [S07]

A signature proves identity/integrity, not benevolence. Approval, review, isolation tests, and revocation checks remain mandatory. Signing keys and trust-root administration must not reside in an untrusted workstation or be exposed to pull-request code.

## Build and staging

Build only from the exact reviewed source and locked dependencies in a trusted cloud runner. Produce a software bill of materials, test result set, release manifest, and immutable artifact digest. Allow dependency lifecycle scripts only after explicitly reviewing needed scripts; do not indiscriminately disable required scripts and claim an equivalent build.

Deploy with production configuration and production domain assignment withheld. Test that exact staged production deployment; then promote the same artifact without rebuilding. A preview build is useful for UI work but is not interchangeable with a production build. [S03]

If the platform/tool cannot withhold domain assignment for the intended target, the release adapter must stop auto-promotion and request the supported release route rather than deploy directly to live production as a workaround.

## Promotion checks

Before promotion, all hard suites pass, full evidence is no more than 60 minutes old for the exact artifact, a final local-contract smoke test is no more than 5 minutes old, required dependencies are ready, the independent watcher has fresh evidence, and the expected parent deployment is still active. No active security incident, revocation, owner pause, lease loss, or budget violation is permitted.

Use a 15-minute staged observation period where the test environment is stable. After promotion, observe for 30 minutes with a direct lightweight probe at least once/minute by the entitled release runner/watcher, bounded to that probation window. If this observation mechanism cannot be provided on the approved plan, keep promotion manual. Do not use unapproved paid rolling-release features as a hidden prerequisite.

Cap normal production promotions at one per 24 hours initially. An owner may authorize an emergency reviewed security release, still subject to artifact identity and safety checks.

## Unknown outcomes and retries

Record operation intent before invoking deployment/promotion APIs. If the response times out, set UNKNOWN_OUTCOME and inspect the provider's exact deployment/alias state. Do not repeat the mutation or create another deployment until reconciliation identifies the outcome. The maximum of three safe-job attempts does not authorize repeated unknown promotion attempts.

Lease/fence validation prevents stale database commits but cannot revoke a sent network call. Therefore, use provider operation IDs, expected-parent checks, one release at a time, and post-operation reconciliation. A newly acquired worker must reconcile the predecessor before acting.

## Bounded rollback

Automatic rollback is permitted only within the probation window when the new release fails a core contract/integrity check or three fresh local-functionality probes, the control/previous artifact is healthy, and an independent probe corroborates the failure. Provider-only degradation is not rollback evidence.

The previous artifact must be signed/authorized, schema-compatible, not revoked, above the minimum secure version, and bound to the same environment. Rollback cannot undo grant revocation, approval history, incident history, or database writes. Do not run destructive down migrations automatically.

Allow at most one automated rollback per release, then enter observe with a 60-minute cooldown and an operator incident. Do not repeatedly bounce between two broken builds. If rollback fails or the previous release is unsafe, pause updates, keep the safest available read-only mode, and alert; do not choose an arbitrary older artifact.

Cron definitions may change when Vercel rolls back code. Reconcile the scheduler against the persisted policy after rollback and maintain independent heartbeat detection so a restored old cron file cannot silently stop monitoring. [S01]

## Skill updates

Poll approved skill sources for newer revisions within quotas. Stage changed files, compute a full manifest, inspect license/capability diff, and display review evidence. Never copy an old approval to new bytes. Catalog publication atomically switches the active approved generation; in-flight retrieval remains pinned to its selected immutable version. Revoked versions are denied even if cached or present in an older generation.

During registry outages, bundled approved public skills can continue. Do not serve private stale content after its revocation/grant freshness cannot be established.

## Desktop updates

Cloud service code updates reach clients at the same endpoint. Local files can update only when the installer is invoked or an explicitly configured native updater runs. A powered-off PC cannot have its disk changed by this system. Unknown new client formats receive a compatibility notice and no-write plan, not an untested migration.

Local package rollback/removal preserves user edits and installer ownership. No unattended antivirus, drivers, Windows, agent apps, or third-party MCP updates are in scope.
