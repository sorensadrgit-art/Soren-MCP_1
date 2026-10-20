# Deployment, Release, and Operations

## Preserve the active service

Use the existing Vercel project/team IDs from the baseline. Read them again during Work admission and compare current production identity. Never create another bare project with the same role or silently redirect existing clients to a preview URL. Keep the previous deployment available until the new release's probation completes.

## Source control and dependencies

Create or connect an owner-authorized private repository after reviewing the current source. The inspected root has no `.git`; do not invent its GitHub origin. Initialize source history without committing user profiles, `.env`, deployment credentials, temporary build output, personal memory, or local transaction journals.

Use a protected main branch and a dedicated stable release branch/tag convention. Record a Git SHA and a source snapshot digest for the baseline. Reproduce the locked build before changing dependencies. Select the actual supported Node runtime from Vercel and the project lockfile; do not jump to a newer runtime as part of installer work.

Provide environment-specific configuration for development, preview, staged production, and production. Database test roles and data must not point at production. API connector identities are scope-checked before any mutation.

## CI workflows to deliver

- `.github/workflows/quality.yml`: unprivileged source/contract/unit/installer checks on PRs; no deploy/signing secrets.
- `.github/workflows/integration.yml`: trusted isolated database/authorization and browser tests.
- `.github/workflows/dependency-proposals.yml`: one selected updater, bounded proposal cadence, no unreviewed merge.
- `.github/workflows/release.yml`: exact reviewed artifact build, provenance/signing, staged production, tests, owner/armed-policy gate, promotion.
- `.github/workflows/health-watch.yml`: independent read-only best-effort watcher if this is the authorized fallback; explicitly not an availability SLA.
- `.github/workflows/update-check.yml`: observe-mode candidate checks under job budget; no policy self-modification.

Pin action revisions to reviewed commits at implementation time. Do not fill this specification with stale or guessed commit SHAs. Keep workflow write permissions minimal and environment protection intact. Private-repo feature entitlements are part of preflight. [S05, S07]

## Release sequence

1. Bind intended source commit, dependency lockfile, policy version, exact Vercel project/team, and environment. Confirm expected current production parent.
2. Pass all hard checks and credential-free tests. Review candidate source and workflow changes before privileged stages.
3. Build the production artifact once with production-intended configuration in a trusted environment.
4. Create a staged production deployment with domain assignment withheld, using the documented CLI/platform capability. One example platform flow is `vercel --prod --skip-domain`, then promote the specific returned production deployment. Flags must be revalidated against the installed CLI and resolved project scope. Never include a token in a shell command. [S03]
5. Run full live MCP and browser suites against that staged identity. Verify secrets and private sources are not exposed. Record artifact digest and test evidence.
6. Recheck expected parent, policy generation, lease fence, revocations, evidence freshness, budget, and owner/armed eligibility. Promote the same artifact without rebuilding.
7. Verify public aliases independently. Record the exact production deployment observed, not merely a successful command exit.
8. Enter bounded probation and test the previous artifact/control before any automatic rollback. Finish stable with evidence or pause/rollback as specified.

A provider's promotion API and CLI may differ. A preview promotion can rebuild with production settings; do not advertise exact-artifact delivery unless artifact/environment identity is actually preserved. A failed promote call must not trigger a direct untested production deployment fallback.

## Schema and catalog rollouts

Use additive database migrations first. Support previous application reads throughout the release window. Backfill separately with tracked batches and resumable jobs. Destructive changes require an owner-approved migration release with explicit compatibility evidence; they are excluded from unattended promotion.

Skill versions and catalog generations remain immutable. Publish with compare-and-swap over the active generation and expected previous generation. Keep historical version files subject to retention, license, and legal policy. Revocation is a separately retained deny record and always takes precedence over previous catalog pointers.

## Rollback procedure

Pause further promotion; identify the implicated release; confirm previous artifact validity, schema compatibility, and security minimum; revert only the deployment routing to that artifact; verify aliases and core tools; retain all incident/update/approval/revocation state. Reconcile effective cron definitions after rollback. Never delete a failed release's evidence to make the dashboard look clean.

If previous artifact compatibility cannot be proven, do not automatically roll back. Keep safe bundled functionality where possible, deny private mutation, and raise an owner action with exact diagnosis.

## Budget and retention

Discover current Vercel/Supabase/GitHub/monitor capabilities and owner budgets in Work. No automatic subscription purchase, higher build machine selection, paid canary entitlement, domain purchase, or API model usage is preauthorized here.

Initial budgets: provider requests per policy; maximum one stable promotion/day; maximum three open dependency proposals; maximum 50 staged update candidates per reconciliation batch; no full catalog mirroring. Store version/health history according to retention policy, with legal/approval records excluded from routine cleanup.

Use provider spend alerts where supported plus application request counters. At a budget cap, degrade external discovery and pause candidate builds; do not disable essential bundled reads or authentication checks.

## Operations ownership and documentation

The owner controls arming, expense approval, signing roots, and publication policy. The release controller executes bounded authorized release decisions. Health workers observe and perform limited housekeeping. Agent clients consume read-only capabilities. Source maintainers propose changes through protected review.

Before reporting production readiness, deliver operator commands for pause, observe, inspect job, reconcile unknown deployment, reverify release, and explicit rollback. They must call authenticated narrow operations; no hidden generic shell executor.
