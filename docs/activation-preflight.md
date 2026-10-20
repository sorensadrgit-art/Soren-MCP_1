# Activation preflight: configuration is not verification

Run this diagnostic in the authorized runtime being prepared. It is read-only, uses no network, does not load `.env` files automatically, does not open trust or credential files, and never changes updater mode, deployments, schedules, or client configuration.

```sh
npm run activation:preflight
npm run activation:preflight -- --component privateIdentity
npm run activation:preflight -- --component watcher
npm run activation:preflight -- --component releaseRunner
```

## Output and exit codes

Each component reports `INCOMPLETE`, `INVALID`, or `READY_FOR_PROBE`, the required/missing **variable names**, validation issue codes, and `verified: false`. Credential values, local paths, and arbitrary environment contents are not returned. `READY_FOR_PROBE` means only that the inspected configuration shape passes these local checks; it is not proof of authentication, tenant isolation, cryptographic trust, schedule delivery, or health.

Exit `2` means activation is still gated, including when every inspected component is ready for live probes. Exit `64` means invalid CLI arguments. `--help` exits `0`. The report always retains `productionModified: false`, `promotionAuthorized: false`, `updaterArmed: false`, and live evidence requirements. No command in this diagnostic activates production.

## Separate runtime ownership

| Component | Where to inspect it | What still needs actual evidence |
| --- | --- | --- |
| `privateIdentity` | Private authenticated API runtime | Hosted signature/session verification, app audience/resource/client binding, grants and tenant tests |
| `management` | Interactive management runtime | Owner/reviewer session, recent authentication, origin/CSRF and explicit approval |
| `gatewayStore` | Public gateway's narrow storage/quota identity | Real role isolation and absence of elevated/deploy/signing secrets from that runtime |
| `maintenance` | Authenticated dispatcher/worker | Owner-entitled persisted schedule, authenticated delivery, duplicate handling and durable heartbeat |
| `watcher` | A separately hosted observer | Distinct failure domain, authentic receipts, missed-heartbeat detection and cadence suitable for probation |
| `releaseRunner` | Protected release execution environment | Authentic signing/trust, trusted CLI bytes, exact staged artifact/evidence and owner authorization |

**Do not copy all template values into one Vercel project to make this report green.** `.env.example` is a catalogue of names across roles, not a recommended global secret set. Configuration checks reject identical gateway and management key strings, but distinct strings still do not prove deployment-level secret confinement.

The 900-second best-effort watcher configuration is not silently treated as the one-minute independent observation required for automated probation. A same-domain watcher configuration is rejected. Both domain labels and a one-minute cadence still require real delivery evidence.

`SOREN_RELEASE_TRUST_JSON` remains a valid server-ingress configuration field. The release CLI separately requires an owner-provisioned `SOREN_RELEASE_TRUST_FILE`; the diagnostic never substitutes one for the other, accepts candidate-provided trust, or reads either credential value into its report.

## Existing safeguards remain in effect

The production release controller's atomic-parent-CAS limitation remains enforced. This diagnostic cannot waive it, arm automatic promotion, approve changed skill content, or turn historical tests into current hosted evidence.

The complete release criteria remain in `docs/acceptance-matrix.csv`. Run real client invocations, database/auth isolation checks, signed-stage verification and scheduled-delivery tests before changing their statuses.
