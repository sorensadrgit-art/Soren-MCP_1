# Full System Specification

## Outcome

Upgrade the existing router into a reliable service with a one-shot installer for six desktop clients, reproducible verification, durable private operational state, cloud health monitoring, and controlled automatic delivery of reviewed releases. Continue federated capability discovery through the existing MCP. Do not turn this project into a replacement agent harness, memory product, or generic remote-execution system.

## Release boundary

The core release contains: source-controlled baseline; six installer adapters; compatibility tests; protected operational database; OAuth-based private management; immutable skill/version approval records; health and incident pipeline; release/update controller; exact-artifact promotion/rollback; connection/health/update dashboard; documentation and repeatable evidence.

Private personal-memory migration, automatic repair of unrelated MCP servers, remote shell, and a permanently installed Windows updater service are excluded. Optional local skill assets may be installed only through the bounded installer path; they never execute as part of discovery.

## Architectural choice

Retain the existing Next.js application and Vercel runtime. Add cohesive modules within one codebase rather than new independently deployed microservices. Use Supabase Postgres and private storage for approvals, release identities, leases, operational records, and staged assets. Use existing authorized cloud CI for building and signing releases. A small independent watcher must observe the gateway from outside its deployment failure domain.

Adapters isolate external skill providers and desktop configuration differences. Database transactions own approvals, generation pointers, job claims, and incident state. The public MCP never receives deployment credentials or administrator privileges.

## Three operating surfaces

**Public data plane:** existing `/api/mcp`; eight stable read-only tools; four known-good bundled skills; deliberately public metadata. Full external federation has request, provider, and spend budgets. Degraded providers do not block bundled skill reads. No administrative mutation operation is exposed here.

**Private control plane:** authenticated dashboard and narrowly authorized `/api/admin/*` routes for registry reviews, update settings, grants, incidents, and maintenance controls. Scheduler endpoints are separately authenticated. A read-only agent token does not authorize reviews or deployments.

**Local installer:** trusted release artifact run explicitly on a user-approved machine. It detects supported clients, plans minimal changes, applies owned entries, proves effective connection, and exits. It cannot silently take over other MCPs or change machine security settings.

## Stable public behavior

Keep tool names and existing response fields/types compatible. Optional new metadata is permitted with schema tests; do not replace an existing array response with a different object wrapper. Make new capabilities explicit and discoverable in descriptions. Use host-qualified server names where needed, without inventing a universal namespace syntax.

Preserve existing `read_skill(name)` and `skill://<name>/SKILL.md` bundled behavior. Add optional private/version-pinned retrieval only after authorization is tested. When a private approved skill is available, return a fully specified revision and digest. Supporting file retrieval must be constrained to its approved manifest and must not accept arbitrary URLs or filesystem paths.

Introduce `auto` discovery as an optional mode for new clients: approved matches first, remote discovery when coverage is insufficient or explicitly requested. Retain established local/federated semantics for existing clients. Add exact-source/path/revision identity before increasing the catalog; display name alone is not identity.

## Installation guarantees

The default platform target is Windows 11 user scope. Adapter logic is platform-aware, but macOS/Linux support cannot be advertised without platform fixtures and native verification. No admin rights are required for the normal connection. A denied configuration operation remains denied.

Installing twice is a no-op after successful verification. Removing the installer reverses only its owned entries/managed section when they still match recorded post-install state. User changes are preserved and surfaced as a conflict. The transaction journal must not copy unrelated credentials into logs or cloud telemetry.

## Verification truth model

Distinguish `DETECTED`, `CONFIGURED`, `AUTHENTICATED`, `PROTOCOL_VERIFIED`, `TOOLS_AVAILABLE`, and `AGENT_INVOCATION_VERIFIED`. The last state needs a real benign invocation from the client under test. Simulated HTTP requests labeled with a client name do not prove native client behavior.

Maintain test outcomes `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED`, and `NOT_APPLICABLE` with timestamp, revision, method, environment, and evidence reference. Optional provider outages may be warnings; permission/isolation/contract failures are never optional warnings. Live GUI and clipboard actions require browser/desktop testing, not parsed HTML.

## Health maintenance guarantees

Run cloud checks only after scheduling capability, database access, and cost limits are resolved. Track liveness, readiness, bundled catalog, each provider, private auth/database, scheduler freshness, updater health, and last reported desktop connection independently. No heartbeat means unknown/stale, not healthy. The cloud cannot observe a closed local desktop without a voluntary report.

Keep probes non-destructive. Repairs are separately authorized, bounded, idempotent operations: reopen a cooled provider circuit after a successful probe, expire an invalid cache record, retry a safe queue operation under policy, or roll back a just-promoted release to an eligible known-good deployment. Never alter firewall, Defender, ACLs, OAuth grants, desktop tools, or agent instructions as an automated health repair.

## Update guarantees

Separate catalog metadata, skill instructions, application/dependencies, and local installer/client metadata. Metadata refreshes can be automatic. New instruction bytes always require new review. Dependencies can generate tested update proposals automatically; semver alone never qualifies them for unattended promotion. Cloud release promotion can be automatic only for an owner-armed channel and already-reviewed, authenticated, exact artifacts meeting the policy in `07_CONTROLLED_AUTO_UPDATER.md`.

Initial mode is `observe`. Work must implement and demonstrate `paused`, `observe`, and `armed` behavior. Switching to `armed` requires a recorded owner action after staging rehearsals. The unattended updater cannot change its own allowlist, signing trust, scopes, test thresholds, or kill switch.

## Quantified initial engineering targets

These are targets, not measured claims: warm local-only routing p95 <= 300 ms; warm bundled retrieval p95 <= 500 ms; federated routing total deadline 5,000 ms; per-provider deadline 3,000 ms; at most 3 providers and 8 returned external candidates; 16 KiB request-body cap; 650,000-byte upstream metadata cap; 60,000-byte individual instruction cap; 2 MiB staged package cap until separately reviewed expansion.

Cap anonymous expensive federation to 6 requests/minute per source address and 30/minute aggregate initially; authenticated callers default 30/minute each within the same upstream global budgets. Use application grant identity, not a caller-supplied runtime label, for private quotas. These limits must be configurable only through owner policy and tested behind a shared store; they are not a guarantee against denial of service.

Cache public query metadata for 600 seconds, negative outcomes for 30 seconds; do not cache 401 as a valid anonymous result. Reuse exact safe query results and collapse concurrent identical fetches. Include freshness and provider status. Private cache keys include authorization scope and approval generation; revoke before serving any cached private content.

## Release definition

One accepted production release includes working installation, tests, observable health jobs, proven update dry runs, a tested owner arming path, and rollback evidence. It does not need to have unattended promotion armed at handoff; report installed-but-observing accurately. If a paid entitlement, independent watcher, or signing root is unavailable, the appropriate feature stays unarmed and the release cannot claim unattended production maintenance.
