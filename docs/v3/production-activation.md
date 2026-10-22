# V3 production activation plan

Status: **prepared, not executed.** Nothing in this document has been run against production. Activation needs the owner's explicit approval for the exact commit and deployment.

## What activation changes

Setting `SOREN_V3_TOOLS=1` on the production deployment registers six advisory tools and adds 52 resources (44 knowledge and 8 recipe). It changes no legacy tool behavior. The V3 tools read bundled catalogs only: no outbound network calls, no writes, no credential use.

## Preconditions

1. The draft PR is reviewed and merged to `main` by the owner. The merge commit is recorded.
2. The production deployment is built from that commit. The live deployment currently runs 2.4.0, which differs from main; see `docs/v3/drift-reconciliation.md`. The owner first decides whether 2.5.0 replaces it.
3. CI on the merge commit passes: `npm run typecheck`, `test:contracts`, `test:security`, `test:routing`, `test:installer`, `test:knowledge`, `evaluate:routing`, `evaluate:v3-routing`, `build`.
4. `npm run knowledge:hash` reports no drift. No knowledge entry is stale on the activation date.
5. A preview deployment with `SOREN_V3_TOOLS=1` passes `npm run verify:mcp -- <preview-url>/api/mcp`. `scripts/probe-v3-sdk.mjs` currently targets local ports only; adapt it, or run an equivalent SDK client, before using it against a preview.

## Steps (owner-run)

1. Deploy the merge commit with the flag **off**. Run `verify:mcp` and confirm 8 tools, 22 skill resources and route_task parity with the previous release.
2. In the hosting provider's environment settings, set `SOREN_V3_TOOLS=1` for production only. Redeploy the same commit.
3. Run `npm run verify:mcp -- <production-url>/api/mcp`. Expect 14 tools; V3 checks PASS; legacy checks unchanged.
4. From one client (for example Factory Droid), make a native call to `list_capability_profiles` and `plan_toolchain`. Record the result as a `verified` observation.
5. Watch error rates and latency for 24 hours. The local p95 reference was about 15–18 ms per V3 call over loopback; production includes network time.

## Rollback

- **Fast:** remove `SOREN_V3_TOOLS` (or set it to anything other than `1`) and redeploy the same commit. V3 tools disappear, and legacy behavior is identical.
- **Full:** promote the previous production deployment through the hosting provider's rollback. See `docs/rollback.md` for the release tooling.

Both paths are reversible and do not touch client configurations.

## Out of scope

Client attachment of third-party MCP servers is a per-client user action (`docs/v3/client-attachment-plan.md`). It is not part of server activation.
