# Verification results

Verification date: October 20, 2026. Tested implementation revision: `f34b7719e6838bd439d6c9e38400b395589f4465`. Lockfile SHA-256: `26134ea4a7f4a40dd6df5d04451f15603e30e6d972b761c9bfe639490841de3d`. The evidence commit adds reports and the installer artifact; it does not stand in for a production deployment.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Node test suite | 151/151 passed; 0 failed; 0 skipped | [TAP record](evidence/unit-results.tap) |
| TypeScript | Passed | [Compiler record](evidence/typecheck.txt) |
| Next production build | Passed locally | [Build record](evidence/build.txt) |
| Full dependency audit | Zero reported vulnerabilities | [Audit JSON](evidence/dependency-audit.json) |
| Chromium desktop and narrow browser journeys | 32 passed; 0 unexpected; 0 skipped | [Browser results](evidence/browser-results.json) |
| Real local MCP production-server protocol | All required checks passed; optional provider checks show explicit unavailable warnings | [Protocol record](evidence/protocol.txt) |
| Native PostgreSQL independent sessions | PASS | [CI record](evidence/native-postgres.json) |
| Ubuntu / Node 22 CI | PASS | [Source-quality CI record](evidence/source-quality.json) |
| Frozen routing evaluation | 60/60 developer-labelled cases; independent label review pending | [Score and timings](evidence/routing-evaluation.json) |
| Original source and supplied package | 10 selected source files unchanged; 24 handoff payload hashes match | [Preservation record](evidence/original-source-preservation.json) |
| Publication inventory | No known credential patterns found; private profiles/raw native output excluded | [Scan scope and limits](evidence/source-scan.json) |

The machine ran Node v24.19.0 on Windows. The existing production Vercel deployment reported Node 22. Source publication does not change that deployment. Local tests use actual embedded PostgreSQL for SQL/RLS and explicitly simulated provider/signing adapters for release races. Browser owner/review success paths are labelled fixtures; unauthenticated denials and public flows use the real local server. No live OAuth owner session is claimed.

The unsigned installer tarball and SHA-256/source manifest are in `artifacts/installer/`. Its actual offline installation and six-client fixture execution are covered by the test suite. Actual host inspection and the unsuccessful isolated native Claude CLI attempt are documented in [installation-inventory.md](installation-inventory.md). Existing native client settings were not changed.

Production remains unmodified. Private Supabase/OAuth, real schedule entitlement/delivery, independent one-minute watcher evidence, secret confinement, trusted build/signing infrastructure and exact-artifact owner release authorization are not verified. The updater remains observe; Vercel automatic promotion is denied because atomic parent CAS is unavailable.

The producer builds and signs a stage candidate only. The separate trusted staged verifier checks complete remote artifact bytes, fixed source suites, actual protocol/private-read/security/readiness/browser probes, persisted independent monitoring and a real 15-minute observation before issuing fresh signed evidence. Its local tests use injected provider/crypto/clock fixtures; no live signing or staged run was performed. Source-only isolated-CI checks are retained as such in the composed staged evidence. The unchanged artifact receives a new attestation and release ID/manifest, then needs fresh owner authorization before registration of the existing staged deployment. The initial producer output cannot be promoted unchanged.

The current [65-requirement ledger](acceptance-matrix.csv) preserves every hard gate and states the observed scope and remaining gate. The [accessibility audit](evidence/accessibility-audit.json) records 22 axe scans, 71 representative contrast samples, 320px unclipped reflow, keyboard and reduced-motion checks, with labelled management fixtures. Manual screen-reader/high-contrast/all-state checks, real OAuth sessions, six native invocation transcripts, authentic signing execution and production stage/promotion/rollback were not run. See [health-verification.md](health-verification.md), [update-verification.md](update-verification.md) and [rollback.md](rollback.md) for operational limits and commands.
