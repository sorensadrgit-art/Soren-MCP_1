# Operator Runbooks

## Pause automatic updates

Open the authenticated Updates panel. Confirm the project/environment, choose Pause, and verify a new policy generation plus an attributable event. In-flight work must recheck authority before side effects and reconcile any already-sent operation. Bundled read-only skills and health observations continue. Do not remove cron jobs just to pause promotions.

## Provider starts returning 429/timeouts

Inspect provider-specific status and Retry-After. Keep bundled skills active. Reconcile shared quota and cached query reuse. Pause only that provider's expensive lookups during cooldown. Do not promote a different source, rotate credentials, disable authentication, or roll back the whole app solely for a provider outage.

## Scheduler heartbeat missing

Check effective schedule/entitlement, last successful due-slot, independent watcher, and recent deployment/rollback. Mark UNKNOWN/stale. Reconcile due work idempotently through an authorized manual invocation. Do not create a Windows task as a fallback. If no independent observation is available, pause auto-promotion.

## Deployment response timed out

Set UNKNOWN_OUTCOME; record the attempted exact artifact and provider operation ID. Inspect current deployment and alias state. If already applied, complete verification for that artifact. If definitely not applied, retry only with the same intent under a fresh valid lease. If ambiguous, pause and escalate; do not launch repeated deployments.

## Recent release fails core checks

Confirm candidate-specific failure with control and independent observations. Validate the previous artifact against revocations, minimum secure version and current schema. If eligible, perform the one permitted rollback, verify aliases/core skills, reconcile cron definitions, then enter observe/cooldown. Retain evidence. Never automatically undo security revocations or database writes.

## A published skill is compromised

Revoke its exact version/digest in the private control plane. Retrieval checks revocation before cached content delivery. Stop serving the version and surface affected installations/receipts. Do not reactivate it during app/catalog rollback. Review a new source revision independently. Local removal may require an explicit installer operation; the cloud cannot guarantee deletion from an offline machine.

## Installer detects user changes

Do not overwrite. Present owned semantic changes and current checksum. Re-plan against the current effective configuration, preserving unrelated data. Unknown client version means inspect-only until the adapter is verified. Removal only affects unchanged installer-owned entries.

## Antigravity/OpenCode/Qwen has an unrelated MCP issue

Record evidence and identify the distinct server. Do not disable or alter it under the router's maintenance policy. Verify Soren directly if the client supports a target-specific check. Never relax executable identity checks, ACLs, Defender, or browser security to make the aggregate list green.

## First production activation

Verify source/artifact identities, completed acceptance matrix, actual scheduled delivery, secret isolation, owner permissions, and rollback rehearsal. Deploy tested code into production through the documented exact-artifact path. Start in observe. Arming is a separate explicit owner operation over the exact policy, stable channel, entitlement, signing root and expiry.
