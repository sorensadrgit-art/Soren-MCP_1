# Dashboard and Agent Navigation

Preserve the existing dark, premium, restrained visual direction. This is an operations product: strong type, clear status, and reliable actions take priority over cinematic effects. No WebGL, animated video, or heavy background rendering is necessary.

## Information architecture

**Connect:** client detection/version, ownership mode, effective scope, merge-only plan, exact connection states, copy/manual fallback, verify action and last observed timestamp.

**Discover:** approved matches first, public query preview, source status, ranked external candidates, no auto-adoption. Make source/path/revision visible on inspection; label MCP servers separately from skills.

**Library:** approved version, approval scope, source revision, digest, supporting files, published generation, and revocation state. No “latest” synonym for approved.

**Reviews:** exact old/new content and capability/license diff, independent scan evidence, reviewer identity, clear approve/reject action bound to the displayed digest. Re-fetch/version-check on submission; show conflict if the candidate changed.

**Health:** component-by-component observations, timestamps, stale/unknown badges, independent watcher state, scheduler cadence and entitlement, incident/recovery timeline. Never infer live desktop status from the cloud.

**Updates:** separate lanes, observe/armed/paused, exact policy digest, expiring owner grant, current candidate and verified artifact, stage/probation/rollback, spending/quotas, clear owner pause control.

## Required interaction states

Every network flow has loading, partial result, empty, permission denied, retry/cooldown, stale, and failure states. Retry UI must use the existing intent and not create duplicate approvals/promotions. Buttons show the actual operation target and require permission, not merely frontend visibility.

Copy actions show success only after clipboard write resolves; otherwise provide selectable text with a precise fallback. Generated config snippets include exactly one endpoint. The page instructs users to merge the Soren entry, not replace an entire file.

A manual refresh queries state; it must not reinstall, update, or restart a client. Selecting a different client cannot rewrite a configuration. Pausing updates cannot disable ordinary read-only skill use.

## Performance and accessibility

Use existing Next.js and lightweight components. Lazy-load review diffs/history; paginate large tables; cancel stale search requests; avoid loading full skill instructions during search. No global polling more frequent than the configured cadence; background tabs should not keep expensive provider refreshes running.

Target WCAG 2.2 AA for audited surfaces: semantic labels, visible keyboard focus, suitable contrast, non-color-only states, sensible reflow/zoom, reduced motion, and usable error announcements. Validate real rendered UI on desktop and mobile-width views. Record evidence, not an unqualified conformance promise.

## Agent-side guide

The host should discover the server contract and select a single routing step for a substantive task. Approved reads are optional reference, not system instructions. Unknown provider content is inspection data only. Return concise explanations and next actions that name actual available tools; never invent automatic installation tools or tell an agent to ignore project rules.

Descriptions must distinguish `list_providers.configured` from a successful fresh provider probe. Returned `runtime` is an echo/compatibility field, not cross-agent authentication. Tool annotations are accurate hints; enforcing scopes happens in server authorization.
