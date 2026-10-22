# V3 production activation and rollback plan

Status: **prepared, not executed.** Nothing in this document has been run against production. Every step below needs the owner's explicit approval for the exact commit and deployment. The draft PR stays a draft, and `SOREN_V3_TOOLS` stays unset in production, until that approval exists.

## Two different changes

Activating V3 in production is two separate changes. Treat them separately, approve them separately and roll them back separately.

| Change | What it does | How it is undone |
|---|---|---|
| **A. Runtime replacement** | Replaces the live 2.4.0 deployment (built from the non-git folder `C:\Users\soren\Projects\soren-shared-mcp-skills`) with a build of this repository at the approved merge commit, flag **off**. | **Full runtime rollback**: promote the exact recorded 2.4.0 deployment. |
| **B. Tool flag** | Sets `SOREN_V3_TOOLS=1` on the already-replaced runtime, adding six advisory tools and 52 resources. | **Tool-flag rollback**: promote the flag-off deployment of the same commit (or unset the flag and redeploy). |

A tool-flag rollback does **not** restore 2.4.0. After it, production still runs contract 2.5.0 with 22 skills, the stricter ranking, the hardened gateway and the capability-plan fields. Only a full runtime rollback restores the previous behavior.

## What the runtime replacement changes, even with the flag off

The live runtime and this repository are different codebases (`docs/v3/drift-reconciliation.md`). Replacing one with the other changes:

1. **Contract and inventory.** `serverInfo.version` goes from 2.4.0 to 2.5.0. Skill resources go from 14 to 22. Three existing skills (`gsap-motion`, `react-three-fiber`, `threejs-production`) have new content with unchanged frontmatter. The eight tool names, order and annotations stay the same.
2. **Tool schemas (additive).** `route_task` gains `discovery: "auto"`, `preferred_skills`, `unavailable_skills` (any of the 22 skill names), `include_capability_plan`, `capability_context` and `decision_engine`. `read_skill` gains optional `privateVersion`. Existing calls stay valid. Requests without the new fields return the legacy response shape.
3. **Ranking.** Tag matching requires every word of a tag (live matches any word), and the expanded skills add tags. Some tasks route to a different primary skill, for example ROUTE-056 now routes to `gsap-motion` (see `tests/routing/evaluation-expectations.json`).
4. **External discovery needs the shared gateway store.** Federated `route_task` (the default discovery mode), `search_skills` with `scope: "all"`, `discover_skills`, `inspect_candidate` and `search_mcp_servers` all go through `guardedProviderCall`. Without the store and `SOREN_RATE_KEY`, they fail closed with `shared_provider_budget_unavailable`: route_task and discovery return local results with every provider marked unavailable, and `inspect_candidate` and `search_mcp_servers` return a tool error. Live 2.4.0 calls providers directly, so **without a store this is a visible regression for external discovery.**
5. **Bearer identity needs the store.** Any request carrying an `Authorization` header is validated. A malformed header returns HTTP 401. A well-formed bearer token without a configured store returns HTTP 503 `private_identity_unavailable`. Clients that send a bearer token today would stop working until the store and identity configuration exist.
6. **Request bounds.** Cross-origin browser requests return 403. Bodies over 16 KiB return 413.

A local production build of the candidate (`docs/evidence/v3/preview/live-vs-candidate.md`) and the isolated Vercel preview of `850df17` (`docs/evidence/v3/preview/vercel-preview.md`) were compared with live production; both confirm items 1 to 6. Precondition 4 below is met for `850df17` and must be repeated if the merge commit differs.

## Shared gateway store requirements

External discovery and bearer identity need one store shared by every serverless instance, so the per-subject budget and cache are enforced across the deployment. Production needs:

- A Supabase project with `supabase/migrations/0001_private_control_plane.sql` through `0005_health_retention.sql` applied. Migration 0001 defines the gateway RPCs `get_principal_context`, `read_private_version`, `claim_federation_budget`, `get_federation_cache` and `put_federation_cache`; the gateway role may call only these.
- Production environment variables: `SUPABASE_URL` (an `https://` origin with no path or credentials), `SUPABASE_ANON_KEY`, `SOREN_GATEWAY_DB_KEY` (gateway-role key, never the service-role key), `SOREN_WORKSPACE_ID` (UUID), `SOREN_RATE_KEY` (at least 32 random characters) and `SOREN_CAPABILITY_MODE=public_only`.
- Optional TypeSafe advice stays off: leave `TYPESAFE_JEV_ENABLED` unset unless separately approved (`docs/typesafe-jev.md`).

Previews and local tests must never point at the production store. Without these variables the runtime is still safe (fail closed), but item 4 and item 5 above apply. The owner must choose one of two options before step A:

- **Provision the store first** (recommended). External discovery and bearer identity keep working.
- **Accept degraded external discovery.** Record that decision, and confirm with client owners that no client sends a bearer token.

## Preconditions

1. PR #6 is reviewed (code and security), marked ready by the owner and merged to `main` by the owner. Record the merge commit SHA.
2. CI on the merge commit passes, including the explicit steps in `.github/workflows/quality.yml`: typecheck, knowledge hash drift, both routing evaluations, flag-off and flag-on MCP contract verification, unit tests, build and browser tests.
3. `npm run knowledge:hash` reports no drift. No knowledge entry is stale on the activation date.
4. The isolated preview (separate Vercel project, non-production configuration) passed `verify:mcp` with the flag on and off, and the live-vs-preview comparison has no unexplained difference.
5. The store decision above is recorded, and, if provisioning, the store is migrated and the production variables are set **before** step A.
6. The Vercel project settings for `soren-shared-mcp-skills` (team `team_4EjLBPTV0cEpjMytwNJlggaW`) are checked for this repository: framework Next.js, Node.js 22 or newer, default build command, root directory `.`. These settings were created for the deploy folder and are not guaranteed to match.

## Step 0: preserve the exact current production deployment

The live deploy folder is not under Git and may have changed since it was deployed. **Do not rebuild it for rollback.** Rollback must promote the exact deployment that serves production now.

```powershell
vercel ls soren-shared-mcp-skills --prod --scope team_4EjLBPTV0cEpjMytwNJlggaW
vercel inspect https://soren-shared-mcp-skills.vercel.app --scope team_4EjLBPTV0cEpjMytwNJlggaW
```

Record in the release notes: the deployment ID (`dpl_...`), its unique deployment URL, creation time and the production aliases. Then capture its MCP inventory:

```powershell
node scripts/capture-mcp-inventory.mjs https://soren-shared-mcp-skills.vercel.app/api/mcp .local/prod-before.json
```

Compare `toolsSha256`, `resourcesSha256` and `instructionsSha256` with `docs/evidence/v3/live-inventory-before.json`. If they differ, production changed since this plan was written; stop and re-run the drift review.

Confirm in Project Settings that deployment retention will not delete the recorded deployment during the observation period. Do not delete or redeploy it.

## Step A: replace the runtime (flag off)

Run from a clean checkout of the exact merge commit, not from the deploy folder.

```powershell
git clone https://github.com/sorensadrgit-art/Soren-MCP_1.git soren-release
cd soren-release
git checkout <merge-sha>
npm ci --ignore-scripts
vercel link --project soren-shared-mcp-skills --scope team_4EjLBPTV0cEpjMytwNJlggaW --yes
vercel pull --environment=production --yes
vercel build --prod
vercel deploy --prebuilt --prod --skip-domain
```

`--skip-domain` stages a production build without moving the production domain. Confirm that `SOREN_V3_TOOLS` is **not** set in the production environment before building. Then verify the staged deployment URL:

```powershell
npm run verify:mcp -- https://<staged-deployment-url>/api/mcp
```

Expect 8 tools, 22 skill resources and no V3 tools. If the store is provisioned, the optional discovery checks should pass; if not, they should report `shared_provider_budget_unavailable`. Then promote:

```powershell
vercel promote https://<staged-deployment-url> --scope team_4EjLBPTV0cEpjMytwNJlggaW
npm run verify:mcp -- https://soren-shared-mcp-skills.vercel.app/api/mcp
```

Record the flag-off deployment ID. From one native client (for example Factory Droid), call `list_skills` and `route_task` and record the results.

## Step B: enable the tool flag

Only after step A has been observed healthy (at least 24 hours):

1. In Project Settings → Environment Variables, add `SOREN_V3_TOOLS=1` for **Production** only.
2. Build and stage the same commit again with `vercel build --prod` and `vercel deploy --prebuilt --prod --skip-domain`.
3. Run `npm run verify:mcp -- https://<staged-deployment-url>/api/mcp`. Expect 14 tools, 74 resources (22 skill, 44 knowledge, 8 recipe) and all V3 checks passing.
4. Run `vercel promote https://<staged-deployment-url>` and repeat `verify:mcp` against the production URL.
5. From one native client, call `list_capability_profiles` and `plan_toolchain`, and record the result as a `verified` observation.
6. Watch error rates and latency for 24 hours. The local p95 reference was about 9–18 ms per V3 call over loopback; production adds network time.

## Rollback

### Tool-flag rollback (undo step B only)

Use this when the V3 tools misbehave but the 2.5.0 runtime is healthy.

```powershell
vercel promote https://<flag-off-deployment-url-from-step-A> --scope team_4EjLBPTV0cEpjMytwNJlggaW
```

Then remove `SOREN_V3_TOOLS` from the production environment so later builds stay flag off. Verify with `verify:mcp`: expect 8 tools and 22 skill resources. Production still runs 2.5.0.

### Full runtime rollback (undo steps A and B)

Use this when the replaced runtime itself misbehaves (for example external discovery or a bearer client breaks), or when the owner wants 2.4.0 back.

```powershell
vercel rollback <recorded-2.4.0-deployment-id-or-url> --scope team_4EjLBPTV0cEpjMytwNJlggaW
node scripts/capture-mcp-inventory.mjs https://soren-shared-mcp-skills.vercel.app/api/mcp .local/prod-after-rollback.json
```

Confirm `serverInfo.version` is 2.4.0 and that `toolsSha256`, `resourcesSha256` and `instructionsSha256` match the Step 0 capture. After `vercel rollback`, Vercel stops assigning new production deployments to the domain until a deployment is promoted again; this protects the restored deployment from an accidental redeploy. Remove `SOREN_V3_TOOLS` from production so a later promote does not re-enable the tools unintentionally.

Database state is not rolled back. The gateway store keeps its cache and budget rows; they do not affect 2.4.0, which never reads them.

Neither rollback touches client configurations. `docs/rollback.md` describes the signed release controller, which is a separate, owner-gated path; the steps above are the manual Vercel path for this activation.

## Out of scope

Client attachment of third-party MCP servers is a per-client user action (`docs/v3/client-attachment-plan.md`). It is not part of server activation.
