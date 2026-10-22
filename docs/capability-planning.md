# Typed capability planning — opt-in implementation

## Scope and architecture decision

The user approved implementing the researched capability catalog on October 21, 2026. This change adds an opt-in planning projection to the existing `route_task` tool. It does not add a new tool, change the bundled skill resources, install any candidate library, register a connector, modify client configurations, or deploy the service.

The catalog and workflow recipes remain the reviewed source files under `docs/research/capability-catalog-20261020/`. The planner imports those immutable repository bytes, validates identities/references/DAGs, deep-freezes its internal data, and projects only relevant metadata. `catalogRevision` is a digest of the catalog, recipes and sources; it proves consistency, not trusted release signing.

Chosen design: deterministic capability selection plus a separately gated TypeSafe advisor for the existing curated skill recommendations. Alternatives were loading all instruction bodies or exposing a generic execution proxy; both would increase context and authority without meeting this task's boundaries. No dependency or database migration is added. Existing default responses are preserved when the new flag is absent or false.

## Call the existing tool

```json
{
  "task": "Analyze this confidential CSV without uploading it",
  "runtime": "codex",
  "discovery": "local",
  "include_capability_plan": true,
  "capability_context": {
    "domain": "data",
    "source_scope": "private"
  }
}
```

The response retains the original fields and adds `capabilityPlan`. The plan reports DuckDB as a runtime candidate, appropriate validation guidance, a bounded workflow, source references, and `NEEDS_RUNTIME`. It does not claim that DuckDB is installed. `planOnly` is always true and `executionAuthorized` is always false.

Optional `capability_context` fields:

| Field | Values/meaning |
|---|---|
| `domain` | `assistance`, `research`, `data`, `development`, `automation`; otherwise infer conservatively |
| `source_scope` | `public`, `provided_only`, or `private`; new planning defaults to `provided_only` |
| `operation` | `read`, `analyze`, `edit`, `execute`, `schedule`; a read hint cannot hide an explicitly requested workflow action |
| `preferred_capability_ids` | Up to three known catalog IDs; preferences do not grant approval or defeat exclusions |
| `unavailable_capability_ids` | Known IDs to exclude; an explicit restriction wins over a preference |

Context without the opt-in is rejected. The context schema rejects unknown fields, fake availability claims, execution-authority claims and unknown IDs. Public callers cannot submit a trustworthy connection receipt through this interface.

`source_scope` constrains the new route before upstream calls. Private/provided-only plans use local discovery and suppress TypeSafe. Explicit `discovery: "local"` also suppresses inference. Known restrictive wording may tighten scope, but these conservative checks are not a complete natural-language privacy classifier. Callers must use the structured scope field for a hard boundary. Legacy calls without this extension keep their established behavior.

## Plan contract

The projection includes a generated request ID, catalog digest, selected domain/operation, a status, one primary and at most two complementary records, an ordered workflow, expected outputs, authorization gates, verification expectations, and selected source references. Output is validated with Zod and capped at 16 KiB. It does not echo the raw task or invent tool namespaces.

Status meanings:
- `NO_ROUTING_NEEDED`: answer with existing host context; no capability plan is required.
- `READY_WITH_EXISTING_TOOLS`: selected bundled reference content only; not execution permission.
- `NEEDS_CONNECTION`: a recommended service/catalog has not been observed in this target host.
- `NEEDS_RUNTIME`: the suggested library/runtime is not verified in this host.
- `NEEDS_REVIEW`: exact external instruction bytes/provenance require review.
- `NEEDS_APPROVAL`: a requested external operation requires an explicit host/owner gate.
- `UNSUPPORTED`: no safe eligible match is established.

All external availability remains `NOT_PROBED`. The code deliberately has no public input that turns a caller assertion into verified availability. A future trusted inventory resolver requires its own authentication, host identity, evidence freshness and permission design; it is not simulated here.

Workflow steps are proposals, not actions. Private research skips public discovery/extraction. Memory handoffs and repository publication default to skipped. Read-only workflow monitoring skips activation. Missing connections, declared capability effects and per-step authorization gates remain visible. No workflow platform or agent is started by this MCP.

## Optional TypeSafe integration

The existing draft advisor from PR #2 is reused as code, not merged into main. Caller opt-in is `decision_engine: "jev"`; server enablement is `TYPESAFE_JEV_ENABLED=true`, with a server-only API key and working shared budget store. Default is off. Local/private modes and explicit preferred skills skip inference.

Only canonical public technology keywords go to the fixed TypeSafe System One endpoint. The model may reorder an already eligible bundled recommendation when confidence meets the existing 0.85 policy. It cannot invent candidates, alter capability prerequisites or authorize execution. The threshold is not empirically calibrated here. The full HTTP operation, including response streaming, is deadline-bounded. Missing credentials/credits, quota denial, low confidence, malformed responses and timeouts preserve deterministic routing.

This change does not buy credits, set production secrets, or make a paid API call. See `typesafe-jev.md` for owner-controlled activation. Official contracts reviewed on October 21, 2026:
- https://docs.typesafe.ai/api/system-one
- https://docs.typesafe.ai/primitives/choice
- https://docs.typesafe.ai/cookbooks/skill_suggestion

## Evaluation ruling

The 24 research scenarios assumed named target capabilities were connected and approved. This public read-only planner cannot verify those assumptions, so tests conservatively allow a `NEEDS_*` result instead of inventing readiness. Candidate selection and negative boundaries are still asserted.

Scenario E22 names only a mirrored skill, not its publisher. The research fixture suggested Firecrawl; the implementation intentionally returns review-required with no invented publisher. The historical fixture is unchanged, and this ruling is explicit in the executed scenario tests. These tests are not a measured live routing-accuracy benchmark.

## V3 integration notes

This planner was ported onto the V3 branch (contract 2.5.0) without replacing the V3 toolchain planner. The two answer different questions:

- `route_task` with `include_capability_plan` projects the PR #4 five-domain catalog (assistance, research, data, development, automation) into a typed plan. It is available whether `SOREN_V3_TOOLS` is on or off.
- `plan_toolchain` (V3, flag-gated) plans skills, MCP integrations, version-matched knowledge and recipes from the V3 catalogs.

Differences from the PR #4 branch:

- `preferred_skills` and `unavailable_skills` accept every curated V3 skill name (22 at the time of porting), not just the four legacy names. `unavailable_skills` keeps the V3 limit of 8.
- The TypeSafe advisor's choice list is unchanged: it can only reorder among the four legacy skills (`accessibility`, `motion-systems`, `mcp-integration`, `skill-orchestration`) when they are already eligible. Widening it would change the reviewed privacy and cost boundary and needs its own review.
- `scripts/verify-capability-plan.mjs` accepts both the flag-off tool list (8 tools) and the flag-on list (8 legacy tools followed by the 6 V3 tools), and checks the skill resource count against the bundled catalog instead of a fixed 4.
- Without a gateway store (`SUPABASE_*`, `SOREN_GATEWAY_DB_KEY`, `SOREN_WORKSPACE_ID`) and `SOREN_RATE_KEY`, the shared budget guard denies every TypeSafe call, so the advisor reports `unavailable_or_budget_limited` and deterministic routing is kept.

Review fixes applied after porting (independent review, 2026-10-22):

- An `operation` hint can raise the operation derived from the task text but never lower it, so a `read` hint cannot hide the approval gate of a commit, push or deploy.
- Approval is derived from capability effects (`write_remote`, `possible_remote_write`, `execute_workflow`, `schedule`) for edit, execute and schedule operations. If any recommendation needs approval, the plan status is `NEEDS_APPROVAL`.
- Outside public scope, every capability whose only data access is a public network read is ineligible (discovery catalogs, Exa, Firecrawl, Context7, Crawl4AI, public reference corpora). Capabilities that act on the caller's own authorized data, such as the user's browser profile, stay eligible.

Known asymmetry, kept for legacy compatibility: without `include_capability_plan`, privacy wording in the task text (for example "do not browse") suppresses TypeSafe but does not switch federated discovery to local. Only `publicQuery` technology keywords leave the server in that case. Callers that need a hard boundary must send `discovery: "local"` or a structured `capability_context.source_scope`.

Regression coverage for this port lives in `tests/routing/capability-v3-compat.test.mjs` and `tests/routing/capability-gates.test.mjs`.
## Files and ownership

- `lib/capabilities/planner.mjs`: typed metadata selection, bounded workflow projection and explicit prerequisites.
- `lib/routing/route-request.mjs`: shared request schema, opt-in integration, privacy/default behavior and gated advice.
- `lib/routing/typesafe.mjs`: reused TypeSafe client with total response deadline hardening.
- `app/api/mcp/route.ts`: existing eight-tool registration; `route_task` delegates to the tested boundary.
- `tests/routing/capability-*.test.mjs`: selection, compatibility, privacy, concurrency, typed output and research scenarios.
- `scripts/verify-capability-plan.mjs`: real HTTP verification against an explicit candidate endpoint.

## Verify and release

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
node scripts/verify-capability-plan.mjs http://127.0.0.1:39187/api/mcp
```

The final command requires an actually running candidate server bound to that loopback address; it does not start one. It performs local-mode read-only tests with no third-party or paid model requests. Hosted deployment, real paid inference and named desktop invocation remain separate acceptance scopes. Follow the repository's existing production/review gates; do not infer deployment permission from passing source tests.
