# Isolated Vercel preview: SOREN Universal V3 (2026-10-22)

The isolated preview for Gate 5. Source commit `850df17` (branch `feat/soren-universal-v3-knowledge`), deployed from a `git archive` export with no `.git` directory, so the new project has no Git connection. All checks were read-only MCP calls.

## Account, team and project

| Item | Value |
|---|---|
| Vercel user | `sorensadr-5641` |
| Team | `team_4EjLBPTV0cEpjMytwNJlggaW` (`sorensadr-gmailcoms-projects`, Hobby) |
| Preview project | `soren-mcp-v3-preview` (`prj_n1PULnMPv3uCy1Df7qBCnKBRzNNp`), new, framework Next.js, Node.js 22.x |
| Project env vars | none (no gateway store, no `SOREN_RATE_KEY`, no TypeSafe key) |
| Project domains | none (the auto-assigned `soren-mcp-v3-preview.vercel.app` was removed, see below) |
| Deployment protection | Vercel Authentication, `all_except_custom_domains`; one protection-bypass-for-automation token, used only through `x-vercel-protection-bypass` and never printed or committed |
| Existing production project | `soren-shared-mcp-skills` (`prj_mJgbERJNKW1V96leE2yWOzsqxkpo`) not modified: same `updatedAt` (1792667661653), production deployment `dpl_Dvmp9LTVEQLdQeMVDGAfRxBoK51b`, zero env vars, live still reports 2.4.0 |

## Deployments in the preview project

| Deployment | Target | Flag | Use |
|---|---|---|---|
| `dpl_6Vh95ZUr9VbR54v28LgmhWkixdTx` (`soren-mcp-v3-preview-1ylrjyzfe-…vercel.app`) | preview | `SOREN_V3_TOOLS=1` (deployment-scoped `--env` and `--build-env`) | Flag-on validation |
| `dpl_pNoEunbeYbA4ymiYPY5VevdSrbLo` (`soren-mcp-v3-preview-5b1z89yay-…vercel.app`) | preview | unset | Flag-off validation |
| `dpl_v1aHX5zVu3cCY2Qx7YcHMP7wc73T` | production (of the new project only) | `SOREN_V3_TOOLS=1` | First attempt, not used for validation |
| `dpl_CgPF8BaC1qMA2KstpWBws3a2j3bj` | preview | `SOREN_V3_TOOLS=1` | Blocked while the project was paused; never built |

**Exposure note.** The first `vercel deploy --environment preview` on the new project was recorded as target `production` and aliased to `soren-mcp-v3-preview.vercel.app`. On a Hobby team, standard protection does not cover that production domain, so for about three minutes the flag-on read-only MCP surface (the same public tools as live, plus the six advisory V3 tools) was reachable without authentication. It was closed by pausing the new project, removing that domain from the new project, then unpausing. The domain now returns 404. All validation used the two preview-target deployments, which have no aliases and are protected.

## Protection checks (`protection-and-boundary-probes.jsonl`)

| Probe | Result |
|---|---|
| Unauthenticated `GET /` | 302 to `vercel.com/sso-api` |
| Unauthenticated MCP `initialize` | 401 "Protected deployment" |
| Unauthenticated `/api/health/live` | 302 |
| Wrong bypass secret | 401 |
| Bypass: `/api/health/live`, `/api/health/ready` | 200 live; 200 ready, mode `public_only` |

## MCP protocol validation

| Check | Flag on (`dpl_6Vh95…`) | Flag off (`dpl_pNoEu…`) |
|---|---|---|
| `scripts/verify-mcp.mjs` | 26 PASS, 0 FAIL, 3 WARN | 19 PASS, 0 FAIL, 3 WARN |
| `scripts/verify-capability-plan.mjs` | 14/14 | 14/14 |
| Tools | 14 (8 legacy first, same order, then 6 V3) | 8 |
| Resources | 74 (22 skills, 44 knowledge, 8 recipes) | 22 skills |
| MCP SDK client (`@modelcontextprotocol/client` 2.3.1, `scripts/probe-preview-sdk.mjs`) | 13/13 | not run (probe expects the flag) |

The 3 WARNs are the optional external-discovery checks (SkillsMP, Skills.sh, MCP registry). Without the shared gateway store they fail closed with `shared_provider_budget_unavailable`, as intended.

SDK client checks (flag on): server identity 2.5.0; tool list; resource counts; `route_task` → `motion-systems`; `plan_toolchain` → `immersive-web`, 9 steps, no verified connections; `search_knowledge` primary; `read_recipe` 9 steps; knowledge resource read; unknown runtime gets a setup-guide template and the glTF CLI is listed as a tool; setup guide is dry-run only; the capability plan gates "inspect, fix and push" as `edit` / `NEEDS_APPROVAL`; recipe and skill path traversal rejected.

Latency from the operator workstation to Vercel iad1 (10 samples, includes network): `route_task` p50 47 ms / p95 56 ms; `plan_toolchain` 50 / 83 ms; `search_knowledge` 47 / 57 ms; `read_recipe` 42 / 54 ms; resource read 49 / 147 ms.

## Request boundaries on the preview

| Request | Result |
|---|---|
| Well-formed bearer token, no store | 503 `private_identity_unavailable` |
| `Authorization: Basic invalid` | 401 `invalid_authorization` |
| 17 KB body | 413 `request_body_too_large` |
| Cross-origin browser request | 403 |
| `discover_skills`, federated `route_task` | 200, every provider `shared_provider_budget_unavailable`, local results kept |
| `search_mcp_servers` | tool error `shared_provider_budget_unavailable` |
| Unknown tool | JSON-RPC -32602 "not found" |

## Live 2.4.0 vs preview 2.5.0 (`live-vs-preview.json`)

Same results as the earlier local comparison (`live-vs-candidate.md`), now on Vercel:

- Legacy 8 tools in the same order with identical annotations and required fields. Schemas are additive only: `route_task` gains 5 optional properties and `read_skill` gains `privateVersion`.
- Skill resources 14 → 22, with every live URI kept, plus 52 V3 resources. 11 of 14 common skills are byte-identical; `gsap-motion`, `react-three-fiber` and `threejs-production` changed on purpose.
- Local `route_task` keeps the same primary in 8 of 10 tasks and the same response keys in all 10. The glTF Draco task moves to `gltf-asset-pipeline` and the TSL shader task moves to `shader-material-lab`.
- Differences that need the owner's store decision (`docs/v3/production-activation.md`): external discovery fails closed without the store, and malformed or bearer `Authorization` headers are rejected (live ignores them). 17 KB bodies return 413 (live accepts them).

## Not covered

- Paid inference: TypeSafe is off and was not called.
- Native agent clients: no client configuration was changed, so no Codex, Claude or Factory client was attached to the preview. The MCP SDK client is the protocol-level stand-in.
- The shared gateway store: none was configured, by design.
