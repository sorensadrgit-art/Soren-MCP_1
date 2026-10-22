# Non-production gateway store: readiness and provisioning runbook

Status: **prepared, not provisioned.** No Supabase project, database credential or environment variable has been created for this. Every step marked **Approval** needs the owner's explicit go-ahead first, because it creates an account resource, a credential or a cost.

The goal is one isolated Supabase project that acts as the shared gateway store for previews and tests: migrations 0001 to 0005, federation budgets and caches, and identity lookups, reachable only through the least-privilege `soren_gateway` role. It must never share a project, key or database with production.

## What is already verified locally

| Check | Result | How |
|---|---|---|
| Migrations apply in sorted order | PASS | `npm run test:db` (PGlite), 11/11 |
| Gateway role can call only its five RPCs, cannot read tables, review, publish or call updater RPCs | PASS | `tests/operations/gateway-role.test.mjs` |
| Federation quotas serialize the aggregate cap; cache rejects authorization errors | PASS | `tests/operations/database.test.mjs` |
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

1. **Approval: create the project.** A new Supabase project in an organization that holds no production data. The Free plan is enough for this load; it allows two active projects and pauses inactive ones. Confirm the plan and any cost before creating it. Record the project ref and region.
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
4. **Approval: create two Auth users** in the new project: one human owner and one agent identity. Record their user UUIDs. No passwords or tokens go into the repository.
5. **Seed** with `supabase/nonprod/seed-gateway-test.sql`. The header shows the psql variables. The issuer is `https://<ref>.supabase.co/auth/v1`. The agent gets `skills:read` for 7 days.
6. **Approval: credentials.**
   - `SOREN_RATE_KEY`: at least 32 random bytes, for example `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, written straight into the secret store.
   - `SOREN_GATEWAY_DB_KEY`: a JWT with payload `{"role":"soren_gateway","workspace_id":"<SOREN_WORKSPACE_ID>","exp":<now + 7 days>}`. Supabase accepts a self-minted JWT only if it is signed by a key the project trusts. Either use the project's legacy JWT secret (HS256), or import a key created with `supabase gen signing-key --algorithm ES256` and sign with its `kid` ([Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)). Both options handle signing material, so the owner chooses one and performs it.
   - `SUPABASE_ANON_KEY`: the project's anon or publishable key.
7. **Probe the real store** from a shell that holds only the gateway variables (no service-role key):

   ```powershell
   $env:SOREN_STORE_TARGET = 'nonproduction'
   $env:SOREN_PRODUCTION_SUPABASE_REFS = '<production ref, if one exists>'
   # SUPABASE_URL, SUPABASE_ANON_KEY, SOREN_GATEWAY_DB_KEY, SOREN_WORKSPACE_ID, SOREN_RATE_KEY,
   # SOREN_PROBE_SUBJECT (agent user UUID) and SOREN_PROBE_CLIENT_ID loaded from the secret store
   npm run verify:gateway-store
   ```

   The probe makes 10 checks. It resolves the seeded agent with `skills:read` only, and is denied for another workspace. The anon key alone is denied. Four elevated RPCs are denied with 403, and so is a direct table read. A budget claim succeeds. A 30-second negative cache entry round-trips, and a longer negative TTL is rejected. It writes one budget row and one cache row, and prints no credential values. Save the JSON output as evidence.
8. **Approval: attach to the protected preview** (optional, for end-to-end discovery tests). Add the five gateway variables to the Preview environment of `soren-mcp-v3-preview`, redeploy a preview-target deployment, and create a **new** automation bypass secret for the test run (the previous one is revoked). Expected change: the three `verify:mcp` WARNs for external discovery become PASS, because discovery no longer fails closed with `shared_provider_budget_unavailable`. Note that external discovery then makes real upstream provider calls, within the 30-per-minute budget. Revoke the bypass secret afterwards.

## Bearer identity: open design point

Store-backed identity (`lib/security/auth.mjs`) also needs `SOREN_AUTH_AUDIENCE`, `SOREN_AUTH_RESOURCE` and `SOREN_AUTH_CLIENT_ID`. A client token must carry `client_id` and `resource` claims, which standard Supabase Auth session tokens do not include. End-to-end bearer tests therefore need an identity design decision: Supabase's OAuth server, a custom access-token hook, or a separate issuer. Until that decision, bearer requests stay fail-closed (401 for a malformed header, 503 or 403 otherwise). That is the current, tested behaviour.

## Known gaps

- Nothing removes expired `federation_cache` rows or old `federation_budget_buckets` rows. The non-production store grows by about one row per subject per minute of use. Production needs a cleanup job before long-running use.
- `test:db:native` needs a local Postgres (`SOREN_TEST_DATABASE_URL` must be loopback) and runs only in CI here.

## Teardown

Delete the non-production project, or at least: revoke the imported signing key (or rotate the legacy secret), delete both Auth users, remove the preview environment variables and revoke any bypass secret created for testing.
