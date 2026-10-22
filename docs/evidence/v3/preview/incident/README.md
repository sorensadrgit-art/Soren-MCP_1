# Incident: unauthenticated exposure of the first V3 preview attempt (2026-10-22)

Status: **closed.** The exposed hostname has been detached and the deployment behind it deleted. The automation bypass secret is revoked. Both validated preview deployments remain, protected. All times are UTC.

## What happened

The first `vercel deploy --environment preview` on the new, isolated project `soren-mcp-v3-preview` was recorded as target `production`. Vercel assigned it the project's production domain `soren-mcp-v3-preview.vercel.app`. On this Hobby team, Standard Protection does not cover the production domain, so that hostname served the flag-on build without authentication.

The exposed build was the read-only MCP surface of commit `850df17` with `SOREN_V3_TOOLS=1`: the same public tools as live production plus six advisory V3 tools. The project had no environment variables, no gateway store, no TypeSafe key and no Git connection. No credential was present in the deployment for a visitor to obtain.

## Timeline

| Time | Event | Source |
|---|---|---|
| 15:55:25 | Project created | activity |
| 15:55:50 | Deployment `dpl_v1aHX5zVu3cCY2Qx7YcHMP7wc73T` created with target production | activity, deployment metadata |
| 15:56:26.6 | Two aliases assigned: the production domain and the team alias | activity, `aliasAssignedAt` |
| 15:56:27 | HeadlessChrome (sfo1) loads `/` and static chunks on the unique deployment URL, HTTP 200 | CDN request records |
| 15:56:54, 15:57:27 | Operator's own curl checks on the production domain: `/` 200, `GET /api/mcp` 405 | CDN request records |
| 15:57:28 | Operator's curl on the team alias and unique URL: 302 to Vercel login | CDN request records |
| 15:57:43 | Project paused; every hostname returns 503 | activity |
| 16:09:07 | Production domain deleted from the project | activity |
| 16:09:20 | Project unpaused; production domain stays 404 | activity |
| 16:09:47, 16:14:39 | Protected preview-target deployments created for validation | activity |
| 16:12:07 | Automation bypass secret created | activity |
| 16:59:29 | Unused production-target deployment deleted after evidence was preserved | activity, `closure-verification.json` |
| 17:01:29 | Automation bypass secret revoked | activity, `closure-verification.json` |

**Exposure window:** about 77 seconds (15:56:26.6 to 15:57:43.4), on the production domain only. The team alias and the unique deployment URL were behind Vercel Authentication. Unauthenticated curl received 302 from both at 15:57:28.

## Who accessed it

The CDN request records for 15:50 to 16:20 cover all project traffic: 243 records, no further pages and no excluded intervals. For the unused deployment and its domains they contain 30 requests:

- **18 HeadlessChrome requests** from sfo1 at 15:56:27, one second after alias assignment. They fetched only `/` and its static assets, never `/api/mcp`. This hostname refused unauthenticated curl 61 seconds later, so this client was not a public visitor. It matches Vercel's own post-deployment screenshot behaviour, but that attribution is **not verified**.
- **12 curl/8.21.0 requests** from iad1. Their user agent matches the operator's local curl, and their times match the operator's checks. Four reached the open production domain (`/` twice, `GET /api/mcp` twice, which returns 405). The other eight were later checks that received 302 or 503.

The records include no client IPs, only country, so these attributions rest on user agent, region and timing.

## Limits of this evidence

- **Runtime logs are unavailable.** Vercel returned "hobby plan does not retain runtime logs for the requested time range". Function-level records for the window cannot be inspected.
- **No unknown client appears** in the CDN request records. This does not prove that no other request was made, because Vercel's request log retention and completeness for Hobby teams are not guaranteed here.
- Even in the worst case, the reachable surface was the public read-only tool set. It held no secrets and no private data.

## Closure actions and checks (`closure-verification.json`)

1. The production domain was detached (16:09:07). It returns 404 "deployment could not be found".
2. Evidence was preserved first: deployment metadata, 88 build events, sanitized activity timeline and CDN request records (this folder).
3. Deployment `dpl_v1aHX5zVu3cCY2Qx7YcHMP7wc73T` was deleted. Its unique URL and team alias now return 404, and the project has no aliases, no domains and no production deployment.
4. Both validated preview deployments (`dpl_6Vh95ZUr9VbR54v28LgmhWkixdTx` flag on, `dpl_pNoEunbeYbA4ymiYPY5VevdSrbLo` flag off) are READY and return 302 to Vercel login without credentials.
5. The automation bypass secret (created 16:12:07, SHA-256 prefix `c9c1737f`) was revoked. Before revocation it returned 200 on both previews; after, the same secret gets 302. The project has zero bypass entries. Future automated testing needs a newly authorized secret.
6. The production project `soren-shared-mcp-skills` was not modified.

The blocked deployment `dpl_CgPF8BaC1qMA2KstpWBws3a2j3bj` was never built and serves nothing. It was left in place.

## Prevention

- Before deploying to a new project, create it with Vercel Authentication on **all** deployments, or deploy with an explicit `--target preview`. Check `target` in the deploy output before using the URL.
- Confirm that a new project has no production domain before the first deployment, or remove it immediately.
- Treat a `target: production` result on a preview project as an incident: pause the project first, then investigate.
