# Production gateway store: decision brief (not provisioned)

Status: **decision prepared, awaiting owner approval. Nothing here has been provisioned or purchased.**

The production runtime must not reuse the non-production store. The non-production
project `xoyefnfesvrqsohuppxe.supabase.co` is for previews and tests only; it shares no
project, key or database with production. Production needs its own isolated Supabase
project.

## Why a store is needed at all

With the V3 runtime (contract 2.5.0), external discovery and any bearer-identity request
go through the shared gateway so that per-subject budgets and caches are enforced across
every serverless instance. Without a store these paths fail closed
(`shared_provider_budget_unavailable`): `route_task` and `discover_skills` return local
results with every provider marked unavailable, and `inspect_candidate` /
`search_mcp_servers` return a tool error. Live 2.4.0 calls providers directly, so running
the new runtime without a store is a **visible regression for external discovery**.

## The decision the owner must make before step A

Choose exactly one:

- **Option 1 — Provision the production store first (recommended).** External discovery
  and (when separately approved) bearer identity keep working after the runtime
  replacement.
- **Option 2 — Accept degraded external discovery.** Record the decision explicitly, and
  confirm with client owners that no client sends an `Authorization` header, before
  proceeding.

## Requirements if provisioning (Option 1)

- A **new, separate Supabase project** for production (different project ref from
  `xoyefnfesvrqsohuppxe`).
- Apply migrations `supabase/migrations/0001_private_control_plane.sql` through
  `0005_health_retention.sql` in order. Migration 0001 defines the gateway RPCs
  (`get_principal_context`, `read_private_version`, `claim_federation_budget`,
  `get_federation_cache`, `put_federation_cache`); the `soren_gateway` role may call only
  these five. Everything else is revoked from `soren_gateway`.
- Provision a least-privilege `soren_gateway` credential with an exact `workspace_id`
  claim. Never use the service-role key in the runtime.
- ES256 signing key generated and held owner-side; the runtime receives only a
  short-lived, workspace-bound JWT (7 days or less), verified against the public JWKS
  before use. The private JWK never enters any agent workspace or repository.
- Production environment variables (Production target only):
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SOREN_GATEWAY_DB_KEY`, `SOREN_WORKSPACE_ID`,
  `SOREN_RATE_KEY` (>= 32 random chars), `SOREN_CAPABILITY_MODE=public_only`.
- Network: the runtime reaches the store over HTTPS from Vercel serverless; the store is
  reachable only through PostgREST RPC with the gateway role (no direct table access).

## Cost (confirm before provisioning)

Provisioning creates a real, billed Supabase project. Exact cost depends on the chosen
Supabase plan and region and is **not** asserted here. The owner must confirm the plan
and any monthly cost in the Supabase dashboard before approving. A separate Vercel
production deployment already exists and is not a new cost. No paid TypeSafe inference is
part of this decision.

## Reuse of the non-production store is explicitly rejected

Do not point production at `xoyefnfesvrqsohuppxe` or reuse its keys. Reasons: isolation
of production data and budgets from test traffic; independent rotation and revocation;
clean blast radius if the non-production store is torn down or compromised.
