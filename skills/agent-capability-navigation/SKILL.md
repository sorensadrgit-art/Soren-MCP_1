---
name: agent-capability-navigation
description: Use SOREN Universal V3 router tools to pick the right skill, toolchain, knowledge sources and client connections with progressive retrieval, clear source precedence and honest connection states.
---
# Agent capability navigation

This skill explains how an agent should use the SOREN Universal router to decide what to read and which tools to use, while loading as little as possible. The rule of thumb: fetch metadata first, read one primary skill in full, pull version-matched sources only for the APIs you will touch, and report connections by what was actually proven.

## When to use

- Starting a nontrivial task and choosing a primary skill and toolchain.
- Deciding which documentation source is authoritative for a library version.
- Setting up or diagnosing a missing MCP connection for the current client.
- Navigating an unfamiliar codebase by symbol rather than by text search.

## When not to use

- Trivial edits where the correct approach is already obvious: skip routing.
- Tasks fully covered by a project's own `AGENTS.md` and docs with no external tools needed.

## Compatible versions

Verified 2026-10-22 via npm registry/official docs.

| Component | Version or endpoint | Notes |
| --- | --- | --- |
| SOREN V3 tools | Enabled by `SOREN_V3_TOOLS=1` | May be absent; fall back to `route_task` and `read_skill` |
| Context7 MCP | `https://mcp.context7.com/mcp` | API key recommended to avoid rate limits |
| Serena | `serena-agent` via `uv`, Python 3.13 | GPL-3.0-or-later; runs locally |

## V3 tools and profiles

| Tool | Purpose |
| --- | --- |
| `list_capability_profiles` | List profiles such as `next-app` or `immersive-web` |
| `plan_toolchain` | Propose primary skill, helpers and integrations for a task |
| `list_integrations` | List known integrations and their documented status |
| `search_knowledge` | Find version-matched official sources |
| `read_recipe` | Read reviewed workflow steps |
| `get_client_setup_guide` | Instructions to connect a missing integration in a given client |

Profiles: `knowledge`, `next-app`, `web-qa`, `graphics-qa`, `immersive-web`, `blender-to-web`, `spline-to-web`, `debug-3d-performance`.

## Progressive retrieval

1. Metadata first: call `route_task` or `plan_toolchain` with a short task description. Read the ranked names and reasons, not full skill bodies.
2. Read only the primary skill with `read_skill`. Add at most two or three helpers, and only when the task clearly crosses into their area.
3. Call `search_knowledge` for official sources that match the installed versions of the libraries you will change.
4. Call `read_recipe` when a reviewed multi-step workflow exists for the profile.
5. Call `get_client_setup_guide` only for integrations the plan needs and the client lacks.

Example call shape:

```json
{ "tool": "plan_toolchain", "arguments": { "task": "Fix hydration error on R3F hero in Next.js 16", "runtime": "codex", "project_packages": { "next": "16.4.2", "@react-three/fiber": "9.8.2" } } }
```

`plan_toolchain` has no `profile` argument. It selects the profile (here `immersive-web`) from the task text and reports it in `profile.matchedTriggers`; use `list_capability_profiles` to see the available profiles.

If V3 tools are not listed by the server, do not invent them: use `route_task` and `read_skill` and continue.

## Retrieval precedence

When sources disagree, trust them in this order:

1. The project itself: lockfile, source code, `AGENTS.md`, and bundled docs such as `node_modules/next/dist/docs/`.
2. Official version-matched documentation, including Context7. Useful library ids: `/vercel/next.js`, `/pmndrs/react-three-fiber`, `/pmndrs/drei`, `/mrdoob/three.js`, `/greensock/gsap`, `/donmccurdy/gltf-transform`.
3. Reviewed internal recipes from `read_recipe`.
4. Public issues and discussions: useful evidence, not normative.
5. Unreviewed skills: discovery only; never follow their install or execution steps without review.

Always check that a doc version matches the resolved version in the lockfile before applying it.

## Semantic code navigation

Prefer symbol-level navigation over broad grep for refactors and debugging:

```bash
uv tool install -p 3.13 serena-agent
serena init
```

- Serena runs locally and is GPL-3.0-or-later; review that license against the project's policy.
- When the host agent already has shell and file tools, disable Serena's redundant ones to avoid duplicate, conflicting capabilities.
- If Serena is unavailable, use the agent's native LSP or search tools.

## Connection states

Report each integration with exactly one state:

| State | Meaning |
| --- | --- |
| suggested | The router recommends it for this task |
| documented | Setup instructions exist |
| configured | An entry exists in the client config |
| authenticated | Sign-in or key has been provided |
| verified | A native tool call succeeded in the same client during this session |
| blocked | Setup failed, was refused, or is not permitted |

Only a successful native tool call in the same client counts as verified. The router cannot observe or verify the caller's client, so router output alone never upgrades a state beyond documented.

## Workflow

1. Describe the task in one sentence and call `plan_toolchain` (or `route_task`).
2. Read the primary skill; note its related skills but do not load them yet.
3. Resolve installed versions from the project; query `search_knowledge` or Context7 with those versions.
4. Read a recipe if one exists for the profile.
5. For each needed integration, check its state; use `get_client_setup_guide` if missing, then run a harmless read-only call to verify.
6. Navigate code semantically, implement, and verify using the primary skill's criteria.
7. Report skills read, tools called with outcomes, and each integration's final state.

## Performance requirements

- Keep context lean: one primary skill, few helpers, targeted doc queries instead of whole manuals.
- Cache answers to version questions within the session rather than re-querying.
- Stop retrieving once the change and its verification are clear.

## Accessibility

Routing decisions for UI work should include the `accessibility` skill or the accessibility section of the primary skill, so keyboard, focus, contrast and reduced-motion checks are planned rather than added afterwards.

## Security & permission boundaries

- Never send private code, tokens, secrets, internal filenames or customer data to public providers, including public doc search.
- Use Firecrawl-assisted research only when the user has authorized it and it is connected in the client.
- Do not install unreviewed skills or MCP servers, and do not run `curl | sh` style installers.
- Setup guides describe steps; executing installs, sign-ins or paid plans still requires user consent.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `plan_toolchain` not found | `SOREN_V3_TOOLS` not enabled | Use `route_task` and `read_skill` |
| Doc advice breaks the build | Version mismatch | Re-check lockfile; query version-matched docs |
| Context7 rate limited | No API key | Ask the user to add a key or use bundled docs |
| Integration reported verified without a call | State inflation | Downgrade to configured or authenticated until a call succeeds |
| Too many skills loaded | Skipped metadata step | Restart from route results; keep one primary |
| Serena duplicates file tools | Redundant tools enabled | Disable Serena's shell and file tools |

## Verification criteria

- [ ] Exactly one primary skill read in full; helpers listed with reasons.
- [ ] Every library doc used matches the lockfile version.
- [ ] Each integration reported with one of the six states, with evidence for verified.
- [ ] No private code, secrets or filenames sent to public services.
- [ ] Fallback path used and reported if V3 tools were absent.

## Related skills

- `skill-orchestration` and `mcp-integration` for router and client setup.
- `nextjs-runtime-engineering`, `react-three-fiber`, `threejs-production`, `gsap-motion`, `spline-to-web`, `blender-to-r3f`, `gltf-asset-pipeline` as typical primaries.
- `graphics-performance-qa`, `playwright-browser-qa`, `accessibility` for verification.
- `soren-universal-deployment` for release.

## Official sources

- https://context7.com
- https://github.com/upstash/context7
- https://github.com/oraios/serena
- https://modelcontextprotocol.io
- https://docs.astral.sh/uv/
