# Six-client installer

Run Node.js 22.9 or newer from this reviewed source checkout. The installer has no resident process, service, startup entry, or scheduler. It does not install or upgrade desktop clients.

```powershell
node scripts/setup-agents.mjs inspect --agents all --output inventory.json
node scripts/setup-agents.mjs plan --agents factory,codex,antigravity,opencode,claude,qwen --output install-plan.json
node scripts/setup-agents.mjs apply --plan install-plan.json
node scripts/setup-agents.mjs verify --receipt <actual-receipt-path> --level configured
node scripts/setup-agents.mjs reconcile --receipt <actual-receipt-path>
node scripts/setup-agents.mjs remove --receipt <actual-receipt-path>
```

Replace the receipt placeholder with the exact `receiptPath` returned by apply. Literal angle-bracket placeholders are rejected. Output files are created exclusively and never overwrite an existing report. Reports contain hashes and registration metadata, never original settings, tokens, or native stderr. Treat reports as local metadata because they include configuration paths.

The command line is an explicit local invocation. Applying a plan authorizes its exact recorded entry and guide changes. Plans expire after 24 hours, bind the current host/user home, and validate target paths, installed adapter version, preimage hashes, ownership keys and permitted operations. Unknown client versions and non-Windows platforms are inspectable but blocked from automatic mutation. Unsupported or ambiguous configuration is a conflict.

## Compatibility

| Client | Fixture-tested version | User configuration | Registration |
| --- | --- | --- | --- |
| Factory Droid | 0.244.0 | `~/.factory/mcp.json` | `mcpServers.soren-skills` with HTTP `url` |
| Codex | 0.157.1 | actual `CODEX_HOME/config.toml`, otherwise `~/.codex/config.toml` | `mcp_servers.soren-skills` |
| Antigravity (`agy`) | 1.4.2 | `~/.gemini/config/mcp_config.json` | `mcpServers.soren-skills` with `serverUrl` |
| OpenCode | 2.0.32 | `~/.config/opencode/opencode.json` | `mcp.servers.soren-skills` |
| Claude Code | 2.1.283 | `~/.claude.json` | user `mcpServers.soren-skills` |
| Qwen Code | 0.25.3 | `~/.qwen/settings.json` | `mcpServers.soren-skills` with `httpUrl` |

All six versions were observed with harmless local `--version` commands on October 20, 2026. OpenCode was found in its desktop application's bundled CLI directory. These checks do not prove desktop registration or native tool invocation. Version support here means configuration-fixture compatibility, not completed native acceptance. The current redacted host inventory is in `installation-inventory.md`.

JSON/JSONC editing preserves comments, BOM, CRLF and unrelated values. TOML is validated with a real parser. Only the exact unquoted owned table is edited; quoted or inline ownership shapes require manual review. Project/ancestor overrides, alternate OpenCode config, known Claude settings and Claude/Codex plugin manifests are inspected. A plugin-managed connection or duplicate endpoint blocks manual installation. Legacy names are identified by exact names and endpoint identity; the installer never deletes a legacy entry based on its name alone.

One bounded guide section is placed in the client's user guide. Text outside its boundary stays intact. An edited managed block requires manual reconciliation. Project repositories are never populated with guides.

## Transaction and recovery

Every mutation acquires a local exclusive lock. Original bytes remain only in `~/.soren-installer/<plan-id>/*.before`; journals include checksums and owned-entry identity. Windows storage uses a restricted DACL for the current SID and SYSTEM; other platforms use mode 0700, although automatic client mutation remains Windows-only. Private backups may contain unrelated credentials and must remain local. Installer reports never copy them.

Each configuration and guide change uses a sibling temporary file, validates the current hash again before rename, flushes the temporary, preserves the original file DACL on Windows, and verifies the resulting hash. A denied write, active file lock or ACL-copy error fails without weakening security controls. No filesystem can atomically commit all client files; the journal records each client transition. `reconcile` compares current bytes with prepared and installed hashes without retrying a partial write. Remove uses owned semantic keys and the exact unchanged guide block, preserving later unrelated edits. Edited owned entries remain untouched and report `MANUAL_RECONCILIATION_REQUIRED`.

CAS protects against edits observed before rename, together with the installer lock. The operating system does not offer portable conditional rename against arbitrary external writers. A hostile same-user process racing the last check remains outside the guarantee. Reparse points and symlinks are refused. An interrupted process can leave `transaction.lock`; inspect its PID and receipt before removing that exact stale lock. The installer never guesses that a lock is stale.

Native CLI writers are not used until their preservation behavior has been tested for each version. The current fallback edits exact file keys and validates semantic deltas. Keep desktop clients closed during an intentional apply if they rewrite configuration.

## Verification and distribution

`verify --level configured` checks one effective registration and its guide. `--level native` reports BLOCKED until a real client tool invocation is captured; a settings command does not count as agent invocation. `--level protocol` uses the actual MCP SDK transport against the fixed public endpoint, verifies server identity, eight read-only tools, four resources, a bundled read and a harmless local-only routing call. One shared endpoint probe does not prove six native clients. Authentication is never claimed for anonymous public access. Refresh or login requirements stay explicit.

```powershell
node --test tests/installer/*.test.mjs
node scripts/package-installer.mjs
```

Packaging creates an executable npm tarball, reviewed dependency shrinkwrap and SHA-256 manifest under `artifacts/installer`. It prunes the existing source lock offline and rejects dependency versions or integrity values absent from that lock. It never publishes to a registry or contacts an external installer service. Install the reviewed local tarball with `npm install --ignore-scripts <actual-tarball-path>` and invoke `node node_modules/soren-agents-installer/scripts/setup-agents.mjs inspect --agents all`. The manifest proves integrity only. It is unsigned and is not a trusted release signature. An owner-controlled signed release pipeline remains a separate release gate.

`update --channel stable --plan-only` returns BLOCKED while a trusted signed release source is unavailable. No implicit download, update, install, or background repair occurs.
