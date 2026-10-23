Phase E bypass lifecycle and protection evidence
observed: 2026-10-23T09:33:09Z

Target deployment: dpl_B9uW548d2RqCDVrEKeAhtTvVWY7W (target=preview)
URL: https://soren-mcp-v3-preview-26243r08f-sorensadr-gmailcoms-projects.vercel.app
Source commit: 30ac3e3726a1efa6e58cd1221fe242f42d089660 (main, merge of PR #6)

Protection model: Vercel Authentication, ssoProtection.deploymentType =
"all_except_custom_domains". No standing protectionBypass on the preview project.

Temporary automation bypass:
  - A short-lived Vercel protection-bypass secret was created to let the wire
    verifiers reach the protected preview for this Phase E run only.
  - It was sent only as the x-vercel-protection-bypass header over HTTPS to the
    *.vercel.app preview origin, was never logged, and is not stored in the repo.
  - Revoked immediately after testing via
    PATCH /v1/projects/prj_n1PULnMPv3uCy1Df7qBCnKBRzNNp/protection-bypass
    body {"revoke":{"secret":"<secret>","regenerate":false}} -> HTTP 200,
    protectionBypass now {} (empty).

Post-revoke verification:
  - Unauthenticated POST /api/mcp            -> 401 (Authentication Required)
  - POST /api/mcp with the revoked bypass    -> 406 (bypass no longer valid)

Cleanup of an unrelated accident:
  - A stray Vercel project named "soren" (prj_WUMZkKmJ5e7Upqmwox5rV06smrn8) was
    accidentally created when a 'vercel curl' invocation ran from the home
    directory. It had no deployments and no env vars. Deleted (HTTP 204) during
    cleanup; the stray ~/.vercel link was also removed. No production resource was
    affected.

Production untouched (verified after all preview testing):
  - soren-shared-mcp-skills (prj_mJgbERJNKW1V96leE2yWOzsqxkpo): latest deployment
    target=production unchanged; env var count 0; protectionBypass none.
