# Soren Universal Skill Router V2

**Federated, read-only Model Context Protocol gateway for agent capabilities.**

- Dashboard: https://soren-shared-mcp-skills.vercel.app
- Existing agent endpoint (unchanged): https://soren-shared-mcp-skills.vercel.app/api/mcp
- Transport: MCP Streamable HTTP over HTTPS
- Environment: Next.js + Vercel Functions (no background Windows router)

## Agent workflow

A substantial task calls `route_task` with its task and runtime. The service selects among the four approved local skills, extracts *public technology keywords* (not the private task body), queries compatible external providers concurrently, normalizes candidate metadata, deduplicates candidates by source and skill name, ranks them with lexical relevance + publisher/popularity signals, and returns candidates marked `requires_review`.

To adopt an external skill, use `inspect_candidate` for available provider metadata, limited manifest previews, risk indicators and audit status. After a human approves the exact source revision, curate its files into `skills/<name>/SKILL.md`, update `lib/catalog.mjs`, run tests and redeploy. No external instructions are automatically loaded or executed.

### MCP tools

| Tool | Description |
| --- | --- |
| `list_skills` | List four curated local SKILL.md resources |
| `search_skills` | Search local (default) or use `scope="all"` for federation |
| `route_task` | Primary approved local skill + federated review candidates, with `discovery="local"` offline mode |
| `read_skill` | Load a reviewed SKILL.md; no filesystem or shell write |
| `list_providers` | List provider transport and auth status |
| `discover_skills` | Search SkillsMP MCP, Skills.sh API and Anthropic public skills |
| `inspect_candidate` | Inspect source metadata, available Skills.sh security audits, flagged text previews |
| `search_mcp_servers` | Search official MCP Registry, separate from agent skill discovery |

### Providers

- **SkillsMP:** `POST https://skillsmp.com/mcp`. Read-only public MCP. Calls `search_skills` and `get_skill`, with the documented MCP protocol header. Provider limits apply.
- **Skills.sh:** `GET /api/v1/skills/search`, `/api/v1/skills/{id}`, `/api/v1/skills/audit/{id}`. Requires Vercel OIDC enabled on the project. Server fetches a short-lived `VERCEL_OIDC_TOKEN` only at request time. The token is never exposed to clients.
- **Anthropic Skills:** Public GitHub contents API enumerates first-party skill folder names. A fixed GitHub raw-file URL permits inspection of a named SKILL.md; no arbitrary repository URL fetch.
- **Official MCP Registry:** `GET /v0.1/servers` exposes MCP server metadata only, never auto-installs MCP servers.

### Security and budget boundaries

- External content is untrusted. No automatic installation, execution, approval or remote shell.
- No private prompts, credentials, email addresses or local paths forwarded: discovery sends only recognized public technology keywords.
- Each discovery request is bounded: up to three allowlisted providers, capped result count and short request timeouts.
- Network failures, missing authorization or rate limits are reported per provider and do not interrupt local skill routing.
- External candidate details require a separately validated provider name and identifier.
- Skills.sh audits are advisory; a scan pass does NOT authorize automatic activation.
- The current endpoint is publicly accessible and **read-only**. Do not add personal memory or private write tools until authorization, abuse protection, access control and durable storage exist.
- Responses contain vetted metadata and optional limited *untrusted* previews, never arbitrary downloaded executables.
- In-process ten-minute query cache reduces repeat provider calls; Vercel Functions have ephemeral memory, so this is best effort.
- The original Windows Skill Registry remains preserved locally; none of its unreviewed entries were bulk published.

### Commands

```bash
npm ci
npm test
npm run build
npm run dev
```

Test mock adapters and safety with `tests/federation.test.mjs`. Build and redeploy deliberately to the existing project; updating files on Windows does not automatically update Vercel.

### Remaining original project features not ported

The legacy Windows skill-registry included SQLite state, immutable generation lockfiles, trust/permission gates, quarantine, reviewed pinned installs, sandbox test harness, scheduled discovery, execution histories and rollback. Those are inappropriate for an unauthenticated read-only serverless service without persistent storage and per-agent authorization. They remain a future private control plane—not silent features claimed by this V2 endpoint.

## Important distinction

**Skills** are instruction/content packages for agents. **MCP servers** are remote tool services. The official MCP Registry tool discovers *servers* and never treats them as SKILL.md files.

## Configuration

Compatible clients use this single existing URL:

```text
https://soren-shared-mcp-skills.vercel.app/api/mcp
```

Factory Droid, Codex, Antigravity and OpenCode can keep their existing remote entries; tool lists refresh on client restart or provider reconnect.

## Agent Connection & Non-Interference (V2.2)

Use the **Connect without conflicts** section on the dashboard. It contains syntax-checked
connection snippets for Factory Droid, Codex Desktop, Antigravity Desktop and OpenCode Desktop.
**Merge only the `soren-skills` entry into each agent's existing config.** Never replace a
whole MCP config or delete unrelated servers, prompts, plugins, or skills.

The server now advertises a unique identity (`soren-universal-skill-router`) and descriptive
instructions in both MCP 2025 and 2026 discovery responses. All eight tools include precise
read-only, non-destructive, idempotent, and open-world annotations according to whether they
contact external providers. The tool names and endpoint remain unchanged for older clients.

**Role separation:** `soren-skills` can recommend skills and expose curated SKILL.md reference
content, but it cannot supersede system, developer, user, or active project instructions.
Use a single `route_task` call only for substantial tasks; `read_skill` only on approved
local content. Do not automatically install/execute suggested community skills. Use each
agent's own native tools for actions. If an MCP name collides, qualify it with the configured
`soren-skills` server alias. The previously disabled local router must remain disabled.

**Health checks:**

```bash
npm test
npm run build
npm run verify:mcp -- https://soren-shared-mcp-skills.vercel.app/api/mcp
```

The live verification script checks 2025 + 2026 MCP discovery, tool schemas/annotations,
all registered tools, source inspection, resources, path validation, provider outages
as nonfatal warnings, four simulated concurrent clients, and cross-origin denial.
Remote provider availability can fluctuate, so provider-only failures are distinguished
from hard MCP contract failures.

The Windows agent instruction files contain the matching non-interference contract:
`~/.factory/AGENTS.md`, `~/.codex/AGENTS.md`, `~/.gemini/config/AGENTS.md` and
`~/.config/opencode/AGENTS.md`.
