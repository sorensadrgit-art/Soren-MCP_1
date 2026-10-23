# SOREN Universal V3 - owner directed changes for nine routing cases

Date: 2026-10-23
Status: DECISIONS RECORDED AND IMPLEMENTED IN ISOLATED DEVELOPMENT BRANCH; NOT DEPLOYED.

The repository owner explicitly instructed in chat: "do them all changes" in reply to the nine-case review. This **supersedes the two preliminary KEEP recommendations** for ROUTE-058 and ROUTE-059. No independent reviewer has signed off on all remaining frozen labels.

Branch: `feat/soren-v3-routing-nine-20261023`
Candidate contract: `2.5.1` (unmerged development code only).
Frozen fixture: `tests/routing/evaluation.json` remains unchanged, with its SHA-256 binding preserved.
Earlier ROUTE-056 owner approval from contract 2.5.0 remains intact.

## Changes requested and observed

| Case | Owner choice | Implementation and review intent | Observed developer-branch recommendations |
|---|---|---|---|
| ROUTE-011 | CHANGE | Require accessibility specialist in accessible R3F controls; keep 3D expertise alongside. | accessibility, motion-systems, react-three-fiber |
| ROUTE-014 | CHANGE | Skill-ranking tasks should select skill-orchestration first and a motion specialist second. | skill-orchestration, motion-systems |
| ROUTE-019 | CHANGE | Remote MCP configuration + routing tasks must include mcp-integration and skill-orchestration. | mcp-integration, skill-orchestration |
| ROUTE-023 | CHANGE | Accessible authentication forms must include accessibility and mcp-integration. | accessibility, mcp-integration |
| ROUTE-025 | CHANGE | Tool authentication/catalog search should not advertise unrelated accessibility expertise. | skill-orchestration, mcp-integration |
| ROUTE-046 | CHANGE | External provider candidate name is untrusted; select candidate-review orchestration rather than auto-selecting a skill by its name. | skill-orchestration |
| ROUTE-058 | CHANGE | With mcp-integration unavailable, choose advisory agent-capability-navigation for documentation; do not claim configured MCP connectivity. | agent-capability-navigation |
| ROUTE-059 | CHANGE | With skill-orchestration unavailable, choose advisory agent-capability-navigation; do not claim deterministic ranking happened. | agent-capability-navigation |
| ROUTE-060 | CHANGE | With motion-systems unavailable, choose reviewed threejs-production for Three.js animation; never select unavailable motion-systems. | threejs-production |

## Approval boundaries

- The nine selections constitute the owner instruction to change the routing decisions; they are not independent-human approval of the other 50 outstanding frozen labels.
- All routing suggestions remain read-only, advisory and local. An external candidate name must never confer trust or authorization.
- The three legacy bypass labels ROUTE-058/059/060 are preserved in the frozen fixture and are superseded **only from contract 2.5.1** by audited versioned approvals.
- ROUTE-056 retains its original owner approval and 2.5.0 fallback behavior; old contracts retain their original labels.
- No deployment or production project was changed. PR should remain draft until CI and independent review.

## Verification

- Strict nine-case outcome tests: `tests/routing/nine-owner-review.test.mjs`.
- Versioned fixture integrity test: `tests/routing/evaluation.test.mjs`.
- Machine-readable evaluation evidence: `docs/evidence/routing-evaluation-v2.5.1.json`.
- Development evaluation: 60/60 PASS; frozen-label pass count 56 (four audited revisions, including ROUTE-056).
- Production: NO-GO; do not change Supabase, Vercel, owner-held JWT, or deployment flags.
