# Private registry and operations implementation

This implementation keeps public bundled skills independent from private persistence. Private features fail closed without configuration. There is no memory-backed substitute for Postgres. No production resources, scheduler, notification channel, OAuth application, signing root, or independent watcher were provisioned.

## Boundaries and configuration

`lib/security/auth.mjs` calls the configured Supabase `/auth/v1/user` endpoint with each supplied bearer token. Supabase verifies the token and session. The application then checks the verified token's issuer, subject, audience, expiry, not-before, exact `resource`, and allowlisted `client_id`. Supabase ordinary social sign-in tokens do not necessarily have the required application/resource claims. A configured OAuth authorization server and tested claims are prerequisites; token decoding is not signature verification.

Required private runtime environment names:

- `SUPABASE_URL`: HTTPS project origin without a path, credentials, query or fragment.
- `SUPABASE_ANON_KEY`: public Auth API key. It does not authorize private application operations.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only PostgREST credential. Never supply it to a browser or MCP client.
- `SOREN_GATEWAY_DB_KEY`: separate least-privilege server credential with PostgreSQL role `soren_gateway` and exact `workspace_id` claim. Public MCP never falls back to the service-role key.
- `SOREN_WORKSPACE_ID`: existing provisioned workspace UUID.
- `SOREN_AUTH_AUDIENCE`, `SOREN_AUTH_RESOURCE`: exact intended token bindings.
- `SOREN_AUTH_CLIENT_ID`: comma-separated allowlisted OAuth client IDs.
- `SOREN_MANAGEMENT_CLIENT_ID`, `SOREN_ADMIN_ORIGIN`: separate human management client and exact browser origin.
- `SOREN_REVIEW_POLICY_SHA256`: SHA-256 of the owner-approved current review policy; changed policy invalidates pending review submissions.
- `SOREN_SESSION_SECRET`: protected secret used by the management session implementation.
- `SOREN_CAPABILITY_MODE`: `public_only` by default; `private_enabled` explicitly requires private readiness.
- `CRON_SECRET`: at least 32 cryptographically random bytes generated in an authorized secret manager. Length checking does not prove entropy.
- `SOREN_ENVIRONMENT`: non-sensitive environment label, default `development`.
- `SOREN_GATEWAY_ORIGIN`: explicitly configured HTTPS gateway origin for bounded liveness probing; missing configuration produces UNKNOWN.
- `SOREN_AUTH_PROBE_TOKEN`: optional managed, least-privilege health reader token. Without it, auth-service liveness is distinct from UNKNOWN verified-identity health.
- `SOREN_UPDATE_PROJECT_ID`, `SOREN_UPDATE_ENVIRONMENT`: exact persisted updater target for read-only policy/pending-operation probes.
- `SOREN_WATCHER_CLIENT_ID`: exact independently provisioned observer OAuth client ID accepted by the receipt ingress.

The operations adapter confines the elevated key to named SQL RPCs. RPC names and all job classes are fixed in source. Authenticated and anonymous database roles have no mutation privileges on private tables and cannot call service-only RPCs. Operator-approved migration tooling must provision initial workspace/principal/membership records. No request can bootstrap itself as an owner.

`getGatewayStore` exposes only principal lookup, approved private retrieval, shared federation budget claims, and public metadata cache reads/writes. PostgreSQL independently denies that role all table reads/writes, management/review/publication RPCs, detailed operational state and updater RPCs. Its workspace-bound token is provisioned through an authorized identity/secret process; the repository does not mint an unreviewed custom JWT or borrow administrator credentials.

Human reviewer/owner authority comes from `principals.kind = human` and a separately provisioned active workspace membership. Agent read grants cannot include review, grant-administration or arming permissions. Human mutations additionally require the management client, authentication within 15 minutes, and matching browser Origin. Explicit invalid Authorization never falls back to a cookie or anonymous access. Revocation and expiry are checked on every operation.

## Registry and private assets

`lib/registry/identity.mjs` canonicalizes repository URL plus case-sensitive skill directory. Versions bind resolved commit and a SHA-256 manifest. Canonical JSON sorts object keys recursively, preserving digests across Postgres JSONB serialization. Files are manifest-bound UTF-8 assets, individually limited to 60,000 bytes, with 128 files and 2 MiB total. Traversal, encoded paths, absolute paths, alternate streams, backslashes, duplicates and missing SKILL.md are rejected.

The first implementation stores private file bytes inside RLS-protected `skill_files` rows. It creates no public storage bucket. Binary packages and remote file-fetch execution are deliberately absent. Any future object store adapter must retain the same live workspace/grant/approval/revocation checks and use a private bucket.

Stages, reviews, revocations, catalog membership and operation events are immutable. Approvals bind exact version/digest, human reviewer, policy digest, evidence reference, and expected review revision. Publication atomically switches an immutable catalog generation. A later reject or monotonic revocation blocks old generations too. Each private retrieval executes a fresh Postgres authorization check, then verifies manifest and file digests. Private content has no application cache.

`POST /api/admin/registry/stage`, `/reviews`, `/registry/publish`, `/registry/revoke`, and `/grants` are private management operations. They are not MCP tools. `DELETE /api/admin/grants` revokes an exact grant revision. `GET /api/admin/status` requires a human dashboard session; `/api/admin/health` accepts an explicit workspace `health:read` grant.

## Durable execution and health

Apply `supabase/migrations` in filename order. The SQL owns unique job intents, payload conflicts, database-time leases with monotonic fences, job attempt history, retries, observations, deduplicated incidents, public federation budgets and bounded public metadata cache. Fences are checked in the same transaction as state mutations. No advisory/session lock is used. A database fence cannot cancel an external network effect; release operations use the separate reconciliation controller.

`GET /api/cron/maintenance` authenticates before obtaining a store. It requires an already persisted `scheduler_profiles` row with entitlement evidence and owner consent. It claims at most four due retries plus seven fixed current jobs within a 35-second dispatch loop and 45-second handler budget. Every asynchronous step checks the remaining work budget; no later mutation starts after exhaustion. Lease TTL is at most 120 seconds. Job retry delays are 30 then 120 seconds, maximum three total attempts; the 600-second policy delay is retained for the final exhausted stage and does not authorize a fourth attempt. Authentication, invalid payload, policy denial and uncertain external outcomes do not automatically retry. A crashed third attempt becomes a visible dead letter with one deduplicated incident.

The seven job classes validate bundled content/local routing and configured gateway liveness; read the private workspace; distinguish Auth-service liveness from a real managed identity check; observe prior scheduler completion; inspect persisted updater mode, arming expiry and unresolved operation freshness; inspect the independent-watcher deadman; expire at most 100 public-cache and budget rows per operation; and perform one rotated provider check. Provider probes use fixed adapters, a fixed public keyword, shared durable quotas, a three-second deadline and captured Retry-After. Preferred rotation advances one provider each 30-minute slot; the budget profile advances at its actual dispatcher cadence. It never scans whole catalogs or activates content. Missing provider/OAuth/updater/watcher configuration produces UNKNOWN observations. A successfully completed observation job does not mean its observed component is healthy.

Health jobs cannot mutate credentials, ACLs, client configuration, approvals, releases, signed trust, or unrelated MCPs. Provider faults remain separate from core faults. Release probation still requires exact-artifact evidence from the separate release controller. Schedule registration is deliberately absent until platform entitlement and destination are verified.

The same fenced housekeeping job rolls up up to 100 expired raw observations into UTC daily component/environment totals before deletion. Raw observations expire after 30 days; daily aggregates expire after 180 days. Rollup and deletion commit atomically, so retries cannot count a sample twice. Each run deletes at most 100 old aggregates and reports whether raw cleanup remains. A large backlog takes further bounded runs to drain. Recent observations, other workspaces, grants, approvals, revocations, releases and decision/audit evidence remain outside this deletion path.

Each observation has a probe identity and scheduled slot. Unique workspace/component/environment/slot prevents duplicate deliveries counting twice. Three distinct consecutive fresh failures open an incident; two fresh successes resolve it. Out-of-order observations cannot move incident state backwards. Gaps reset streaks. Evidence older than three effective cadences becomes UNKNOWN. Provider faults remain DEGRADED and cannot alone authorize rollback. Ambiguous candidate/control network failure remains UNKNOWN.

Liveness has no dependencies. Public readiness exposes only capability mode, ready/status, observation timestamp and freshness. Private outages do not break public-only bundled mode. Detailed private observations remain authenticated. An absent heartbeat is unknown/stale. The cloud never claims a live desktop connection from a past receipt.

`scripts/health-once.mjs` probes liveness, readiness and the authenticated dispatcher heartbeat from an independent runner. Its environment names are `SOREN_WATCH_GATEWAY_URL`, `SOREN_WATCHER_ACCESS_TOKEN`, `SOREN_GATEWAY_FAILURE_DOMAIN`, `SOREN_WATCHER_FAILURE_DOMAIN`, optional `SOREN_WATCHER_CADENCE_SECONDS` (default 900), `SOREN_ENVIRONMENT`, and `SOREN_WATCHER_DELIVERY_ENABLED` (default disabled). Explicit delivery posts only to the fixed same-origin `/api/admin/health/watcher` path. The observer has `health:read` and narrowly scoped `receipts:write`, with no deployment, review, configuration or permission authority.

The owner must provision a scheduler profile with `watcher_principal_id`, exact `watcher_client_id`, separate `watcher_failure_domain`, `watcher_verified_at`, immutable `watcher_evidence_ref`, and actual `watcher_cadence_seconds`. SQL independently checks this binding, active observer membership and grant, fresh aligned slots, and the claimed dispatcher freshness. It persists immutable digest-bound receipts and gateway/scheduler/watcher observations. Repeated identical delivery returns its prior identity; a different payload in the same slot is a conflict. Revoked, unverified, wrong-client, wrong-domain, future, stale or misaligned reports are rejected. Three fresh missing-heartbeat samples create one warning incident while component status remains UNKNOWN. No external alert is sent.

Two endpoints in the same application do not establish independence. An Actions artifact alone does not deliver a database heartbeat. The disabled-by-default best-effort Actions workflow can run this script and save its redacted receipt/result. Delivery must be enabled explicitly and tested from the actual independent host. The script always leaves full `promotionEligible` false: a health receipt cannot substitute for exact-release identity, one-minute probation evidence, signing trust or the other release gates.

## Verification and current blockers

Run `node --test tests/security/*.test.mjs tests/registry/*.test.mjs tests/operations/*.test.mjs`. PGlite executes real PostgreSQL migrations/functions/constraints/RLS against a minimal Supabase auth/role shim. Tests cover idempotent claims, payload conflict, lease expiry/fence rejection, exact human approval, changed-byte denial, RLS isolation, grant revocation, canonical JSONB digest verification, atomic public quotas, unauthorized cache entries, duplicate health delivery, three-failure/two-success transitions, and bounded auth/body errors. Parallel JavaScript claims exercise atomic function outcomes in embedded Postgres; PGlite serializes its connection and does not prove a separate-session production race.

Hosted Supabase OAuth/session integration, independent Postgres sessions, private object-storage integration (not used), real scheduler registration/delivery, activated independent watcher delivery, notification delivery, live provider checks from the deployed maintainer, and production release activation remain BLOCKED or NOT_RUN. Missing credentials and entitlement are blockers, never PASS. No statement here establishes operational activation. A single deployment may expose globally injected environment variables to multiple functions; production secret confinement still needs a verified host configuration or isolated private credential boundary.
