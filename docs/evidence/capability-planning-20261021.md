# Capability planning implementation evidence — October 21, 2026

## Source and execution scope

- Project: `sorensadrgit-art/Soren-MCP_1`.
- Main baseline: `cf851014c6aff9d51f967d18ea9cc2b950c6bb7f`.
- Catalog/research baseline: `8adcd5eb26305556de585e36cad217755938ead6` (PR #3).
- Reused TypeSafe advisor baseline: `21629918d7d5a233de2393267ae99e5fe778b5a0` (PR #2); its source was inspected, copied and hardened. Neither PR was merged into main during implementation.
- Runtime: connected Linux VPS, Node.js 22.23.3, isolated temporary checkout and unprivileged `nobody` process with a cleared environment. No production or signing credentials were supplied to the build.
- Dependencies: existing lockfile, `npm ci --ignore-scripts --no-audit --no-fund`. No new package or lockfile change.
- Actual test server: built Next.js application on `127.0.0.1:39187`, started only for verification and terminated afterward. This is candidate-runtime evidence, not public production or desktop-client evidence.

## Test-first execution

The first planner test failed because the planner module did not exist. After implementation, 34 initial planner/TypeSafe tests passed. Adversarial tests then reproduced four issues: response-body timeout escaping the initial deadline, private scope being reduced to provided-only, execute-then-inspect being classified read-only, and a read hint hiding an explicit requested workflow action. All four were corrected and the tests passed.

A second review reproduced weak output enum validation, primary/recommendation inconsistency, and public research steps remaining planned under private scope. Output validation and workflow projection were strengthened; all corresponding regressions passed.

Research scenario E22 initially failed because it expected Firecrawl from an unnamed mirrored source. The implementation retains the safer `NEEDS_REVIEW` result with no guessed publisher. The historical research fixture is unchanged; this explicit ruling appears in the scenario test. Research cases that assume target connections are available permit a conservative `NEEDS_*` result because public callers cannot prove host readiness. These are deterministic scenario checks, not a live model-quality benchmark.

## Fresh final verification

| Check | Observed outcome |
|---|---|
| Focused planner, boundary, projection, scenario and TypeSafe tests | 69 passed; zero failed/skipped |
| Full `npm test` | 220 tests: 218 passed, zero failed, 2 skipped |
| Two skipped tests | Existing Windows file-sharing lock and Windows directory-DACL checks, inapplicable on this Linux runner |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, including the actual MCP route |
| `git diff --check` | Passed |
| `node scripts/verify-capability-plan.mjs http://127.0.0.1:39187/api/mcp` | 14/14 passed against the final built candidate |

The HTTP suite verified initialization, unchanged eight-tool inventory and four resources, advertised opt-in fields, exact unchanged local response with the flag absent/false, schema-valid data workflow, private scope suppression, rejection of invented authority and unknown IDs, explicit opt-in requirements, bundled content reading, independent concurrent requests, local-mode suppression of paid advice, and no-match handling.

## Delivered behavior

The catalog's 30 entries and five recipes are now connected to the optional `route_task.capabilityPlan` projection. Plans return source references, effects, missing preconditions and verification steps without installing or executing candidates. The existing TypeSafe advisor is optional and server-disabled by default; the planner remains functional without a key. The model can only reorder already eligible bundled recommendations and cannot grant approval or alter plan prerequisites.

## Not verified or changed

- No live authenticated TypeSafe inference or credit/billing operation.
- No new provider connection, third-party package installation, private-memory transfer, OAuth setup, or hosted registry activation.
- No native desktop-client invocation in this implementation batch.
- No Vercel deployment, production promotion, scheduler activation, or updater arming.
- The separate authentication/preflight PR #1 and its hosted blockers are unchanged.
- Source-publication hash comparison and GitHub CI outcomes must be reported from their actual later observations, not inferred from these local results.

## Verification commands

```text
npm test
npm run typecheck
npm run build
node scripts/verify-capability-plan.mjs <explicit candidate MCP endpoint>
```

Production activation remains subject to the repository's existing review, identity, staging and owner gates. No additional long-running router was installed.
