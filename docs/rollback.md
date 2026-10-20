# Release rollback and uncertain outcomes

Record an immutable operation intent before any provider call. The durable key and payload hash identify one stage/promotion/rollback. Another payload under that key is rejected. One unresolved intent per project/environment prevents overlapping release mutations. Database-time leases use monotonically increasing fences. Owner pause invalidates a pending send; an already-sent request still needs reconciliation.

After a timeout, retain `UNKNOWN_OUTCOME`. Do not invoke deployment/promotion again. Run:

```powershell
node scripts/reconcile-release.mjs --input <exact-candidate-directory> --intent <intent-key>
```

Reconciliation inspects the exact deployment, project, artifact bytes and production aliases. Stage reconciliation finds the immutable operation ID in a bounded project deployment scan and binds its returned deployment ID once. If no unique verified match exists, state remains unknown. Vercel's asynchronous APIs do not provide a definitive not-applied guarantee merely because the old parent still routes traffic. The adapter therefore does not turn an ambiguous old alias into permission to retry.

A rollback is eligible only during the release's 30-minute probation window. A core-contract/integrity failure, or three distinct fresh local-functionality failures, must be corroborated independently while the previous/control deployment is healthy. Provider-only failures, repeated copies of one probe, stale observations or a failing control cannot authorize rollback.

The previous package is reverified through maintained Sigstore/TUF verification. It must match the durable previous manifest/artifact, be authorized, unrevoked, above the minimum secure release sequence, within the current schema range and bound to the same project/environment. Never choose an arbitrary older package or automatically reverse database writes, migrations, approval history or revocations.

A historical manifest's original promotion expiry may have elapsed. Only the exact durable predecessor previously recorded as stable can use this exception during the current probation window. Its signatures and actual artifact bytes are reverified now; current revocations, schema, security minimum and owner/armed authority still apply. Stage and promotion never inherit this historical exception.

```powershell
node scripts/rollback.mjs --input <verified-previous-candidate-directory> --release <current-probation-release-id> --manual
```

The current Vercel adapter requires explicit manual authority because the provider has no atomic expected-parent CAS. Automatic Vercel rollback remains disabled. The controller supports bounded automatic rollback only for a provider whose verified capabilities and owner-armed policy permit it.

Before the manual rollback command, an owner records a short-lived `manual_rollback` authorization through `node scripts/release.mjs --authorize --request <owner-authorization.json>`. The server binds the exact known-good target and current parent. The `--manual` flag alone conveys no authority.

The durable controller consumes the one permitted rollback attempt before the provider side effect. Success enters `observe`, clears arming, starts a 60-minute cooldown and records scheduler reconciliation. Failure/unknown outcome pauses updates. An unknown attempt is reconciled rather than repeated. If the previous release is unsafe, retain the safest available read-only mode and request owner action.

Inspect the resulting alias and core-tool evidence, then inspect effective cron definitions against the persisted schedule digest. The controller records drift for operator handling; it does not silently rewrite a schedule or purchase higher monitoring cadence. The independent heartbeat watcher remains essential because code rollback can restore an old cron definition. Keep every failed release, incident and operation record.

Local rehearsal validates fault classification, revocation/security/schema denials, singleton operations, stale fences and unknown-outcome recovery. Hosted provider execution, one-minute independent probation, authentic signing negative corpus and a real production rollback were not run. No production rollback is claimed.
