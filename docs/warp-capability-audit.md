# Warp Capability Audit
Audit date: 2026-10-21

## Scope and evidence boundary
This report records direct read-only inspection and approved local changes performed from a Windows Warp session. The audit report itself was written in the isolated `audit/warp-capability-20261021` worktree, created from clean commit `334ee3f220f02770b6237f21e810fdf222792852`.

Only the Git status, not the file contents, of the unrelated `Projects/Soren-MCP-TypeSafe-20261020` worktree was inspected; it was not changed, staged, or otherwise affected.

## Capability matrix
| Capability | Status | Evidence | Remaining requirement | Priority |
|---|---|---|---|---|
| Warp desktop and Oz local agent | VERIFIED | Warp/Oz `v0.2026.10.14.08.27.stable_02` | None | — |
| Local shell development | VERIFIED | PowerShell 7.6.7, Git 2.55.0, Node 24.19.0, npm 12.1.0, Python 3.12.10, uv 0.13.1 | None | — |
| Local agent delegation | VERIFIED | Planning and child-agent tools available in the active session | Use only for separable approved work | Medium |
| Oz cloud environment | VERIFIED | Managed `SorenMortar` environment `FuD7IAvu1zlCZsO2W2HbQM` and default Linux x86-64 runner | No cloud task executed during this audit | Medium |
| Oz schedules and cloud secrets | CONFIGURED BUT EMPTY | Account inventory returned no schedules, cloud runs, or account-visible secrets | Approved use case, budget, and least-privilege secret setup | Optional |
| Warp Factory | VERIFIED | `SorenMortar` Factory available with Foreman, Triage, Spec, Implement, Review, scorer, and self-improvement roles | None | — |
| Factory GitHub/other integrations | NOT CONFIGURED | Factory has seven linked repositories but no integrations | Authenticated GitHub access and explicit automation scope | High |
| Factory MCP | VERIFIED | `list_teams` and `list_factories` succeeded | None | — |
| Soren Skills MCP | VERIFIED | Curated skills and configured providers listed successfully | None | — |
| MotionSites MCP | VERIFIED | Prompt metadata listed successfully | Premium prompt contents require MotionSites entitlement | Optional |
| Global skill catalog | VERIFIED | 300 local skills found under `C:\Users\soren\.agents\skills` | Periodic pruning/ownership review | Medium |
| GitHub CLI | VERIFIED, UNAUTHENTICATED | Installed GitHub CLI 2.102.1; `gh auth status` reports no logged-in host | User-present `gh auth login` | High |
| GitHub repository/PR workflows | BLOCKED | No authenticated GitHub CLI session | Authenticate GitHub CLI and authorize a read-only repository query | High |
| Warp agent profiles | PARTIALLY VERIFIED | Default profile is present locally; Oz CLI exposes profile listing only | User-present Warp Settings profile configuration and verification | Critical |
| Docker | NOT INSTALLED | Docker command unavailable | Enable virtualization first; install only if a project needs containers | Medium |
| WSL2 | BLOCKED | WSL reports host virtualization is disabled | Enable virtualization in firmware, then verify Windows features and WSL2 | Medium |
| Warp Drive | ENABLED, UNINVENTORIED | Local setting `warp_drive.enabled = true` | Warp UI/API access is required to inventory Drive content | Low |

## Working capabilities
- Local Warp and Oz are installed and operational.
- The current account can inspect and use an Oz environment and runner.
- All configured MCP servers completed harmless read-only connectivity checks.
- The `SorenMortar` Factory is available for the `sorensadrgit-art/Soren-MCP_1` repository, but no integration has been connected.
- The `Soren-MCP_1` project supports deterministic local installation from the committed npm lockfile.

## Completed work
- Created isolated worktree `Projects/Soren-MCP_1-warp-capability-audit-20261021` on branch `audit/warp-capability-20261021`.
- Installed GitHub CLI 2.102.1 through the verified `GitHub.cli` winget package. The installer hash was verified by winget.
- Installed project dependencies in the isolated worktree with `npm ci --ignore-scripts`.
- Added this report. No source, dependency manifest, lockfile, user secret, Factory setting, or cloud resource was changed.

## Verification results
| Check | Result | Evidence |
|---|---|---|
| Isolated worktree creation | PASS | Branch starts from clean commit `334ee3f220f02770b6237f21e810fdf222792852` |
| Dependency installation | PASS | `npm ci --ignore-scripts`: 139 packages added; npm audit reported 0 vulnerabilities |
| Type checking | PASS | `npm run typecheck` exit code 0 |
| MCP contract tests | PASS | `npm run test:contracts`: 8/8 passed |
| Routing tests | PASS | `npm run test:routing`: 15/15 passed |
| Production build | PASS | `npm run build` exit code 0; Next.js 16.4.2 generated 10 static pages |
| GitHub CLI installation | PASS | `gh version 2.102.1` |
| GitHub CLI authentication | BLOCKED | `gh auth status`: no logged-in GitHub host |
| Warp profile inventory | PARTIAL | Oz CLI lists one unsynced Default profile; local config shows profile settings |
| Safe profile change | BLOCKED | The CLI cannot create/edit profiles and local config does not expose documented autonomy enum values for safe programmatic editing |
| WSL2 startup | BLOCKED | Host virtualization disabled |
| Docker engine | SKIPPED | Deferred until virtualization is enabled and a project requires containers |
| Factory integration test | SKIPPED | Requires GitHub authentication and explicit automation scope |
| Cloud-run test | SKIPPED | Avoided unapproved cloud-credit consumption |

## Agent-governance finding
The current local Default profile is materially permissive: it allows code diffs, file reads, commands, MCP calls, and agent delegation without confirmation. Its command denylist contains common shell, network, remote-access, and deletion patterns, but Warp documentation states that a Run-until-completion session bypasses the denylist.

Do not add guessed permission enum values directly to `settings.toml`. Configure governance in Warp at **Settings → Agents → Profiles**:

1. Create a **Development** profile with confirmation for external/network operations and source changes as appropriate.
2. Create a **Production / VPS** profile with explicit confirmation for command execution, code diffs, file writes, and MCP calls; keep destructive and remote-access patterns in the denylist.
3. Set directory allowlists to the intended local projects and `/opt/workspaces` only when working against the VPS.
4. Verify each profile with a harmless local action before using it for production or remote work.

## Remaining requirements
1. Authenticate GitHub CLI interactively with `gh auth login`; this creates an external account session and was not initiated by the audit.
2. Configure Development and Production/VPS profiles in Warp Settings with a user present.
3. Enable host virtualization in BIOS/UEFI before further WSL2 or Docker work. This may require a reboot.
4. Decide whether a Factory integration is justified. If so, start with read-only PR review or issue triage, least privilege, and no schedules.
5. Before enabling a cloud schedule or run, confirm the use case, environment, expected credit cost, secret requirements, and artifact destination.

## Recommended next steps
1. **Critical / low effort:** configure restrictive Warp Development and Production/VPS profiles.
2. **High / low effort:** authenticate GitHub CLI, then perform a read-only `gh repo view sorensadrgit-art/Soren-MCP_1`.
3. **High / medium effort:** configure one controlled Factory GitHub automation after the authenticated repository check succeeds.
4. **Medium / medium effort:** enable firmware virtualization and verify WSL2; install Docker only when a repository needs it.
5. **Optional:** add an Oz schedule only after a manual cloud workflow has demonstrated useful, repeatable value and its credit consumption is known.

## Reversal
- Remove this report by reverting the audit branch change, or delete the isolated worktree and branch after review.
- Uninstall GitHub CLI with `winget uninstall --id GitHub.cli --exact`.
- GitHub authentication, Factory integrations, cloud schedules, Docker, WSL features, and firmware virtualization were not changed by this audit.
