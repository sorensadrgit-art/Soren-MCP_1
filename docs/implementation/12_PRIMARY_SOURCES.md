# Primary Sources and Decision Notes

**Research date:** October 19, 2026. Platform behavior and entitlements can change. Work must recheck the actual installed client/SDK and owner subscription before generating operative configuration. These notes distinguish documented constraints from engineering targets chosen for this project.

| ID | Official source | Constraint informing the design |
| --- | --- | --- |
| S01 | [Vercel — Manage Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) | Authenticated cron; no automatic failure retry; duplicate/missed delivery and overlap; rollback can restore previous cron definitions |
| S02 | [Vercel — Cron Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) | Scheduling frequency/precision is plan-dependent; do not assume sub-daily Hobby support |
| S03 | [Vercel — Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment) | Test a staged production artifact; preview promotion and production promotion have different rebuild behavior |
| S04 | [Vercel — OIDC](https://vercel.com/docs/oidc) | Use supported request-context identity for server-side provider authentication; do not expose token to clients |
| S05 | [GitHub — Troubleshoot Workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows) | Scheduled workflow dispatch can be delayed or dropped; best-effort checks are not an independent availability guarantee |
| S06 | [The Update Framework — Specification](https://theupdateframework.github.io/specification/v1.0.19/) | Trusted root, metadata versions/expiry, target integrity, delegated roles, rollback/freeze defenses; use a maintained implementation |
| S07 | [GitHub — Use Artifact Attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) | Provenance verification and repository entitlement constraints; availability for private repos must be checked |
| S08 | [MCP — Authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization) | Protected-resource discovery, PKCE, token audience/resource validation, and supported client-registration mechanisms |
| S09 | [Supabase — MCP Authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) | Managed OAuth path for MCP, token lifecycle, private-client onboarding; verify actual client behavior |
| S10 | [Supabase — OAuth Server](https://supabase.com/docs/guides/auth/oauth-server) | Do not assume arbitrary custom application scopes; bind application grants explicitly |
| S11 | [Supabase — Row-Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) | Enforce per-workspace database access; elevated keys bypass normal row-level protections |
| S12 | [Skills.sh — API](https://skills.sh/docs/api) | Official catalog search/files/audit API and Vercel OIDC; honor published/returned quotas |
| S13 | [SkillsMP — Developers](https://skillsmp.com/developers) | Public read-only MCP, metadata/search distinction, per-IP limits; REST credentials do not remove MCP limits |
| S14 | [Agent Skills — Specification](https://agentskills.io/specification) | Progressive disclosure and skill package structure; avoid preloading whole libraries |
| S15 | [OpenAI — Codex MCP](https://developers.openai.com/codex/mcp) | Native client configuration/discovery; actual installed version still controls adapter behavior |

## Interpretation rules

The 5-minute target probe, 30-minute probation, 30-day arming expiry, throughput budgets, and p95 targets in this package are **proposed project policy**, not platform promises. Do not cite these as measured performance or defaults of Vercel/Supabase/GitHub.

A Vercel cron header is not authorization without the configured credential check. A scheduled workflow file is not proof it ever ran. A build provenance record is not proof the source is harmless. A public skill catalog does not guarantee licensing/approval. A passing static scanner does not establish that instructions should be trusted.

The existing code/audit was read directly from AgentZero, and current selected hashes are recorded in `evidence/source-baseline.json`. Historical tool tests were read from `AUDIT-20261019.md`, not rerun by this preparation. The prior user Library playbook `SOREN_CODEX_IMPLEMENTATION_PLAYBOOK.md` supports exact-version inventories, real invocation evidence, bounded rollback, and distinctions between configured and tested integrations; unrelated playbook prohibitions from another project's context do not override this current project's explicit future creation scope.

## Handoff capabilities

The available connector discovery did not expose an action that creates a ChatGPT Work task and returns its job/run identity. Displaying a task plan, writing files, submitting a generic GitHub issue, or sending a prompt to another builder is not equivalent to dispatching Work. This package therefore records Work dispatch as not performed, with an explicit attach-and-start instruction rather than a fabricated job receipt.
