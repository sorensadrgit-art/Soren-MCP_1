# Security, Permissions, and Non-Interference

## Public and private access

The existing public MCP can serve deliberately public bundled skills and strictly budgeted catalog metadata. It never exposes approval decisions, personal memory, raw logs, private skill files, credentials, or operational mutation methods. Rate-limit anonymous provider fan-out and enforce shared upstream quotas; public read-only does not mean cost-free or abuse-proof.

Private access uses a managed OAuth implementation compatible with the actual MCP client versions. Validate protected-resource metadata, PKCE, token issuer, intended audience/resource, expiry, and application grant. Current MCP guidance includes client metadata mechanisms; do not assume legacy dynamic registration is the only valid onboarding mechanism. Retain compatibility paths only when supported and tested. [S08–S10]

An invalid supplied token receives an authorization error; it must never be treated as “no token, use public fallback.” Tokens for another client/resource/workspace are denied. Standard provider OAuth scopes are not assumed to encode the application's custom permissions; maintain grants server-side and validate any custom claim mechanism before use.

## Roles

| Role | Allowed | Explicitly denied |
| --- | --- | --- |
| Anonymous caller | Public skill metadata/bundled reads under budget | Private reads, approvals, installation, maintenance mutation |
| Agent reader | Workspace-granted approved content, optional receipt submission | Human review authority, grants, signing, production changes |
| Human reviewer | Exact-version review within assigned workspace | Trust-root rotation or deployment unless separately granted |
| Workspace owner | Approvals, grants, policy/arming and pause | Bypassing higher platform controls |
| Health observer | Probes and redacted observations | Configuration repair, identity changes, deployment |
| Maintenance worker | Bounded housekeeping/job reconciliation | New skill approval, broad admin, unrelated client repairs |
| Release controller | Promote/rollback preauthorized exact target/artifact | Arbitrary code generation/execution, self-modifying policy |
| Signing operator | Protected release/root signing operations | Routine app request handling |

Separate identities and permissions even when an authenticated human owns the workspace. An agent acting as that human must not automatically inherit an interactive management approval session. Sensitive admin actions need an explicit interactive consent record, anti-CSRF protection for browser flows, and recent authentication as appropriate.

## Database and storage

Enforce row-level workspace isolation and transaction invariants. Test direct database access with the actual least-privilege roles, not just API response filtering. Elevated Supabase credentials bypass RLS and must remain confined to narrowly implemented operations; they are never a generic credential for user-scoped requests. Private object stores have no public listing. [S11]

Cache authorization-scoped records separately. Key by principal/grant revision, workspace, version and approval generation, and enforce revocation on reads. Anonymous caches contain only intentional public data. Do not emit raw SQL errors, stack traces, secret env names/values, prompt bodies, local paths, or private account IDs on public health endpoints.

## Scheduler controls

Authenticate `/api/cron/maintenance` using a high-entropy secret of at least 32 random bytes generated in the authorized secret manager. Vercel may use `CRON_SECRET`; compare securely and deny if unset. Provider-specific scheduler credentials authorize only known scheduled operations, never a generic “run command” body. [S01]

Reject arbitrary redirect destinations, file paths, shell text, dynamic module names, or arbitrary URLs in jobs. Targets come from the allowlisted policy and immutable release/skill identities. Schedule headers alone are not authentication. Use body/schema limits, request replay/intent handling, leases, and fenced commits.

## Source and content security

Fixed provider endpoints only; normalize and validate returned metadata before ranking/rendering. Block private/local IP targets and metadata endpoints if any future URL resolver is introduced; do not follow uncontrolled redirects. Validate path segments after decoding exactly once, deny traversal, junction escapes, absolute paths, null bytes, alternate data stream paths, and links outside approved extraction roots.

Treat all skill text, descriptions, logs, and retrieved repository documents as lower-trust data. Heuristic scans are advisory and cannot prove a skill benign. Never automatically follow a skill's request to ignore instructions, obtain secrets, widen permissions, or install a new tool. External package download/extraction occurs in an isolated staging location with strict size/file limits and no execution hooks.

## Build and signing safety

Review source and workflow changes before secret-bearing builds. Pin CI actions and installer dependencies to reviewed immutable versions. Production credentials must be absent from untrusted PR jobs. Do not use `pull_request_target` or a similar privileged event to run contributor-controlled code. Masking logs does not make it safe to expose secrets to arbitrary dependency scripts.

The preparation manifest contains hashes for drift/integrity only. It is not a trusted signature or a substitute for a release signing root. Provision trusted root identity separately, rotate by a defined owner process, and retain minimum secure versions/revocations across rollbacks.

## Health cannot grant permissions

Do not weaken Windows ACLs or Defender, restore a backdoor service, remove security controls, install kernel/software “optimizers,” or elevate account permissions to make health status green. Existing unrelated Open Design/PinchTab/codebase-memory errors stay out of automatic repair scope.

## Agent cooperation

Retain the six clients' own processes and roles. One concise managed router guide must acknowledge higher-priority instructions and native tool permissions. Installation cannot replace Superpowers, Soren.mode, Product Design, AI Software Architect, or other specialist packs. No recursive “route the routing” loops. The requesting agent remains responsible for choosing and executing permitted actions.

Read-only tool annotations are hints for clients, not an authorization firewall. Enforce actual mutation boundaries in server code and platform credentials. Similarly, four independent HTTP results do not prove LLM instruction compliance or shared repository write isolation. Use separate worktrees and a single integration owner for code changes.

## Secrets inventory for implementation

Resolve only necessary credential **names and locations**, never contents in this package. Expected categories: Vercel project linking/deploy identity; managed database/connection pool; OAuth app/server credentials; scheduler secret; public artifact verifier root; protected signing role; and an optional verified external watcher/notification destination. Use environment-specific stores. Missing access blocks that feature; it does not permit reusing another project's credentials.
