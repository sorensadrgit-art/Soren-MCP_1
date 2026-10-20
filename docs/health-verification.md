# Health verification

The implemented health plane is not activated in production. No hosted scheduler profile, real dispatcher heartbeat or independently scheduled watcher delivery has been verified. Public liveness and bundled readiness work without the private store. Missing private credentials produce explicit unavailable/unknown states.

The local PostgreSQL suite executes migrations and durable RPCs. It checks idempotent intents, conflicting payloads, lease expiry and fences, bounded retry/dead letters, overlapping delivery, per-component freshness, stale UNKNOWN, three distinct failures to open an incident and two successes to recover. These are actual embedded PostgreSQL executions. The separate native PostgreSQL CI job uses independent backend connections; its result is recorded separately when available.

The dispatcher covers gateway/bundled checks, private database/auth liveness, release policy/pending freshness, scheduler heartbeat, watcher deadman, a rotated bounded provider probe and cleanup. An auth liveness response alone does not establish a verified user identity. Provider outages stay separate from local contract faults. Readiness does not imply owner approval or release eligibility.

Watcher receipt ingress is restricted to the fixed provisioned observer identity. It validates the owner-reviewed profile, workspace, environment, scheduled slot, observed time and failure domain, persists a deduplicated receipt and uses a database fence. Duplicate or conflicting deliveries cannot invent a new observation. The delivered GitHub watcher is disabled by default and runs at 15-minute best-effort cadence when explicitly enabled. It cannot satisfy the release requirement for fresh independent probes at intervals of at most 60 seconds.

The local watcher command can deliver only to its fixed authenticated receipt endpoint when delivery is explicitly enabled. Its result separates observed gateway health from whether the watcher contract is established. It never claims production promotion eligibility.

Activation requires the actual scheduler entitlement and budget, owner-approved profile and failure-domain evidence, provisioned least-privilege identities, a real scheduled dispatcher result, an independent watcher result and observed stale-heartbeat incident/recovery. The current proposal does not purchase capacity or silently enable schedules. See `operations-implementation.md` for provisioning and retention limits, and `acceptance-matrix.csv` for the remaining gates.
