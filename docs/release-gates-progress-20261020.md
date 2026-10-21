# Release-gate implementation progress — October 20, 2026

Base revision: `cf851014c6aff9d51f967d18ea9cc2b950c6bb7f`
Working branch: `work/release-gates-20261020`

This batch continues the implementation plan. It does not deploy the new system, create a production schedule, arm updates, weaken operating-system controls, or treat local fixtures as hosted acceptance evidence.

## Changes implemented

**Defensive JWT binding validation.** After the managed identity service validates the token, the application now requires a JSON object claims payload and a finite numeric `nbf` whenever that optional claim is present. Strings, null, booleans, arrays and objects no longer bypass the optional not-before check. Invalid claims payloads produce a redacted 401 rather than an accidental internal exception. Numeric boundary and fractional-date behavior is preserved. Seven new rejection cases failed against the base source before the fix; the existing remote identity validation and grant checks remain mandatory. These tests stub the identity-service response: they do not demonstrate a bypass of hosted Supabase authentication.

**Offline activation diagnostics.** `npm run activation:preflight` now reports missing/invalid configuration by runtime responsibility: identity, management, gateway store, maintenance, watcher and release runner. It never reads secret files, contacts infrastructure, publishes credentials, schedules work, or grants authorization. Correctly shaped values produce `READY_FOR_PROBE`, not a claim of connection or successful activation. The diagnostic remains gated with exit code 2; argument errors use 64. See [the operating guide](activation-preflight.md).

**Configuration documentation.** `.env.example` now includes the maintenance probe and trusted release-runner fields that actual handlers consume. It explicitly separates the server's signing-trust JSON from the runner's trust-file path, and warns against putting management/deployment credentials into the public gateway.

**Independent static review.** A separate read-only Factory Droid review identified two inconsistencies in the new diagnostic: watcher cadence bounds differed from the runtime, and maintenance omitted private-probe dependencies. Both findings were reproduced with failing tests and corrected. The review did not run code or edit files and is not a full security certification.

## Verification evidence

See [the sanitized execution record](evidence/release-gates-20261020.json), [the observed Node test summary](evidence/release-gates-tests-20261020-summary.txt), and [the build transcript](evidence/release-gates-build-20261020.txt). The complete raw test transcript remains in local ignored evidence; the summary records its digest. PR CI supplies a separate reproducible full run. The record binds the base revision and changed source-file hashes. It distinguishes passing local tests from unperformed hosted release operations.

The original 65-requirement acceptance ledger is intentionally not upgraded by these tests. Hosted identity, secret confinement, signing, actual scheduler delivery, independent monitoring, target-release native desktop invocations and owner release approval still require their own evidence.

## Native client checks performed

All probes used bounded one-shot sessions and existing authorized client access. No permission-bypass flags or persistent client-configuration edits were used. They targeted the **existing V2.2 production endpoint**, not a newly staged version of this implementation.

| Client | Observed result | Acceptance interpretation |
| --- | --- | --- |
| Factory Droid | Deferred tool loading required `ToolSearch`. Subsequent native trace recorded discovery and a `route_task` call through its Script wrapper with no wrapper error. The CLI flattened the tool-result payload to `[object Object]`. | Native call activity observed; typed returned-value evidence remains insufficient. Do not mark target-release verification complete from the final model text. |
| Codex CLI | Two bounded probes, including session-local plugin isolation, failed during deferred discovery with `unsupported call: tool_searchtool_search_tool`. | No MCP invocation recorded. This is a failed probe, not proof that every Codex mode is broken. No global plugin setting was changed. |
| Claude Code | The client returned exit 0 but zero model turns: `UserPromptSubmit` was blocked because the configured `vscode_route_hook.py` file is missing. | Exit-code success is not native tool success. The hook was not removed, disabled, replaced, or bypassed. |
| Antigravity / OpenCode / Qwen | The installer was run in inspect-only mode. | No new native desktop invocation is claimed. Qwen executable was not detected in this session. |

Existing alias/guide ownership conflicts reported by the installer were preserved for review. The inspector did not rewrite working configurations merely to make them match a template.

Raw client initialization streams can include private profile/session context. They remain in the ignored local `.work-evidence/` directory. Only constrained summaries and hashes are published, not raw native transcripts or user configuration files.

## External access and activation gates

- Supabase was discoverable as an available connector, but it was not connected. No project/database/OAuth provisioning occurred. Its connection action was surfaced to the owner.
- Vercel project metadata remained readable. Environment-variable **metadata** inspection, with decryption disabled, returned HTTP 403. No Vercel CLI with separate credentials was available; no workaround or privilege escalation was attempted.
- The current production deployment remained `dpl_8efcRaKMX6uZX6fqPRJq7aEQ2NvT`. No deployment or promotion request was made in this batch.
- Real trusted signing execution, independent scheduled watcher delivery, owner-protected environment validation, and exact-artifact production authorization were not performed.
- The updater remains in its prior observe state. The existing refusal of unsupported automatic parent-CAS promotion was not weakened.

Next executable infrastructure steps are to establish authorized Supabase and Vercel environment access, verify the hosted least-privilege roles and identity flows, then perform signed staged-release and scheduled-delivery rehearsals. Those operations remain separate from this reviewable source change.
