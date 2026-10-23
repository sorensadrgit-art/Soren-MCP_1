# Production V3 — credential renewal and protected staging (prepared only)

> **NO-GO / non-executing runbook.** This document authorizes no provisioning, environment changes, credential minting, production deployment, promotion, key rotation or merge. Require separate explicit owner approval for each controlled action.

## Verified baseline, 2026-10-23

- Runtime release candidate: `30ac3e3726a1efa6e58cd1221fe242f42d089660` (`main`, PR #6 merge), already tested against the **separate protected preview**.
- Existing production runtime: 2.4.0, deployment `dpl_Dvmp9LTVEQLdQeMVDGAfRxBoK51b`; preserve as exact full-runtime rollback target.
- Existing production Vercel project: `soren-shared-mcp-skills`; Vercel Authentication currently **disabled**.
- The separate non-production Supabase store is `xoyefnfesvrqsohuppxe`; **never reuse this project or its keys for production**.
- Supabase organization's quoted extra project cost was `$0/month`, but the attempted new production project creation failed with **Free project quota reached**. No new project was created; the existing `soren` project is INACTIVE and must remain untouched.
- Draft PR #8 is documentation/verification work. This plan does not change runtime code.

## Gate 1 — separate production store

1. Resolve the two-active-project quota restriction with Supabase support or obtain a separately approved production account/plan. Do **not** automatically delete, pause, resume, upgrade or repurpose either existing project.
2. Obtain owner approval for exact Supabase project name, organization, region and cost quote **after** quota issue is resolved.
3. Provision the dedicated production project only after approval; apply the reviewed `0001`–`0005` migrations, seed an isolated workspace and least-privilege gateway role, verify 5-RPC-only access and refusal tests.
4. Ensure no production token/workspace ID reuses non-production values. Do not change the existing production Vercel env until store acceptance passes.

## Gate 2 — owner-controlled signing credentials

- Generate and retain the **production** ES256/P-256 private JWK only in owner-controlled, access-restricted storage, with a separately secured backup/recovery procedure. Do not send the private JWK to Factory Droid, the repository, CI, Vercel, Supabase SQL, chat or evidence artifacts.
- Import the corresponding key into the **production Supabase project's** JWT Signing Keys. Verify the published JWKS public coordinates match the local key before use; do not rotate or revoke keys without a separate owner decision.
- Mint a `soren_gateway` JWT locally with the production `workspace_id`, matching `kid` and a bounded `exp` (the current production plan specifies **7 days maximum**). Validate signature, claims and exact target independently; never log the JWT.
- The Vercel Production-only variable `SOREN_GATEWAY_DB_KEY` receives the compact short-lived JWT (never a service-role token); `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SOREN_WORKSPACE_ID`, `SOREN_RATE_KEY` and `SOREN_CAPABILITY_MODE` must target **production** exclusively. No public or `NEXT_PUBLIC_` credential exposure.
- **Renewal requirement before GO:** document a specific owner/operator, safe renewal method, warning at least 72 hours before `exp`, backup operator/recovery process, and evidence-based verification before expiry. Example operating policy: mint a new JWT by T-minus 72 hours, stage redeploy/verify, promote before T-minus 24 hours. Monitoring must not store token values.
- Track expiration in private operations metadata (timestamp and key ID only), not in code/PR. A 7-day JWT without a renewal procedure is an uptime risk; never assume that a Vercel environment update refreshes running deployments retroactively.
- Before any production promotion, confirm both the staged deployment and rollback pathway can authenticate; avoid treating an already-expired token as viable rollback.

## Gate 3 — protect staged production builds without taking public MCP offline

- **Current state:** production Vercel project has no Vercel Authentication or password protection. `--skip-domain` alone does not secure a generated deployment URL.
- **Proposed, separately approved change:** enable **Vercel Authentication — Standard Protection** (protect all generated deployment URLs and Preview deployments; keep production domains public). The Sept 2026 Vercel changelog says Vercel Authentication can protect all deployments for free, but **All Deployments would also require sign-in on the existing public production MCP domain** and is not appropriate for this cutover.
- Inspect existing production-domain mappings and any code that depends on the generated `VERCEL_URL` before enabling Standard Protection; protected generated URLs can break self-fetch or direct clients.
- Verify **both**: (a) an unauthenticated request to the staged/generated URL is blocked by Vercel Authentication; (b) anonymous access to the existing production MCP domain remains unchanged (and application-level auth/security remains intact). Use explicit sampled endpoints and no test tokens in logs.
- For authenticated staging probes, prefer `vercel curl` / `vc curl` with the correct team/project identity, or an origin-scoped short-lived Trusted Sources token where supported. Do not disable protection or introduce a standing automation bypass.
- Stage only when owner approves: clean checkout of exact reviewed commit, Production-only env, `SOREN_V3_TOOLS` **off**, TypeSafe **off**, and `vercel deploy --prod --skip-domain`. Inspect target, source commit and protection **before** protocol tests.
- Only after full stage verification and separate Stage A release authorization may that exact staged deployment be promoted; remain flag-off and observe >=24h before considering Stage B.

## Gate 4 — exact inventory, routing review and release

- Stage A contract 2.5.0, 8 legacy tools and 23 skills; Stage B, after separate later approval and >=24h healthy Stage A, 14 tools and 75 resources.
- The 59 non-ROUTE-056 frozen routing labels remain **independent human-review pending**. `docs/v3/routing-label-ai-triage.md` records preliminary AI findings only; it is not human approval.
- Keep PR #8 draft until reviewed. Run all required CI, contract, refusal, budget, protected-stage and native-client checks; one optional upstream registry timeout was recorded separately.
- Preserve rollback target `dpl_Dvmp9LTVEQLdQeMVDGAfRxBoK51b`, re-check aliases and hashes at activation, and never conflate flag rollback with restoring runtime 2.4.0.

## Open approvals

1. Supabase quota resolution and separate **production** project provisioning cost/scope.
2. Independent human review of 59 frozen routing labels and 9 preliminary decision candidates.
3. Credential renewal owner, cadence, expiry monitoring, and recovery process.
4. Vercel Standard Protection change (including public-domain reachability validation).
5. Exact Stage A commit, Production-only environment variables, staging and promotion.
6. Separate Stage B flag activation only after healthy Stage A and observation.

## Source documents

- `docs/v3/production-activation.md` and `docs/v3/production-readiness.md`
- `docs/v3/production-gateway-store-decision.md`
- https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan (2026-09-09)
- https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/auth/signing-keys
