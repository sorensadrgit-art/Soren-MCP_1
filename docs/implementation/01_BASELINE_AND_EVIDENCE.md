# Baseline and Evidence

## Evidence classification

**Observed during handoff preparation:** Desktop Commander returned AgentZero online; the relevant files were read; ten selected files were hashed; the source root had no `.git` directory; Vercel returned the existing project and its latest recorded production deployment as READY.

**Read from the existing audit, not rerun during this preparation:** 22 passing unit tests, 19 passing live checks, a zero-result dependency audit at the audit time, protocol compatibility checks, and client observations. These are historical evidence, not a fresh assertion of runtime health or a guarantee about future versions.

**Proposed in this package:** all new installer, registry, health maintenance, release-policy, updater, and additional dashboard features. They are not deployed yet.

## Service identity

| Field | Observed value |
| --- | --- |
| Project name | `soren-shared-mcp-skills` |
| Public endpoint | `https://soren-shared-mcp-skills.vercel.app/api/mcp` |
| Client alias | `soren-skills` |
| MCP identity | `soren-universal-skill-router` |
| MCP version constant | `2.2.0` |
| Package version | `1.0.0` |
| Source locator | `C:\Users\soren\projects\soren-shared-mcp-skills` |
| Vercel project | `prj_mJgbERJNKW1V96leE2yWOzsqxkpo` |
| Vercel team | `team_4EjLBPTV0cEpjMytwNJlggaW` |
| Latest returned production deployment | `dpl_8efcRaKMX6uZX6fqPRJq7aEQ2NvT` |
| Vercel runtime configuration | Node.js `22.x` |
| Local Git directory | Absent at inspected root |

The metadata response also contains a `live` field with value `false`; this package does not interpret that field as runtime availability. READY deployment state is not an application health check. Work must verify the endpoint separately.

Resolve the package/MCP version difference as a deliberate release metadata task. Do not silently change the current contract version merely to make two strings equal.

## Locked dependencies observed

`mcp-handler 2.3.0`; `@modelcontextprotocol/server 2.3.1`; `@vercel/oidc 4.0.1`; `next 16.4.2`; `react 19.3.1`; `zod 4.6.7`; `typescript 5.9.3`.

Use the actual lockfile for baseline reproduction. Do not start with blanket dependency upgrades. Exact versions and hashes are in `evidence/source-baseline.json`.

## Existing functional contract

Preserve these names: `list_skills`, `search_skills`, `route_task`, `read_skill`, `list_providers`, `discover_skills`, `inspect_candidate`, `search_mcp_servers`.

Preserve the bundled `accessibility`, `motion-systems`, `mcp-integration`, and `skill-orchestration` skills and their MCP resource URIs. Preserve existing local/federated routing defaults unless an explicitly documented compatibility migration is approved. Native MCP protocol behavior must be rechecked using the installed SDK; the historical audit records 2025-06-18 and 2026-07-28 paths.

Existing scripts: `npm test`, `npm run build`, `npm run verify:mcp`. New commands listed elsewhere in the package are interfaces to implement, not currently installed executables.

## Clients: most recent recorded state

| Client | Audit evidence | Remaining interpretation |
| --- | --- | --- |
| Factory Droid | Native list reported remote connected; old local router disabled | Verify again in current version before installation changes |
| Codex Desktop/CLI | Native get resolved endpoint | Desktop invocation is not established by configuration alone |
| Antigravity | `agy mcp list` reported enabled | GUI tool visibility/invocation remains unverified |
| OpenCode Desktop | Bundled 2.0.32 CLI reported connected | Its unrelated codebase-memory identity failure must not be bypassed |
| Claude Code | Native configuration resolution succeeded | Record actual benign invocation separately |
| Qwen Code | Remote connected after native removal of legacy registration | Prior exclusion was ineffective; confirm no duplicate at effective scope |

The inspected audit describes disabled `SkillRegistryDiscovery` and `Soren Skill Router Maintenance` tasks. Do not reenable them. Unrelated `open-design`, `pinchtab`, and `codebase-memory` issues are out of the automatic repair scope.

## Scope of exported evidence

No application source archive, private memory notes, agent configuration bodies, access tokens, browser data, or signing material is included. The source manifest contains only selected project file metadata and hashes. It does not prove the whole project is unchanged, nor authenticate the source as safe. Work must acquire and review the real source and check applicable project instructions.

A prior security incident was reported for this Windows installation. No clean-device assertion is made. Use trusted build and signing environments, avoid exposing production or signing credentials to untrusted source execution, and do not weaken local security controls to unblock verification.

## Preparation versus execution

This preparation wrote handoff artifacts only. It did not install software, provision Supabase, create a GitHub repository, schedule checks, run the app tests, promote a deployment, or arm autonomous updates. The previous deployment remains the baseline to preserve.
