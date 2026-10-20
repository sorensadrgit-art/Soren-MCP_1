# Installation inventory

Read-only inspection on October 20, 2026 detected all six clients on the Windows host. No existing client configuration or guide was changed. Paths, complete configuration, local identity hashes and credential-bearing backups are excluded from this published inventory.

| Client | Observed version | Registration inspection | Native invocation |
| --- | --- | --- | --- |
| Factory Droid | 0.244.0 | Existing alias needs explicit ownership reconciliation | NOT RUN |
| Codex | 0.157.1 | Plugin symlink needs ownership reconciliation | NOT RUN |
| Antigravity | 1.4.2 | One matching configured registration; guide absent | NOT RUN |
| OpenCode Desktop | 2.0.32 | One matching configured registration; guide absent | NOT RUN |
| Claude Code | 2.1.283 | One matching configured registration; guide absent | BLOCKED |
| Qwen Code | 0.25.3 | Client detected; no matching registration | NOT RUN |

The isolated Claude Code CLI attempt used temporary strict one-server configuration and a read-only tool allowlist. It returned no completed tool transcript. Its account status reported an OAuth login, so missing authentication is not established as the cause. `evidence/native-claude.json` records the unsuccessful attempt without native stdout or personal profile data. No desktop GUI invocation is claimed.

Installer fixtures exercise inspect, plan, apply, repeat apply, recovery and removal in temporary homes, including read-only configuration and active Windows file-sharing lock failures. A real denied-directory DACL test blocks sibling creation, verifies unchanged bytes and no temporary residue, restores the original DACL, and proves writes recover. Separate ACL-copy failure injection has not been exercised. The offline-installed npm tarball runs its real executable against six isolated client fixtures. These checks establish installer behavior within that scope; they do not establish successful native agent use.

The installer creates no resident service, startup item or scheduled task. The local application review server is a separate temporary developer process. The package integrity manifest is unsigned. An authenticated signed installer release remains a separate gate.

See `installer.md` for exact commands, conflict behavior, removal and recovery. Native acceptance remains blocked until each real client makes a harmless Soren tool call and a timestamped transcript is retained.
