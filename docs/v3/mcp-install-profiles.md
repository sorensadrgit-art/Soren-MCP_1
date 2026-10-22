# MCP install profiles

Profiles map a kind of task to the skills and agent-native integrations it needs. `plan_toolchain` picks one automatically; `list_capability_profiles` lists them. SOREN only recommends. Each agent client connects servers itself, under its own approvals. Dry-run commands per client are in `docs/v3/client-attachment-plan.md`.

| Profile | Primary skill | Required | Optional | Recipe |
| --- | --- | --- | --- | --- |
| knowledge | agent-capability-navigation | context7 | serena, firecrawl | knowledge-retrieval |
| next-app | nextjs-runtime-engineering | next-devtools | context7, vercel, playwright, chrome-devtools, github, serena | nextjs-debug |
| web-qa | playwright-browser-qa | playwright | chrome-devtools, 21st, context7 | web-qa-pass |
| graphics-qa | graphics-performance-qa | playwright | chrome-devtools | graphics-qa-pass |
| immersive-web | react-three-fiber | context7, playwright | chrome-devtools, next-devtools, github, vercel, serena, spline, blender-lab, gltf-transform-cli | cinematic-portfolio |
| blender-to-web | blender-to-r3f | gltf-transform-cli | blender-lab, context7, playwright | blender-glb-pipeline |
| spline-to-web | spline-to-web | spline | playwright, gltf-transform-cli, context7 | spline-embed |
| debug-3d-performance | graphics-performance-qa | chrome-devtools | playwright, context7 | debug-3d-performance |

## Suggested minimum sets

- **Any coding agent:** context7. Add serena for large repositories.
- **Next.js work:** next-devtools (requires a running Next.js 16+ dev server), plus playwright for rendered checks.
- **3D and motion work:** context7, playwright and chrome-devtools. Use the glTF Transform CLI inside the project for assets.
- **Deploy previews:** vercel, only in clients Vercel documents (Codex, Claude Code, OpenCode). Production deploys stay human-approved.

## Risk notes

- **Blender Lab** runs arbitrary Blender Python. Use it only in a disposable VM with no personal files; it is never part of a default set.
- **Spline, GitHub, Vercel, 21st and MotionSites** use OAuth or account access. The user approves each sign-in in the client.
- **Firecrawl** spends paid credits. Use it only after official docs and Context7.
- **Pinned versions** (`next-devtools-mcp@0.4.0`, `@playwright/mcp@0.0.83`, `chrome-devtools-mcp@1.11.0`, `firecrawl-mcp@3.33.4`, `@gltf-transform/cli@4.5.1`) keep setups reproducible. Review release notes before bumping them.
