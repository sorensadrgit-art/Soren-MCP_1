# Non-production gateway store: readiness and provisioning runbook

Status: **prepared, not provisioned.** The one outstanding prerequisite is account access: an owner-held Supabase personal access token, which is never committed. Every step marked **Approval** also needs the owner's explicit go-ahead, because it creates an account resource, a credential or a cost.

The goal is one isolated Supabase project that acts as the shared gateway store for previews and tests: migrations 0001 to 0005, federation budgets and caches, and identity lookups, reachable only through the least-privilege `soren_gateway` role. It must never share a project, key or database with production.

## What is already verified locally

| Check | Result | How |
|---|---|---|
| Migrations apply in sorted order | PASS | `npm run test:db` (PGlite), 13/13 |
| Gateway role can call only its five RPCs, cannot read tables, review, publish or call updater RPCs | PASS | `tests/operations/gateway-role.test.mjs` |
| Federation quotas serialize the aggregate cap; cache rejects authorization errors | PASS | `tests/operations/database.test.mjs` |
| Bounded housekeeping purges expired federation cache and budget rows in 100-row batches behind a lease; the gateway role cannot call it | PASS | `tests/operations/retention-database.test.mjs` |
| Seed template (`supabase/nonprod/seed-gateway-test.sql`) creates a workspace, a human owner and an agent with `skills:read` only, and refuses a non-empty store | PASS | `tests/operations/gateway-nonprod.test.mjs` |
| Store probe (`scripts/verify-gateway-store.mjs`) passes against the seeded store through a PostgREST stand-in, fails when the gateway role is widened, and refuses production targets, the service-role key and mis-scoped gateway keys | PASS | `tests/operations/gateway-nonprod.test.mjs` |
| Independent native Postgres sessions (claims, fences, permissions) | CI only | `quality.yml` job `native-postgres` (postgres 17.11). No local Postgres on this workstation. |

The PostgREST stand-in maps the bearer JWT's `role` and claims onto the database session the way PostgREST does. It is not PostgREST itself, so step 7 below must be run against the real project.

## Isolation rules

- A **new** Supabase project, created for this purpose only. Never reuse the production project, its keys or its database.
- The gateway receives `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SOREN_GATEWAY_DB_KEY`, `SOREN_WORKSPACE_ID` and `SOREN_RATE_KEY`, and nothing else. The service-role key and the database password stay with the owner and are used only for migrations and seeding.
- `SOREN_GATEWAY_DB_KEY` carries `role: soren_gateway` and an exact `workspace_id`, with a short expiry (7 days or less for testing).
- Preview environment variables, if added, are scoped to the **Preview** environment of `soren-mcp-v3-preview`, never to Production and never to `soren-shared-mcp-skills`.

## Steps

1. **Approval: create the project.** A new Supabase project in an organization that holds no production data. The Free plan is enough for this load; it allows two active projects and pauses inactive ones. Proceed only while the organization plan is Free and the active project count is below two; stop for billing confirmation otherwise. Create it with the Management API (`POST /v1/projects` with the name, the organization id, region `us-east-1` and an owner-generated database password) or the dashboard. Record the project ref and region.
2. **Apply migrations with psql, in sorted order.** Use the owner database connection string (owner-held, not committed):

   ```powershell
   Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | ForEach-Object { psql $env:NONPROD_DB_URL -v ON_ERROR_STOP=1 -f $_.FullName }
   ```

   Two files share the `0002` prefix (`0002_operations_rpc.sql` sorts before `0002_updates.sql`, and the order matters). `supabase db push` keys migrations by version prefix and may reject the duplicate, so do not use it here. Do not rename the files either: production activation depends on the same set.
3. **Check the gateway role wiring:**

   ```sql
   select pg_has_role('authenticator', 'soren_gateway', 'member');  -- must be true
   select rolcanlogin, rolbypassrls from pg_roles where rolname = 'soren_gateway';  -- false, false
   ```

   If the first query is false, run `grant soren_gateway to authenticator;` as the owner.
4. **Approval: create two Auth users** in the new project: one human owner and one agent identity (dashboard, or `POST /auth/v1/admin/users` with the owner service key). Record their user UUIDs. No passwords or tokens go into the repository. Give the agent the `app_metadata` `client_id` it will present (see the hook design).
5. **Seed** with `supabase/nonprod/seed-gateway-test.sql`. The header shows the psql variables. The issuer is `https://<ref>.supabase.co/auth/v1`. The agent gets `skills:read` for 7 days.
6. **Approval: credentials.** The chosen scheme is an **owner-controlled imported ES256 signing key** (asymmetric is also required for OpenID Connect ID tokens, and the OAuth 2.1 server recommends it):
   - Generate an ES256 (P-256) JWK locally — `supabase gen signing-key --algorithm ES256` or Node's crypto — and keep the private JWK out of the repository, agent logs and deployment bundles (a gitignored local file is the minimum).
   - Import it: `POST /v1/projects/<ref>/config/auth/signing-keys` with `{algorithm: "ES256", status: "standby", private_jwk: <jwk>}`, then rotate it current: `PATCH /v1/projects/<ref>/config/auth/signing-keys/<key-id>` with `{status: "in_use"}`. Both follow the [JWT signing keys guide](https://supabase.com/docs/guides/auth/signing-keys); allow for the 5-minute guard between signing-key state changes. The previously current key stays valid until explicitly revoked.
   - `SOREN_GATEWAY_DB_KEY`: a JWT with header `{alg: "ES256", kid: "<key id>", typ: "JWT"}` and payload `{"role":"soren_gateway","workspace_id":"<SOREN_WORKSPACE_ID>","exp":<now + 7 days>}`. Never the service key; the activation preflight rejects that reuse.
   - `SOREN_RATE_KEY`: at least 32 random bytes, for example `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, written straight into the secret store.
   - `SUPABASE_ANON_KEY`: the project's publishable (or legacy anon) key.
7. **Probe the real store** from a shell that holds only the gateway variables (no service-role key):

   ```powershell
   $env:SOREN_STORE_TARGET = 'nonproduction'
   $env:SOREN_PRODUCTION_SUPABASE_REFS = '<production ref, if one exists>'
   # SUPABASE_URL, SUPABASE_ANON_KEY, SOREN_GATEWAY_DB_KEY, SOREN_WORKSPACE_ID, SOREN_RATE_KEY,
   # SOREN_PROBE_SUBJECT (agent user UUID) and SOREN_PROBE_CLIENT_ID loaded from the secret store
   npm run verify:gateway-store
   ```

   The probe makes 10 checks. It resolves the seeded agent with `skills:read` only, and is denied for another workspace (403). The anon key alone is denied. Four elevated RPCs and a direct table read are denied: HTTP 403 when PostgREST reports the permission error, or HTTP 404 when it hides the unprivileged object from the role's schema cache; both prove the denial. A budget claim succeeds. A 30-second negative cache entry round-trips, and a longer negative TTL is rejected. It writes one budget row and one cache row, and prints no credential values. Also run the refusal negatives and keep the output: with the service key present, with a gateway key bound to another workspace, and with `SOREN_STORE_TARGET` unset; each must print `REFUSED`. Save the JSON outputs as evidence.
8. **Approval: attach to the protected preview** (for end-to-end discovery tests). Add the five gateway variables to the Preview environment of `soren-mcp-v3-preview`, redeploy a preview-target deployment, and create a **new** automation bypass secret for the test run (the previous one is revoked). Expected change: the three `verify:mcp` WARNs for external discovery become PASS, because discovery no longer fails closed with `shared_provider_budget_unavailable`. External discovery then makes real upstream provider calls, within the 30-per-minute budget. Revoke the bypass secret afterwards.
9. **Approval: bearer identity for the preview** (design: `docs/v3/bearer-identity-design.md`). Enable the OAuth 2.1 server, register the agent OAuth client, deploy the custom access token hook, and add `SOREN_AUTH_AUDIENCE`, `SOREN_AUTH_RESOURCE` and `SOREN_AUTH_CLIENT_ID` to the Preview environment. Then authorized bearer tokens resolve the seeded agent, invalid tokens are rejected, and production authentication stays disabled.

## Bearer identity: designed, not enabled

Store-backed identity (`lib/security/auth.mjs`) needs `SOREN_AUTH_AUDIENCE`, `SOREN_AUTH_RESOURCE` and `SOREN_AUTH_CLIENT_ID`, and tokens must carry `client_id` and `resource` claims that Supabase's standard session tokens lack. The design that provides them — Supabase's OAuth 2.1 server for `client_id`, a custom access token hook for `resource` — is written in `docs/v3/bearer-identity-design.md` and is not applied anywhere. Until it is approved and applied, bearer requests stay fail-closed (401 for a malformed header, 503 or 403 otherwise). That is the current, tested behaviour.

## Growth and cleanup

- Expired `federation_cache` rows and old `federation_budget_buckets` rows are purged by `safe_housekeeping` (migration 0005, replacing the 0002 version): bounded to 100 rows per call, lease-fenced, and dispatched through the `cache_cleanup` job type by the maintenance component. The gateway role cannot call it.
- **Correction (2026-10-22):** an earlier draft of this section claimed nothing purged these rows. That was wrong, and this section now states what migration 0005 actually does.
- The non-production store has no scheduler, so nothing runs automatically: growth is bounded by actual use (roughly one budget row per subject per active minute, one cache row per distinct cache key) and cleanup is run on demand by the owner.
- `test:db:native` needs a local Postgres (`SOREN_TEST_DATABASE_URL` must be loopback) and runs only in CI here.

## Teardown

Delete the non-production project, or at least: revoke the imported signing key after rotating in a replacement, delete both Auth users, remove the preview environment variables and revoke any bypass secret created for testing.
