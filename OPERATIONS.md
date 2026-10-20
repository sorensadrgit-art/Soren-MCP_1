# Soren Shared MCP Skill Directory — Operations

## Live service
- Dashboard: https://soren-shared-mcp-skills.vercel.app
- MCP endpoint: https://soren-shared-mcp-skills.vercel.app/api/mcp
- Vercel project: soren-shared-mcp-skills
- Transport: Streamable HTTP
- Deployment: production, serverless, read-only, public curated catalog
- Tools: list_skills, search_skills, route_task, read_skill
- Resources: skill://<skill-name>/SKILL.md

## Verified clients on AgentZero Windows
- Factory Droid: user MCP soren-skills (remote HTTP). Legacy universal-skill-router is marked disabled in ~/.factory/mcp.json.
- Codex: user MCP soren-skills (remote HTTP). Legacy skill-registry configured enabled=false in ~/.codex/config.toml.
- Claude Code: user MCP soren-skills (remote HTTP) in ~/.claude.json.
- Qwen Code: user MCP soren-skills (remote HTTP). Legacy skill-registry in mcp.excluded in ~/.qwen/settings.json.
- Global agent guidance updated in Factory AGENTS.md, Codex AGENTS.md, Claude CLAUDE.md, Qwen QWEN.md.

## Disabled recurring local work
- Windows Task Scheduler: SkillRegistryDiscovery — Disabled.
- Windows Task Scheduler: Soren Skill Router Maintenance — Disabled.
- The original local skill-registry repository and Python router remain on disk; they are not automatically launched through these MCP entries or scheduled tasks.

## Approved starter catalog
- accessibility
- motion-systems
- mcp-integration
- skill-orchestration

The legacy local registry has many more entries; do not bulk publish them. New skills require manual source review and an intentional deployment.

## Verification performed
- Local Node.js: 5/5 catalog unit tests passing.
- Vercel production: Ready; Next.js build and TypeScript checks completed.
- Remote protocol from VPS: initialize, tools/list, route_task, read_skill, resources/list, resources/read all passed.
- Security negative test: path traversal returned MCP tool error.
- Remote protocol from AgentZero Windows: initialize and tools/list HTTP 200.
- All four MCP client configurations checked; both scheduled tasks rechecked Disabled.

## Maintenance
1. Add a reviewed SKILL.md to skills/<skill-name>/SKILL.md and corresponding metadata to lib/catalog.mjs.
2. Run tests from this project root: npm test.
3. Redeploy from reviewed source in the existing Vercel project. Changes to Windows files are not automatically pushed to Vercel.
4. Verify initialize, tools/list, resources/list, and one skill read before updating any more clients.
5. Never enable automatic installation, command execution, or publishing of unreviewed local skills.

## Browser memory settings
Browser-level settings were not force-changed during this operation. Examplify and active Chrome automation sessions were running. To adjust later without interruption, use edge://settings/performance (sleeping tabs) and chrome://settings/performance (Memory Saver Balanced), while keeping automation-dependent sites active.

## 2026-10-19 Desktop expansion
- Factory Droid: soren-skills previously registered at ~/.factory/mcp.json; legacy local router disabled
- Codex Desktop: installed MSIX OpenAI.Codex; CLI/desktop shared ~/.codex/config.toml already registers soren-skills
- Antigravity Desktop: added remote MCP to ~/.gemini/config/mcp_config.json using serverUrl (disabled=false); installed app was detected
- OpenCode Desktop 2.0.32: migrated existing flat mcp config to v2 mcp.servers and connected soren-skills via bundled opencode-cli.exe mcp list
- Preserved all five pre-existing OpenCode MCP server definitions; one unrelated codebase-memory server currently fails identity verification
- Global routing rules added to ~/.gemini/config/AGENTS.md and ~/.config/opencode/AGENTS.md
- Antigravity UI activation remains to be verified via in-app MCP server refresh; avoid interrupting active projects
- Full continuity note: MEMORY.md in this project


## Universal Skill Router V2 production release — October 19, 2026

Production URL: https://soren-shared-mcp-skills.vercel.app
MCP endpoint (unchanged): https://soren-shared-mcp-skills.vercel.app/api/mcp
Vercel production deployment: dpl_5VwXpAVSSqb96NkHtAHjHMimTgoR (READY)

### Upgraded functionality
- Eight MCP tools: list_skills, search_skills, route_task, read_skill, list_providers, discover_skills, inspect_candidate, search_mcp_servers.
- Three federated agent-skill search providers: SkillsMP public MCP, Skills.sh authenticated v1 API using request-scoped Vercel OIDC, Anthropic first-party GitHub skills.
- Separate official MCP Registry discovery for MCP servers (not SKILL.md agent skills).
- Local-first primary recommendation with external candidates requiring review; explainable lexical-IDF ranking, source dedup, limited source/audit inspection, prompt-injection and suspicious-instruction heuristics.
- Provider failures isolated; response/time budgets, server-side OIDC, public technology query filtering, 10-minute best-effort in-memory cache.
- Zero external skill auto-installs, code execution, or unapproved activation. Curated four skill files and old client URL remain available.
- New premium responsive dashboard with a working task-routing form and provider status.

### Evidence
- 17/17 unit/integration-style tests passing with npm test.
- Next.js 16 production build and TypeScript succeeded.
- Two ready preview deployments (dpl_6THLtViuywGRDcvh2u358Kw1xFHD, dpl_HcL6L2bZSuSZQnTDc7UdPDeuMz9U).
- Production deployment dpl_5VwXpAVSSqb96NkHtAHjHMimTgoR READY with aliases including soren-shared-mcp-skills.vercel.app.
- 11/11 real live production checks passed from separate connected VPS: HTTP home, MCP initialization, eight tools, configured providers, remote routing with both SkillsMP + Skills.sh authenticated, Skills.sh direct search, Skills.sh independent audit/inspection, approved read_skill, four MCP resources, MCP Registry discovery, traversal rejection.
- Tested example: GSAP WebGL task selects motion-systems locally and eight external review-only suggestions; Skills.sh returned audited community candidate with reviewStatus=requires_review.
- Original Python skill-registry and Windows scheduled-task states were not altered during this V2 upgrade.

### Deferred original local project features
Authenticated/private approval registry, immutable revisions, quarantine, sandbox tests, pinned installs, persistent audit/history, persistent cache and automated rollback require a protected stateful control plane. Do not claim these features are live on the public read-only endpoint. Do not publish private memory or API credentials to public clients.
