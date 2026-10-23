# V3 production readiness: GO/NO-GO report

Date: 2026-10-23
Status: **NO-GO until the owner approvals listed below are granted. Nothing in this report has been run against production.**

This report summarizes the verified state, the independent review, and every unresolved
approval, risk and verification step that stands between now and a V3 production release.

## Release candidate

- **Commit:** `30ac3e3726a1efa6e58cd1221fe242f42d089660` — the PR #6 merge, head of
  `origin/main`. This is the exact commit the verified protected preview was built from.
- PR #8 (draft, head changes with read-only audit documentation commits) contains
  **documentation, evidence and test/tooling changes only** — no `app/` or `lib/`
  production runtime code. It is not a precondition for the runtime replacement;
  keep it draft pending final evidence review and owner merge approval.
- The runtime release candidate is the code already on `main` at `30ac3e3`.

### PR #8 changed-file audit (29 files, 2026-10-23; refresh at merge)

| Class | Changed files | Runtime impact |
|---|---:|---|
| Evidence (`docs/evidence/`) | 16 | none |
| Documentation (`docs/`, excluding evidence) | 8 | none |
| Tooling (`package.json`, `scripts/`) | 3 | verification only; not shipped in production runtime bundle |
| Tests (`tests/`) | 2 | tests/fixture only |
| `app/` or `lib/` runtime changes | **0** | no production-runtime diff |

The original report's 24-file/12-evidence summary predated the three readiness
artifacts and the two follow-up review/runbook files. This full count is from the
GitHub PR changed-file API; re-audit the entire final diff at merge.

All production-runtime code reached `main` through PR #6, which is already merged.

## Verified on the protected Preview (deployment `dpl_4VALcS5XcaKu7uT9pNb3SR2UQTKk`, commit `30ac3e3`)

| Gate | Result |
|---|---|
| `verify:mcp` | 28/29 PASS, **0 FAIL**, 1 optional upstream WARN |
| SDK client probe (`@modelcontextprotocol/client`) | 13/13 PASS |
| `verify-capability-plan` | 14/14 PASS (`paidInferenceTested: false`, `productionModified: false`) |
| Tool inventory | exactly 14 tools: 8 legacy in order + 6 V3, 0 TypeSafe |
| Resource inventory | 23 skill + 44 knowledge + 8 recipe = 75 |
| Live federated discovery | SkillsMP and Skills.sh PASS (gateway credential valid) |
| Rate limiting | per-address cap 6/min enforced; overflow -> `provider_quota_exceeded`, graceful |
| Security boundaries | cross-origin 403, malformed identity 401, oversized body 413, traversal rejected |
| V3-12 store acceptance | remains PASS (non-production store 10/10 + 3 refusals) |
| CI on accepted Phase E commit `a91b5cc` | green (3/3); re-check CI on latest draft PR head before merge |

The single optional warning is the Official MCP registry discovery returning an upstream
timeout. It is documented as an upstream flake, is marked optional in the verifier, and
does not affect any required gate. No unexpected failure was hidden.

## Independent review

### Security-sensitive code (PR #6 runtime, reviewed)

- `lib/security/auth.mjs` — bearer validation fails closed (401 malformed / 503 no store /
  403 unauthorized). It never verifies JWT signatures itself; it delegates signature,
  session and revocation to Supabase `POST /auth/v1/user`, then enforces additional
  application bindings (`sub` == user id, `iss` == issuer, `aud` includes the configured
  audience, `exp` finite and future, `nbf` not future, `resource` binding, `client_id`
  allow-list). Cron authorization uses a timing-safe comparison. Request bodies are
  bounded (16 KiB default).
- `lib/operations/store.mjs` — `createGatewayStore` uses only the gateway-role credential
  and, in `gatewayOnly` mode, whitelists exactly the five federation RPCs; any other RPC
  name returns 403. RPC names are regex-validated, responses are size-bounded, and the
  Supabase origin must be a clean `https://` URL with no embedded credentials.
- `lib/gateway.mjs` — per-subject budget subject is `HMAC(SOREN_RATE_KEY,
  x-vercel-forwarded-for)` for unauthenticated calls; the budget claim precedes any
  provider call; cache writes reject authorization material and honor bounded TTLs.

### Gateway permissions (Supabase migrations)

`soren_gateway` is revoked from all sensitive tables and functions across migrations
0001-0005; only the five federation RPCs are executable by the gateway role (granted to
`service_role`, which the gateway key uses). Health, release-ingress and watcher
functions are explicitly revoked from `soren_gateway`. The non-production probe confirmed
the least-privilege posture empirically (cross-workspace binding denied 403/42501; anon
key alone denied; privileged RPCs denied; direct table read denied).

### Frozen routing labels (outstanding)

`tests/routing/evaluation-expectations.json` carries a 60-case frozen fixture whose labels
are developer-authored. `labelReview` is `developer_authored_human_review_pending`. One
revision (ROUTE-056, routing to `gsap-motion` from contract 2.5.0) is owner-approved
(2026-10-22) with its `recordedAt` corrected and audited; the approval timestamp is
unchanged. **Independent human review of the 59 remaining frozen labels is still
outstanding** and is listed as a pre-release approval below. An AI-assisted second-pass
screening is recorded in `docs/v3/routing-label-ai-triage.md`; it identified nine cases
for targeted discussion but is **not** human review or owner sign-off.

## Production gateway-store decision

Prepared in `docs/v3/production-gateway-store-decision.md`. Production must use a **new,
separate Supabase project** (never the non-production `xoyefnfesvrqsohuppxe`). The owner
must choose Option 1 (provision first, recommended) or Option 2 (accept degraded external
discovery) and confirm the plan/cost before any provisioning. **Not yet provisioned.**
On 2026-10-23, Supabase quoted an additional project at **$0/month** in the existing
Free-plan organization, but project creation was **rejected by its two-free-project quota**.
Existing `soren` (`INACTIVE`) and `soren-mcp-v3-gateway-preview` (`ACTIVE_HEALTHY`)
were not modified. Resolve the quota/organization issue before seeking provisioning
approval. Do not repurpose either existing project or reuse preview credentials.

## Two separately approved release stages

Per `docs/v3/production-activation.md`, the release is two independent changes, each with
its own approval and rollback:

- **Stage A — runtime replacement (flag off).** Deploy commit `30ac3e3` to production with
  `SOREN_V3_TOOLS` unset. Expected: 8 tools, 23 skill resources, contract 2.5.0.
- **Stage B — flag-on activation.** Only after Stage A is observed healthy (>= 24 hours),
  set `SOREN_V3_TOOLS=1` for Production and redeploy the same commit. Expected: 14 tools,
  75 resources.

Stage B must not be combined with Stage A into a single approval.

## Rollback target (preserved)

Full-runtime rollback target is the current live 2.4.0 deployment
`dpl_Dvmp9LTVEQLdQeMVDGAfRxBoK51b`
(`soren-shared-mcp-skills-c4gwbfcc3-sorensadr-gmailcoms-projects.vercel.app`, created
2026-10-22T11:14:02Z, aliased to `soren-shared-mcp-skills.vercel.app`). Verified unchanged
on 2026-10-23 (contract 2.4.0, 8 tools, 14 skill resources; matches
`docs/evidence/v3/live-inventory-before.json`). Do not rebuild or delete it; re-confirm it
is still the production target at activation time.

## Production configuration (V3-only)

- Set `SOREN_V3_TOOLS=1` only at Stage B.
- Keep TypeSafe paid advisory disabled: `SOREN_TYPESAFE_TOOLS=0`, `TYPESAFE_JEV_ENABLED`
  unset/false, no `TYPESAFE_API_KEY`.
- Keep OAuth 2.1 bearer identity deferred: do not set `SOREN_AUTH_AUDIENCE` /
  `SOREN_AUTH_RESOURCE` / `SOREN_AUTH_CLIENT_ID` at this stage.
- Store variables (if Option 1): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SOREN_GATEWAY_DB_KEY`, `SOREN_WORKSPACE_ID`, `SOREN_RATE_KEY`,
  `SOREN_CAPABILITY_MODE=public_only` (Production target only).

## Unresolved approvals (each blocks GO)

1. **Owner release approval** for the exact commit `30ac3e3` (Stage A), recorded in
   writing.
2. **Production gateway-store decision**: Option 1 vs Option 2; if Option 1, plan and cost
   confirmed, then a separate approval to provision.
3. **Production environment-variable approval**: exact names/values to set, and when.
4. **Independent review of the 59 frozen routing labels** (developer-authored, review
   pending). ROUTE-056 is already owner-approved.
5. **Stage B approval** (flag-on), separate from Stage A, only after >= 24 h healthy
   observation of Stage A.
6. **Confirmation that the recorded 2.4.0 rollback deployment is still the live
   production target** at the moment of activation.
7. **Owner-controlled production gateway credential renewal and expiry monitoring**:
   assign an operator and renewal schedule before placing any short-lived JWT in Vercel.
8. **Owner approval of staging URL access controls**: Vercel Authentication with
   Standard Protection, verified to protect generated URLs without gating the live
   public MCP production domain. See `docs/v3/production-credential-and-staging-plan.md`.

## Risks

- **External-discovery regression without a store (if Option 2).** Federated calls fail
  closed; this is a visible behavior change versus live 2.4.0. Mitigation: Option 1, or an
  explicit recorded acceptance.
- **Bearer clients.** If any existing client sends an `Authorization` header, it fails
  closed after the runtime replacement until identity is configured. Mitigation: confirm
  no client sends one before Stage A.
- **Upstream provider flakiness.** SkillsMP and the MCP registry have shown intermittent
  timeouts; the gateway degrades gracefully and enforces budgets, but external-discovery
  availability depends on third parties.
- **Deployment retention.** Confirm Vercel retention will not delete the recorded 2.4.0
  deployment during the observation window.
- **Production signing-credential expiry.** An owner-minted JWT with an expiration of up to
  seven days requires a tested renewal and redeploy process before it expires; otherwise
  federation can stop working even after a successful rollout.
- **Unprotected staging URL.** `--skip-domain` does not make the generated Vercel URL
  private. The production project currently has Vercel Authentication disabled. Standard
  Protection is the proposed owner-approved option; verify production aliases stay public.

## Verification still needed beyond the tested preview

These are production-side and require owner approval; none is done yet:

0. Before any production staging, resolve the dedicated production store and signing
   credential renewal procedure; obtain owner approval for Vercel Standard Protection
   and prove anonymous access to the **live domain** remains intact while a generated
   staged URL is access-protected. Prefer `vercel curl` for authenticated staging probes.
1. Stage A: build the release candidate from a clean checkout, deploy flag-off with
   `--skip-domain`, run `verify:mcp` against the staged URL (expect 8 tools / 23 skills),
   then promote and re-verify against the production domain; record the flag-off
   deployment ID.
2. One native client smoke call (`list_skills`, `route_task`) against production after
   Stage A.
3. Stage B (after >= 24 h): set the flag, redeploy the same commit, `verify:mcp` (expect
   14 tools / 75 resources), promote, re-verify, and one native client V3 call
   (`list_capability_profiles`, `plan_toolchain`).
4. Post-activation observation of error rates and latency for 24 hours per stage.

## Recommendation

**NO-GO today.** The code, evidence, security review and rollback plan are ready. Release
is blocked by owner approvals, the unresolved Supabase Free-plan project quota, the
independent human routing-label review, credential renewal and protected-staging
prerequisites. Stage A must not proceed until these are resolved and separately approved.
See `docs/v3/production-credential-and-staging-plan.md`.
