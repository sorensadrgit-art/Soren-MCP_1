# Live vs source drift reconciliation (2026-10-22)

Captured before any V3 change. Evidence: `docs/evidence/v3/live-inventory-before.json`, `docs/evidence/v3/local-main-inventory-before.json`, `docs/evidence/v3/baseline/`.

## Sources compared

| Copy | Location | Under git | Skills | Server version | Notes |
|---|---|---|---|---|---|
| Live production | `https://soren-shared-mcp-skills.vercel.app/api/mcp` (Vercel project `soren-shared-mcp-skills`) | n/a | 14 | 2.4.0 | 8 tools, 14 `skill://` resources, 0 prompts |
| Live deploy source | `C:\Users\soren\Projects\soren-shared-mcp-skills` (Vercel-linked folder) | **No** | 14 | — | Smaller codebase: no `lib/gateway.mjs`, no `lib/security/`, no installer; has `lib/integrations.mjs` |
| GitHub `main` | `ff60b63` | Yes | 4 | 2.2.0 | Hardened gateway, auth, installer, operations, stricter ranking |
| TypeSafe clone | `C:\Users\soren\Projects\Soren-MCP-TypeSafe-20261020` (`feature/typesafe-jev-routing`) | Yes, **uncommitted** | 14 (10 untracked) | — | Untouched by V3 work |

## Findings

1. **The 14-vs-4 discrepancy is a source-control gap, not a runtime bug.** The 10 extra skills (`21st-ui-components`, `agentic-coding`, `agentic-design-to-code`, `gsap-motion`, `motionsites-design`, `playwright-browser-qa`, `react-three-fiber`, `soren-universal-deployment`, `superpowers-engineering`, `threejs-production`) were deployed from a non-git folder and never committed. Their `SKILL.md` bytes are identical in the deploy folder and in the TypeSafe clone's untracked files (SHA-256 prefixes recorded below).
2. **The deploy folder and `main` are different codebases.** `lib/catalog.mjs`, `lib/federation.mjs`, `lib/client-contract.mjs` and `app/api/mcp/route.ts` all hash differently. `main` is the hardened line (gateway bounds, identity validation, origin checks, private reads).
3. **Tool schemas:** 6 of 8 tools are schema- and annotation-identical. `route_task` on `main` adds `discovery: "auto"`, `preferred_skills`, `unavailable_skills`; `read_skill` on `main` adds optional `privateVersion`. `main` is a strict superset of live, so live clients remain compatible with `main`'s schemas.
4. **Ranking differs.** Live matches a tag if *any* query word appears in it; `main` requires *every* word of the tag. V3 keeps `main`'s stricter ranking (covered by the frozen 60-case evaluation) and tunes tags instead.
5. **Version label drift.** Live reports `2.4.0`; `main` declares `2.2.0`. V3 declares `2.5.0` so the next deploy is monotonic.
6. **`list_providers`** on live adds `agentMcpIntegrations` (21st, MotionSites, Playwright). `main` lacks it. V3 adds it back as an additive field.

## Skill byte identity (SHA-256 prefix)

| Skill | Deploy folder | TypeSafe untracked | `main` |
|---|---|---|---|
| accessibility | 32B9B7BFD2 | 32B9B7BFD2 | 32B9B7BFD2 |
| mcp-integration | F0A84C2EE0 | F0A84C2EE0 | F0A84C2EE0 |
| motion-systems | 802E963659 | 802E963659 | 802E963659 |
| skill-orchestration | 07B3B79775 | 07B3B79775 | 07B3B79775 |
| 21st-ui-components | 61566FF9C2 | 61566FF9C2 | — |
| agentic-coding | 99EF90BCD5 | 99EF90BCD5 | — |
| agentic-design-to-code | EE5A97A37A | EE5A97A37A | — |
| gsap-motion | 2785A694A5 | 2785A694A5 | — |
| motionsites-design | 603150FF68 | 603150FF68 | — |
| playwright-browser-qa | D8561466DD | D8561466DD | — |
| react-three-fiber | 8F37DEDC4E | 8F37DEDC4E | — |
| soren-universal-deployment | 4EFEB123E7 | 4EFEB123E7 | — |
| superpowers-engineering | 06C3E262D6 | 06C3E262D6 | — |
| threejs-production | E3294FDA03 | E3294FDA03 | — |

## Decision

Git (`feat/soren-universal-v3-knowledge` from `main`) becomes the canonical source. All 14 live skills are committed without content loss; `gsap-motion`, `react-three-fiber` and `threejs-production` are then enhanced (frontmatter unchanged). The live deploy folder is not modified.

**Deployment caveat:** deploying this repository to the live Vercel project replaces the smaller deploy-folder runtime with `main`'s hardened runtime (gateway quota store, identity checks). That is an owner-gated production change; see `docs/v3/production-activation.md`.
