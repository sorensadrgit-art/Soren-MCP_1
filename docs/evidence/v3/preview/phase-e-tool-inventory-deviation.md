# RESOLVED (see phase-e-final-v3-only.md)

This deviation applied to the earlier Phase E run against deployment
dpl_B9uW548d2RqCDVrEKeAhtTvVWY7W, where the preview environment still had the
TypeSafe JEV tools enabled (17 tools advertised). The finalization run set a
V3-only baseline (SOREN_TYPESAFE_TOOLS=0, TYPESAFE_JEV_ENABLED=false) on a new
deployment (dpl_4VALcS5XcaKu7uT9pNb3SR2UQTKk), which now advertises exactly
14 tools (8 legacy + 6 V3) and passes every required gate. The stale skill-count
constant in probe-preview-sdk.mjs was also corrected to derive from the catalog
(SKILLS.length = 23).

---

# Phase E deviation note: tool inventory count mismatch (test expectation, not a defect)

Observed: 2026-10-23T09:33:09Z
Endpoint: https://soren-mcp-v3-preview-26243r08f-sorensadr-gmailcoms-projects.vercel.app/api/mcp
Deployment: dpl_B9uW548d2RqCDVrEKeAhtTvVWY7W (preview, commit 30ac3e3726a1efa6e58cd1221fe242f42d089660)

## What the checks expected vs observed

The wire verifiers (scripts/verify-mcp.mjs, scripts/probe-preview-sdk.mjs,
scripts/verify-capability-plan.mjs) assert the tools/list is exactly the 8 legacy
tools, optionally followed by exactly the 6 V3 tools (total 8 or 14).

The protected preview advertised 17 tools:

  legacy (8):  list_skills, search_skills, route_task, read_skill,
               list_providers, discover_skills, inspect_candidate, search_mcp_servers
  V3 (6):      list_capability_profiles, plan_toolchain, list_integrations,
               search_knowledge, read_recipe, get_client_setup_guide
  TypeSafe (3): soren_jev_suggest_specialist, soren_jev_triage_learning,
               soren_jev_verify_claim

The 3 TypeSafe JEV tools are registered because the preview environment already
carries SOREN_TYPESAFE_TOOLS=1 and TYPESAFE_JEV_ENABLED=true (set by the prior
operator during preview provisioning). They were NOT enabled by this Phase E run.
Per the Phase E constraints, TypeSafe paid inference was not exercised: no
soren_jev_* tool was invoked (verify-capability-plan reports paidInferenceTested=false).

Because extra.length (9) equals neither 0 nor V3_TOOL_NAMES.length (6), the exact
count assertion fails. This is an expectation mismatch, not a functional defect:

- All 17 tools carry correct safety annotations
  (inputSchema.type=object, readOnlyHint=true, destructiveHint=false,
   openWorldHint boolean) - verified individually.
- All 6 V3 tools passed functional checks individually
  (see preview-phase-e-v3-tools.txt): list_capability_profiles, plan_toolchain
  (9-step immersive-web plan, advisory_only), list_integrations (13, none proxied),
  search_knowledge (primary with contentSha256), read_recipe (9 steps),
  get_client_setup_guide (dryRunOnly, executedBySoren=false).
- V3 recipe traversal (read_recipe id="../../.env") is rejected.
- The legacy 8 tools are first, in order.

## Related stale expectation: curated skill count

probe-preview-sdk expects 22 skill resources; the catalog now lists 23
(a skill was added after the probe constant was written). knowledge (44) and
recipe (8) counts match. This is a second stale expectation, also not a defect.

## WARN: Official MCP registry discovery

search_mcp_servers returned status "unavailable", reason "UPSTREAM_TIMEOUT".
The upstream registry API timed out from the preview. Marked optional in the
verifier. The same upstream flakiness affected SkillsMP during the rate-limit
probe (MCP_UPSTREAM_ERROR); the gateway still enforced budget correctly.
