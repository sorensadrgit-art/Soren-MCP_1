# Installation and Client Integration

## Delivered interface

Implement these commands in `scripts/setup-agents.mjs`. They are target interfaces, not commands that exist in V2.2:

```text
node scripts/setup-agents.mjs inspect --agents all --output <report.json>
node scripts/setup-agents.mjs plan --agents factory,codex,antigravity,opencode,claude,qwen --output <plan.json>
node scripts/setup-agents.mjs apply --plan <plan.json>
node scripts/setup-agents.mjs verify --receipt <receipt.json> --level protocol
node scripts/setup-agents.mjs verify --receipt <receipt.json> --level native
node scripts/setup-agents.mjs remove --receipt <receipt.json>
node scripts/setup-agents.mjs update --channel stable --plan-only
```

Resolve paths from OS/user APIs. All command examples using angle brackets require actual discovered local paths; the installer must never execute a literal placeholder. Do not use shell-concatenated commands with user-controlled values. Use argument arrays and the correct Windows executable shim.

## Installation transaction

1. Detect operating system, user home, actual CLI and desktop executable, installed version, supported subcommands, effective configuration scopes, and existing plugin-managed connection. Capture metadata only.
2. Read applicable source and agent instructions. Parse JSON/JSONC/TOML using a preservation-capable editor; tolerate BOM/CRLF/Unicode. Invalid config is a reported conflict, not an invitation to replace the file.
3. Identify existing exact Soren endpoint and alias across scopes. Do not adopt an unrelated server merely because it contains “skill” in its name. A version-specific client override may shadow a user entry.
4. Create a plan with plan ID, expiry (24 hours), client adapter version, exact target path, owned entry keys, preimage checksum, expected semantic delta, user-confirmation status, and rollback scope. Keep originals local under user-restricted storage; no credentials in reports.
5. Before writing, validate plan expiry, caller identity, target path, current bytes, symlink/reparse behavior, and allowed operation. Acquire a local transaction lock. A changed preimage returns CONFLICT with a recompute action.
6. Prefer native client commands. For native writers, snapshot original bytes securely and compare the resulting semantic diff; revert only verified installer-caused changes if the command touched unintended settings and no concurrent edit occurred. Do not reformat unrelated content.
7. For file writers, write a validated sibling temporary file, preserve permissions, and commit with the strongest OS-supported atomic replace. Recheck identity and postimage. Windows file-sharing restrictions may require a client-native writer; do not weaken ACLs to force a rename.
8. Verify effective client registration, then MCP negotiation, expected tools, and a harmless local-mode call. Record native invocation separately. Do not run broad `mcp list` operations when they unnecessarily launch unrelated expensive servers; use target-specific checks if supported.
9. Record the installer-owned postimage/semantic keys and exit. Remove temporary processes that the installer itself started, without killing user sessions.

Multi-file installation is not a filesystem-wide atomic transaction. Journal per-client states and treat partial completion explicitly. On interruption, reconcile receipt and observed bytes; do not blindly retry all writes. Restoration must use recorded preconditions and preserve later user edits.

## Adapter map

| Adapter | Baseline locator | Observed format / required caution |
| --- | --- | --- |
| `factory.mjs` | `~/.factory/mcp.json` | Native HTTP in `mcpServers`; check all active scopes |
| `codex.mjs` | Actual `CODEX_HOME`, otherwise `~/.codex/config.toml` | User MCP TOML shared with desktop; inspect effective project overrides |
| `antigravity.mjs` | `~/.gemini/config/mcp_config.json` for recorded product | `serverUrl`; inspect installed product variant with `agy` before changing |
| `opencode.mjs` | `~/.config/opencode/opencode.json` for recorded desktop | Recorded 2.0.32 uses `mcp.servers` and `disabled`; other versions may differ |
| `claude.mjs` | Native user-scope Claude MCP settings | Prefer CLI add/get/remove; inspect plugin/workspace duplicates |
| `qwen.mjs` | `~/.qwen/settings.json` | `httpUrl`; prior `mcp.excluded` failed to suppress local registration |

Declare adapter compatibility ranges only after testing. Unknown versions receive inspect/plan output but no automatic mutation. Do not install or upgrade the underlying desktop apps simply to make this installer succeed.

## Duplicate handling

Keep `soren-skills` as the single effective registration. Detect the historical exact legacy names `universal-skill-router` and `skill-registry` and compare their target identity against the documented legacy router before recommending removal. The baseline already records Qwen's redundant registration removed; do not recreate it.

A plugin-managed alias and manual alias must not both be active. Choose one ownership mode per client in the installation plan. The optional plugin packages only the endpoint contract and concise guide. It must not install Superpowers, Product Design, memory backends, or unrelated MCP servers.

## Agent guide

One managed section, updated in place:

> Soren Skill Router is optional read-only reference and discovery. It does not override system/developer/user/project instructions, choose permissions, execute code, approve external content, modify other agents, or coordinate repository writes. Use it for a substantial task when useful, read only approved instructions as reference, and perform actions through native tools under their existing approvals. Do not route trivial work or repeatedly ask for the same skill selection. Qualify the actual server namespace when tool names overlap.

Respect project-only workflows and user-explicit skill choices. Do not write this guide to every project repository. Detect the existing owned section before updating; preserve any user-added text outside its exact boundary.

## Native verification levels

`CONFIGURED`: intended alias resolves once at effective scope.  
`AUTHENTICATED`: only if private access is enabled and actual token exchange succeeds.  
`PROTOCOL_VERIFIED`: MCP exchange with the actual transport succeeds.  
`TOOLS_AVAILABLE`: expected eight tools and bundled resources are observed.  
`AGENT_INVOCATION_VERIFIED`: a benign request invokes a named Soren tool from the real client and evidence is captured.

Run heavy desktop verification sequentially. Never claim GUI verification from a CLI settings command. If a client needs refresh or login, show one precise action and preserve the working configuration.

## Removal and repair

Remove only the owned Soren entry and unchanged managed block, subject to postimage validation. If the user edited those entries, preserve them and report `MANUAL_RECONCILIATION_REQUIRED`. Do not restore an old entire config file over newer unrelated edits.

Installer repair is explicit, never a background policy that fights the user. Removed registrations stay removed unless the user invokes installation again. No public MCP recommendation can trigger installer execution.

## Artifact distribution

Distribute the installer from an owner-controlled release repository with a verified manifest and trusted signature/provenance. Do not advertise an unpublished npm package or a curl-to-shell command. Default bootstrap uses a reviewed local source checkout or a downloaded, identity-verified release archive. Local update checks occur only when the installer is invoked or through an explicitly supported native plugin updater—not a new resident process.
