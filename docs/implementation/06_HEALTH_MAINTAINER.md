# Cloud Health Maintainer

## Responsibility

Observe the service, detect real operational degradation, maintain bounded housekeeping, and preserve the last safe working state. This module does not optimize Windows, repair unrelated MCPs, change security software, or install missing skills. It runs in cloud jobs only; no new desktop service or scheduled task is allowed.

## Independent component model

Record a separate status for `gateway`, `bundled_catalog`, `private_database`, `private_auth`, each external provider, `scheduler`, `release_controller`, and each client receipt. States are `HEALTHY`, `DEGRADED`, `UNHEALTHY`, `UNKNOWN`, or `DISABLED`. Include the observation time and evidence age.

A client receipt is a last-known claim from actual local verification. A laptop being off is not a broken MCP server. The cloud cannot assert live desktop state without a new explicit client observation.

### Probe design

| Probe | Behavior | Maximum effect |
| --- | --- | --- |
| Liveness | Fixed handler response; no dependency calls | Read-only, <=2 seconds |
| Bundled readiness | Validate tool/resource manifest and one known local-only route | Read-only, <=5 seconds |
| Private readiness | Least-privilege DB read and auth-metadata availability | Never create user data or fall back to anonymous private data |
| Provider probe | Rotating bounded public query using provider-specific budgets | No full catalog scans or content activation |
| Scheduler heartbeat | Last completed due-slot and next expected slot | Detect missed runs without incrementing falsely |
| Release health | Exact deployed artifact identity plus hard contract checks | Read-only; remediation separately gated |
| Desktop report | Installer receipt or native tool transcript | No unsolicited remote desktop control |

`GET /api/health/live` returns a minimal non-sensitive response. `/api/health/ready` exposes only capability-level status and freshness. Detailed evidence is private. Report readiness relative to declared mode: public-only mode may remain ready during private-control-plane outages; private-enabled readiness fails for private dependency failure even while bundled public tools remain available.

## Scheduler selection at installation

Verify actual platform entitlement and existing authorized monitoring/CI tools. Do not automatically upgrade a subscription.

**Preferred profile — frequent cloud operations:** Vercel Cron on an entitled plan, dispatcher every five minutes (`*/5 * * * *`). The dispatcher selects due jobs from Postgres; different tasks have different schedules. An independently hosted watcher observes the endpoint and dispatcher heartbeat.

**Budget profile — best-effort operations:** Vercel daily reconciliation (`23 7 * * *`, UTC) plus an authorized GitHub Actions read-only check at minutes `7,22,37,52` of each hour. This profile is explicitly best effort: GitHub scheduled work can be delayed/dropped, and Vercel Hobby does not support sub-daily cron. If no reliable independently hosted watcher is available, keep automatic production promotion unarmed. An Actions runner is not a guaranteed five-minute availability monitor.

Schedules in this document are proposed defaults, not jobs enabled by this package. Persist the chosen profile, timezone (UTC), entitlement evidence, owner consent, and effective cadence. Recompute freshness thresholds from the effective cadence; do not apply a five-minute stale threshold to a daily job.

Official constraints: Vercel does not retry failed cron invocations; duplicate/missed delivery and overlap are possible; rolling back a deployment can also roll back its cron configuration. Design around durable reconciliation, not exact-once delivery. [S01–S03, S05]

## Job classes and cadence

| Job | Preferred cadence | Budget profile |
| --- | --- | --- |
| Gateway/local contract probe | 5 minutes | Best-effort Actions 15 minutes |
| Provider health rotation | 30 minutes | At most hourly Actions or daily dispatcher, budget-bound |
| Registry update metadata check | 6 hours | Daily |
| Dependency proposal check | Daily, off the hour | Daily |
| Lease/queue reconciliation | 5 minutes | Daily plus explicit operator call |
| Retention cleanup | Daily | Daily |
| Full verification report | After release; daily bounded cloud suite | After release; scheduled daily if available |

Full native desktop/GUI tests are release/manual operations, not routine cron jobs. Do not repeatedly launch local browsers to monitor them.

## Durable execution and idempotency

Use a unique key `(jobType, environment, scheduledSlot, targetIdentity)`. Claim it transactionally with payload hash. Repeated delivery with identical intent returns the prior result or pending state. Same key with different payload is a conflict.

Acquire a lease with 120-second TTL, a 30-second renewal cadence where supported, and a monotonically increasing fence. Each invocation has a 45-second work budget and processes a bounded batch. A lease is evidence of current authority, not a guarantee against late external effects. Check it before and after operations; expired owners cannot commit state.

Default safe-job retry: at most three attempts, delayed 30, 120, then 600 seconds, respecting a larger upstream Retry-After. Authentication failures, permanent invalid payloads, and policy denials do not retry automatically. Interactive routing does not inherit this queue retry policy. Exhausted jobs move to a visible failed/dead-letter state with one incident.

For an external operation with unknown outcome, inspect the provider using its immutable operation reference before retrying. Never infer “not applied” from a timeout.

## Failure classification

- **Provider 429, timeout, or bounded catalog error:** mark that provider degraded, respect cooldown, preserve other providers and bundled skills. Do not roll back the application just because an upstream provider is unavailable.
- **Wrong tool/resource contract, wrong release identity, corrupt bundled file:** hard failure. Remove the candidate from promotion eligibility and escalate.
- **Private database/auth outage:** stop private mutations/retrieval; keep public bundled behavior independent where safe. No fallback to a shared admin account.
- **Watcher cannot reach both candidate and control:** ambiguous network failure. Mark UNKNOWN; do not automatically roll back.
- **No scheduler heartbeat:** UNKNOWN/stale incident, not a fabricated healthy observation.
- **Expired credential:** private actionable alert; do not auto-grant broader scopes or print the credential.
- **Failing unrelated client MCP:** attach diagnostic evidence only. It is not a Soren repair target.

## Incident state machine

`HEALTHY -> SUSPECT -> OPEN -> RECOVERING -> RESOLVED`, with `UNKNOWN` as an evidence state rather than a definitive outage. Open after three fresh consecutive hard-failure observations at the configured cadence. Resolve after two fresh successes. Each failed sample must identify its probe instance and slot; duplicate deliveries count once.

Deduplicate incidents by environment/component/failure class, not raw exception text. Maintain one durable dashboard notification, update existing incidents, and send one recovery notification. Escalate at most once per 30 minutes for a continuing incident. External email/SMS/chat channels remain disabled until the owner chooses a destination and completes a delivery test.

Store minimal redacted operational observations for 30 days, aggregates for 180 days, incident/release decisions for 365 days unless the owner's retention policy says otherwise. Approval and revocation records have separate retention and are not expired by cleanup.

## Independent watcher

The watcher must be outside the monitored deployment's failure domain and hold only read-only probe credentials. It checks both the gateway and the most recent successful dispatcher completion. Persist its own observation timestamp and scheduled-work freshness. Two handlers in the same Vercel application do not provide independence.

During Work admission, choose an existing authorized monitor that can meet the cadence. If none exists without a new expense, implement the watcher adapter and produce the exact owner setup requirement; keep unattended promotion disabled. This is a deployment capability gate, not a reason to silently purchase or mislabel availability.

## Safe remediation policy

Allowed automatically after integration tests: expire cache entries that fail their own digest checks; coalesce duplicates; retry eligible idempotent jobs; pause a failing provider temporarily; reopen it after a successful cooldown probe. Cleanup cannot delete published versions, legal/audit evidence, or active approvals.

Deployment rollback is not ordinary housekeeping. It belongs to the release controller, is allowed only for a recent promotion with strong attributable evidence and an eligible previous artifact, and is capped as specified in the updater document. Health probes never directly hold broad deploy credentials.

## Completion proof

Demonstrate one real scheduled run, one duplicate delivery, one lease expiry, one missed-heartbeat incident, one provider-degraded event that preserves local tools, and one recovery. Store actual observations—not hardcoded demo data—and label monitor activation date and selected cadence.
