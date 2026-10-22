# Non-production gateway store evidence

- `reconciliation.json` — read-only reconciliation of `soren-mcp-v3-gateway-preview` (2026-10-22): public probes, structural verification (the owner's independent SQL inspection, cross-checked against migrations 0001–0005), the owner's ES256 key-custody confirmation, the Vercel preview environment-variable deviation, the unchanged production baseline, and the remaining gates. No credential values are recorded anywhere in this directory.
- `vercel-corrections.json` — the owner-approved correction of the preview environment variables (2026-10-22): the operator's re-scopes, the two record deletions and the `SOREN_RATE_KEY` creation applied by this workspace, the verified end-state (every gateway variable Preview-only, no production targets), and the deployment impact. No values are recorded.
- Supersedes the "Project env vars: none" snapshot in `evidence/v3/preview/vercel-preview.md` for the preview project's env state as of 2026-10-22T19:21Z; that file remains an accurate record of its own observation time.
- The live probe outputs will be added here after the owner-supplied gateway JWT is verified and the approved bounded probe writes run.
