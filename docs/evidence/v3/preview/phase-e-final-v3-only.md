# Phase E finalization: V3-only protected preview acceptance (GREEN)

Observed: 2026-10-23T11:57:34Z
Deployment under test: dpl_4VALcS5XcaKu7uT9pNb3SR2UQTKk
URL: https://soren-mcp-v3-preview-9cxi5yafc-sorensadr-gmailcoms-projects.vercel.app
Target: preview (target=null). Source commit: 30ac3e3726a1efa6e58cd1221fe242f42d089660 (main, merge of PR #6).
Project: soren-mcp-v3-preview (prj_n1PULnMPv3uCy1Df7qBCnKBRzNNp).

## Baseline: V3-only configuration

The preview environment was set to a V3-only configuration for the Preview target
only (verified by name/target/type, values never printed):

  SOREN_V3_TOOLS        = 1      (preview, sensitive)
  SOREN_TYPESAFE_TOOLS  = 0      (preview, sensitive)  <- disabled
  TYPESAFE_JEV_ENABLED  = false  (preview, sensitive)  <- disabled
  TYPESAFE_API_KEY      (unchanged; now inert because both gates above are off)

Registration gate (lib/typesafe/advisory.mjs): typesafeToolsEnabled requires
SOREN_V3_TOOLS==='1' && SOREN_TYPESAFE_TOOLS==='1'. With SOREN_TYPESAFE_TOOLS=0 the
three soren_jev_* tools are not registered. No TypeSafe paid inference was enabled
or invoked (verify-capability-plan reports paidInferenceTested=false).

A new Preview deployment (dpl_4VALcS5XcaKu7uT9pNb3SR2UQTKk) was built from the same commit to pick up
the corrected env; the earlier deployment dpl_B9uW548d2RqCDVrEKeAhtTvVWY7W was built
with the previous env and was not reused.

## Exact V3-only inventory (verified on the wire)

  tools/list: 14 total = 8 legacy in order + 6 V3, 0 TypeSafe
    legacy: list_skills, search_skills, route_task, read_skill,
            list_providers, discover_skills, inspect_candidate, search_mcp_servers
    V3:     list_capability_profiles, plan_toolchain, list_integrations,
            search_knowledge, read_recipe, get_client_setup_guide
  resources/list: 23 skill + 44 knowledge + 8 recipe = 75 total

## Results (all required gates green)

  verify:mcp               28/29 PASS, 0 FAIL, 1 WARN (optional)
                           - all six V3 tool checks run and PASS
                           - V3 recipe + knowledge resources readable
                           - V3 recipe traversal rejected
                           - federated routing review-only
                           - SkillsMP + Skills.sh live discovery PASS
                             (confirms the preview gateway credential is valid)
                           - boundary: traversal, malformed args, 4-agent
                             concurrency isolation, cross-origin 403,
                             malformed identity 401, oversized body 413
                           WARN: Official MCP registry discovery (upstream
                             UPSTREAM_TIMEOUT; documented optional warning)
  SDK client probe         13/13 PASS  (real @modelcontextprotocol/client)
                           - server identity soren-universal-skill-router v2.5.0
                           - 14 tools; 23/44/8 resources
                           - plan gates mixed read/write -> NEEDS_APPROVAL
                           - recipe + skill traversal rejected
                           - latency p50 ~42-56 ms
  verify-capability-plan   14/14 PASS  (paidInferenceTested=false,
                                        productionModified=false)
  Rate-limit probe         per-address unauthenticated cap 6/min enforced exactly;
                           claims 7-10 denied with provider_quota_exceeded,
                           graceful structured degradation (HTTP 200 body).
  Boundary probes          cross-origin 403, malformed identity 401,
                           oversized body 413.

## Authentication and bypass cleanup

- Temporary automation bypass created for the run only; sent only as
  x-vercel-protection-bypass over HTTPS to the *.vercel.app preview origin;
  never logged; not stored in the repo.
- Revoked immediately after testing
  (PATCH /v1/projects/prj_n1PULnMPv3uCy1Df7qBCnKBRzNNp/protection-bypass
   {"revoke":{"secret":"<secret>","regenerate":false}} -> 200, protectionBypass {}).
- Post-revoke: unauthenticated POST /api/mcp -> 401; revoked bypass -> 406.

## Production unchanged

soren-shared-mcp-skills (prj_mJgbERJNKW1V96leE2yWOzsqxkpo): 0 env vars, no
protectionBypass, latest deployment target=production. Not modified.

## Note on the earlier run's deviation

The prior Phase E run (deployment dpl_B9uW548d2RqCDVrEKeAhtTvVWY7W) reported a
tool-count FAIL because the preview env then had TypeSafe tools enabled (17 tools).
That is resolved in this run by the V3-only baseline: exactly 14 tools, zero
required failures.
