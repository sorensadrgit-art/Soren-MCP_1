# SOREN Universal V3 capabilities

Version 2.5.0. V3 adds a reviewed knowledge engine, an integration catalog, capability profiles, recipes and an advisory toolchain planner. Every V3 answer comes from catalogs bundled in this repository. The V3 catalog tools never call external services, run commands, edit client configuration or handle credentials. Legacy tools differ: default federated `route_task`, `discover_skills` and `search_mcp_servers` call external providers (see `docs/v3/production-activation.md`).

## Feature flag

The six V3 tools register only when `SOREN_V3_TOOLS` is exactly `1` (`lib/v3/flags.mjs`). The flag is off by default and is not enabled in production. With the flag off, the server exposes the same 8 legacy tools and 22 skill resources as before, and calling a V3 tool returns "Tool not found". See `docs/v3/production-activation.md`.

## Tools (flag on)

| Tool | Purpose |
| --- | --- |
| `plan_toolchain` | Picks a capability profile for a task, then returns selected skills, suggested MCP servers, version-aware docs, permission boundaries, an ordered execution plan, verification, fallbacks, sources and a confidence score. Advisory only. |
| `search_knowledge` | Ranked search over the reviewed knowledge catalog, with compatibility checks against the project's declared package versions and freshness status. |
| `read_recipe` | Returns one recipe's steps, actors, permissions, approvals and verification. |
| `list_integrations` | Lists the integration catalog with status, risk, auth model and observations. |
| `list_capability_profiles` | Lists the 8 profiles and their triggers, skills and integrations. |
| `get_client_setup_guide` | Dry-run setup text for one client and integration: preflight, commands, config snippet, credentials by env-var name, verification and rollback. |

Resources added when the flag is on: `soren://knowledge/{id}` (44) and `soren://recipe/{id}` (8).

The legacy tools (`route_task`, `list_skills`, `search_skills`, `read_skill`, `list_providers`, `discover_skills`, `inspect_candidate`, `search_mcp_servers`) are unchanged. `list_providers` now also reports `agentMcpIntegrations`.

## Catalogs

| File | Contents |
| --- | --- |
| `catalog/knowledge.json` | 44 reviewed references for React, Next.js, Three.js, R3F, Drei, WebGL, WebGPU, GSAP, glTF, Blender, Context7, Firecrawl, Serena and others. Each has a canonical source, hash, freshness policy and package ranges. |
| `catalog/integrations.json` | 13 agent-native integrations: Context7, Serena, Next DevTools, Playwright, Chrome DevTools, Spline, Vercel, GitHub, Blender Lab (isolated), glTF Transform CLI, 21st, MotionSites, Firecrawl. |
| `catalog/profiles.json` | 8 capability profiles: knowledge, next-app, web-qa, graphics-qa, immersive-web, blender-to-web, spline-to-web, debug-3d-performance. |
| `catalog/recipes.json` | 8 recipes, including the 9-step `cinematic-portfolio`. Steps that need OAuth, repository writes, publishing, production writes or an isolated VM require human approval. |
| `lib/catalog.mjs` | 22 bundled skills (4 originals, 10 from the live deployment, 8 new graphics and agentic skills). |

## Connection states

- `documented`: reviewed from official documentation.
- `client_reported`: a caller or `mcp list` says the server exists. Never upgraded automatically.
- `verified`: this agent made a successful native tool call in that client, recorded with the date and evidence.

Current verified observations (Factory Droid session, 2026-10-22): Context7, Playwright, Chrome DevTools. Pinned stdio packages that started and listed tools: `next-devtools-mcp@0.4.0` (4 tools), `@playwright/mcp@0.0.83` (25), `chrome-devtools-mcp@1.11.0` (32). That probe is a protocol check, not a client connection.

## Related documents

- `docs/v3/knowledge-governance.md`: how knowledge entries are added, hashed and expired.
- `docs/v3/mcp-install-profiles.md`: which integrations each profile uses.
- `docs/v3/client-attachment-plan.md`: dry-run commands per client.
- `docs/v3/production-activation.md`: reviewed activation plan (not executed).
- `docs/evidence/v3-sandbox-validation.md`: graphics sandbox measurements and findings.
- `docs/v3/drift-reconciliation.md`: live 2.4.0 deployment versus main 2.2.0.
