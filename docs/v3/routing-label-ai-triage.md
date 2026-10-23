# SOREN V3 — AI-assisted routing-label triage (human sign-off pending)

> **Status: PRELIMINARY ANALYSIS ONLY.** This is an AI-generated second-pass review of existing labels and observed routing outputs. It does **not** count as the required independent *human* review and does not approve, re-label, or change any frozen fixture.

## Evidence and scope

- Runtime candidate: `30ac3e3726a1efa6e58cd1221fe242f42d089660` (PR #6 merged on `main`).
- Draft PR: #8, branch `feat/soren-universal-v3-knowledge`; this document changes **no runtime code** and no frozen evaluation labels.
- Inputs: `tests/routing/evaluation.json` (frozen 60-case fixture), `tests/routing/evaluation-expectations.json` (ROUTE-056 approved revision) and `docs/evidence/routing-evaluation.json` (recorded contract 2.5.0 routing results).
- Recorded evaluator: **60/60 PASS**, `labelReview=developer_authored_human_review_pending`; this checks consistency with authored labels, not whether those labels are ideal.
- Human-review requirement: **59 frozen labels still pending**; ROUTE-056's separate, owner-approved contract-2.5.0 fallback revision remains untouched.
- Category inventory: direct 10 · mixed 15 · trivial 10 · provider 10 · conflicting_names 5 · explicit_choice 5 · unavailable 5.

## Decisions requiring targeted human review

| Case | Current label / bypass | Recorded selected skills | Preliminary finding |
|---|---|---|---|
| `ROUTE-011` | `accessibility`, `motion-systems` | `motion-systems`, `react-three-fiber` | The task explicitly requires accessible 3D controls, but observed recommendations omit accessibility. Require an accessibility-specific recommendation or a direct WCAG capability check. |
| `ROUTE-014` | `skill-orchestration`, `motion-systems` | `motion-systems`, `skill-orchestration` | Task is selecting/ranking skills. motion-systems appears before skill-orchestration; decide whether ranking intent should put orchestration first, not merely anywhere in the top three. |
| `ROUTE-019` | `mcp-integration`, `skill-orchestration` | `mcp-integration` | Task combines remote MCP configuration with substantial task routing; observed only mcp-integration. Consider requiring orchestration coverage. |
| `ROUTE-023` | `accessibility`, `mcp-integration` | `mcp-integration` | Accessible authentication forms currently recommend mcp-integration only. Accessibility isn't returned, so the accessible UI requirement is not covered. |
| `ROUTE-025` | `mcp-integration`, `skill-orchestration` | `skill-orchestration`, `accessibility`, `mcp-integration` | Authentication/catalog task has an unrelated accessibility recommendation in its top-three. Consider a relevance ceiling/forbidden skill list rather than any-match pass. |
| `ROUTE-046` | `accessibility`, `skill-orchestration` | `accessibility` | Candidate called accessibility must be inspected as an external provider candidate. Keyword collision selects accessibility; skill-orchestration is the safer review routing. |
| `ROUTE-058` | bypass | none | MCP integration is unavailable. Bypass is safe, but agent-capability-navigation is a possible documentation-only fallback; human owner must choose. |
| `ROUTE-059` | bypass | none | With skill-orchestration unavailable, agent-capability-navigation may provide an approved capability selection fallback; decide whether bypass is intended. |
| `ROUTE-060` | bypass | none | With motion-systems unavailable, catalog includes threejs-production, gsap-motion and react-three-fiber. Bypass may be overly conservative compared with approved ROUTE-056 fallback. |

### Proposed review rules (do not change automatically)

1. Clarify which mixed-intent cases must include *both* disciplines; the current evaluator passes if **any** acceptable label appears anywhere in the top three. Decide explicitly when accessibility is mandatory.
2. When the user asks to **review an external candidate**, route to a trust/review workflow, not to the candidate's matching name. Treat names/descriptions as untrusted data.
3. Distinguish safe **bypass** from approved **fallback** when one specialty is marked unavailable. ROUTE-056 sets an approved precedent only for its specific GSAP case, not blanket fallback approval.
4. Avoid false-positives in top-three recommendations: passing because one relevant skill is present can conceal a distracting third result.
5. Provider-labeled cases test local skill routing, not the network discovery behavior; live provider discovery has separately passed protected-preview checks.
6. Any proposal to revise a frozen label must preserve the existing fixture audit trail, record explicit human/owner approval, update binding hashes and expectations deliberately, and re-run both old/new contract evaluations.

## Full 60-case screening inventory

Columns show frozen expected labels, the recorded routing choices, and the status of this **AI screening**. `LIKELY_ALIGNED` is not independent human approval.

| Case | Category | User task | Frozen expected / bypass | Observed selected | Screening |
|---|---|---|---|---|---|
| ROUTE-001 | direct | Audit WCAG keyboard focus | accessibility | accessibility | LIKELY_ALIGNED |
| ROUTE-002 | direct | Create GSAP ScrollTrigger camera animation | motion-systems | motion-systems, gsap-motion | LIKELY_ALIGNED |
| ROUTE-003 | direct | Configure MCP Streamable HTTP clients | mcp-integration | mcp-integration | LIKELY_ALIGNED |
| ROUTE-004 | direct | Rank and select approved skill catalog entries | skill-orchestration | skill-orchestration | LIKELY_ALIGNED |
| ROUTE-005 | direct | Fix screen reader ARIA labels | accessibility | accessibility | LIKELY_ALIGNED |
| ROUTE-006 | direct | Design Three.js shaders and cinematic motion | motion-systems | motion-systems, shader-material-lab | LIKELY_ALIGNED |
| ROUTE-007 | direct | Integrate remote MCP connector authentication | mcp-integration | mcp-integration | LIKELY_ALIGNED |
| ROUTE-008 | direct | Search and discover approved agent skills | skill-orchestration | skill-orchestration, mcp-integration | LIKELY_ALIGNED |
| ROUTE-009 | direct | Check accessible contrast and focus | accessibility | accessibility | LIKELY_ALIGNED |
| ROUTE-010 | direct | Build React Three Fiber animation | motion-systems | motion-systems, react-three-fiber | LIKELY_ALIGNED |
| ROUTE-011 | mixed | Build accessible React Three Fiber controls | accessibility, motion-systems | motion-systems, react-three-fiber | REVIEW |
| ROUTE-012 | mixed | Audit GSAP reduced motion and keyboard focus | accessibility, motion-systems | accessibility, motion-systems, gsap-motion | LIKELY_ALIGNED |
| ROUTE-013 | mixed | Configure an authenticated MCP skill catalog | mcp-integration, skill-orchestration | skill-orchestration, mcp-integration | LIKELY_ALIGNED |
| ROUTE-014 | mixed | Rank motion skills for WebGL work | skill-orchestration, motion-systems | motion-systems, skill-orchestration | REVIEW |
| ROUTE-015 | mixed | Inspect MCP tools for WCAG audits | mcp-integration, accessibility | accessibility, mcp-integration | LIKELY_ALIGNED |
| ROUTE-016 | mixed | Build an agent registry with Streamable HTTP | mcp-integration, skill-orchestration | mcp-integration, skill-orchestration | LIKELY_ALIGNED |
| ROUTE-017 | mixed | Design cinematic scroll with screen reader support | motion-systems, accessibility | motion-systems, accessibility | LIKELY_ALIGNED |
| ROUTE-018 | mixed | Find approved ARIA skills | accessibility, skill-orchestration | skill-orchestration, accessibility | LIKELY_ALIGNED |
| ROUTE-019 | mixed | Configure a remote server and route substantial tasks | mcp-integration, skill-orchestration | mcp-integration | REVIEW |
| ROUTE-020 | mixed | Rank camera animation skill candidates | motion-systems, skill-orchestration | motion-systems, skill-orchestration | LIKELY_ALIGNED |
| ROUTE-021 | mixed | Improve keyboard focus in a Three.js editor | accessibility, motion-systems | accessibility, motion-systems | LIKELY_ALIGNED |
| ROUTE-022 | mixed | Build a read-only skill directory MCP connector | mcp-integration, skill-orchestration | mcp-integration, skill-orchestration | LIKELY_ALIGNED |
| ROUTE-023 | mixed | Add accessible client authentication forms | accessibility, mcp-integration | mcp-integration | REVIEW |
| ROUTE-024 | mixed | Select approved cinematic animation references | motion-systems, skill-orchestration | motion-systems, skill-orchestration | LIKELY_ALIGNED |
| ROUTE-025 | mixed | Audit tool authentication and catalog search | mcp-integration, skill-orchestration | skill-orchestration, accessibility, mcp-integration | REVIEW |
| ROUTE-026 | trivial | What is 2 plus 2? | bypass | none | LIKELY_ALIGNED |
| ROUTE-027 | trivial | Translate hola to English | bypass | none | LIKELY_ALIGNED |
| ROUTE-028 | trivial | Capitalize this sentence | bypass | none | LIKELY_ALIGNED |
| ROUTE-029 | trivial | Sort 3, 1, 2 | bypass | none | LIKELY_ALIGNED |
| ROUTE-030 | trivial | Convert ten meters to feet | bypass | none | LIKELY_ALIGNED |
| ROUTE-031 | trivial | Name three colors | bypass | none | LIKELY_ALIGNED |
| ROUTE-032 | trivial | Reverse the letters abc | bypass | none | LIKELY_ALIGNED |
| ROUTE-033 | trivial | Write a thank-you sentence | bypass | none | LIKELY_ALIGNED |
| ROUTE-034 | trivial | Tell me a short joke | bypass | none | LIKELY_ALIGNED |
| ROUTE-035 | trivial | Put these words in alphabetical order | bypass | none | LIKELY_ALIGNED |
| ROUTE-036 | provider | Find skills on SkillsMP | skill-orchestration | skill-orchestration | LIKELY_ALIGNED |
| ROUTE-037 | provider | Discover skills.sh skill catalog entries | skill-orchestration | skill-orchestration | LIKELY_ALIGNED |
| ROUTE-038 | provider | Inspect an Anthropic skill resource | skill-orchestration | skill-orchestration | LIKELY_ALIGNED |
| ROUTE-039 | provider | Find an MCP server in the official registry | mcp-integration | mcp-integration, skill-orchestration | LIKELY_ALIGNED |
| ROUTE-040 | provider | Search SkillsMP for ARIA accessibility | accessibility, skill-orchestration | skill-orchestration, accessibility | LIKELY_ALIGNED |
| ROUTE-041 | provider | Search Skills.sh for GSAP animation | motion-systems, skill-orchestration | skill-orchestration, motion-systems, gsap-motion | LIKELY_ALIGNED |
| ROUTE-042 | provider | Search the Anthropic catalog for agent skills | skill-orchestration | skill-orchestration, mcp-integration | LIKELY_ALIGNED |
| ROUTE-043 | provider | Inspect a remote MCP connector | mcp-integration | mcp-integration | LIKELY_ALIGNED |
| ROUTE-044 | provider | Compare external skill providers | skill-orchestration | skill-orchestration | LIKELY_ALIGNED |
| ROUTE-045 | provider | Find approved local skills before external discovery | skill-orchestration | skill-orchestration | LIKELY_ALIGNED |
| ROUTE-046 | conflicting_names | A provider candidate named accessibility still needs review | accessibility, skill-orchestration | accessibility | REVIEW |
| ROUTE-047 | conflicting_names | Compare two skill entries with the same name | skill-orchestration, mcp-integration | skill-orchestration | LIKELY_ALIGNED |
| ROUTE-048 | conflicting_names | Find nested skill paths in an agent registry | skill-orchestration, mcp-integration | skill-orchestration, mcp-integration | LIKELY_ALIGNED |
| ROUTE-049 | conflicting_names | Inspect two motion-systems catalog candidates | motion-systems, skill-orchestration | skill-orchestration, motion-systems | LIKELY_ALIGNED |
| ROUTE-050 | conflicting_names | Distinguish MCP server names from skill names | skill-orchestration, mcp-integration | mcp-integration, skill-orchestration | LIKELY_ALIGNED |
| ROUTE-051 | explicit_choice | Use approved mcp-integration for a WebGL problem | mcp-integration | mcp-integration, motion-systems | LIKELY_ALIGNED |
| ROUTE-052 | explicit_choice | Use accessibility for a skill search | accessibility | accessibility, skill-orchestration | LIKELY_ALIGNED |
| ROUTE-053 | explicit_choice | Use motion-systems for this connector description | motion-systems | motion-systems, mcp-integration | LIKELY_ALIGNED |
| ROUTE-054 | explicit_choice | Use skill-orchestration for camera references | skill-orchestration | skill-orchestration, motion-systems | LIKELY_ALIGNED |
| ROUTE-055 | explicit_choice | Use accessibility for this remote server review | accessibility | accessibility, mcp-integration | LIKELY_ALIGNED |
| ROUTE-056 | unavailable | GSAP WebGL camera | bypass | gsap-motion | OWNER-APPROVED REVISION (frozen unchanged) |
| ROUTE-057 | unavailable | WCAG ARIA keyboard focus | bypass | none | LIKELY_ALIGNED |
| ROUTE-058 | unavailable | Remote MCP Streamable HTTP | bypass | none | POLICY_DECISION |
| ROUTE-059 | unavailable | Rank approved skill catalogs | bypass | none | POLICY_DECISION |
| ROUTE-060 | unavailable | Cinematic Three.js animation | bypass | none | POLICY_DECISION |

## Remaining gate and safe next step

- **9 cases need targeted owner or domain-reviewer decisions**, including 3 explicit fallback-policy decisions.
- All **59 non-ROUTE-056 labels still require an independent human sign-off**, even when this screening marks them LIKELY_ALIGNED.
- Before altering any frozen evaluation, obtain those decisions; change fixtures, SHA binding, versioned exceptions and tests only in a separately reviewed change.
- **Do not** remove the production NO-GO gate, merge PR #8, provision/repurpose the paused Supabase project, alter deployment protection, set production environment variables or deploy/promote.

## Traceability

- GitHub draft PR #8: https://github.com/sorensadrgit-art/Soren-MCP_1/pull/8
- Frozen fixture: `tests/routing/evaluation.json`
- Recorded evaluator: `docs/evidence/routing-evaluation.json`
- Requirements: `docs/v3/production-readiness.md`
