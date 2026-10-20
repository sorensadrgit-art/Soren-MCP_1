# Update verification and operator commands

The implementation separates local rehearsal, authentic release verification and production activation. Unit tests use explicitly unsigned fixture bundles and injected verifier/provider adapters. PostgreSQL behavior tests use the real PostgreSQL engine in PGlite. Neither method proves hosted OAuth/storage, real signing entitlement, an independently scheduled watcher, real Vercel deployment bytes or production release success.

Run `npm run test:updates`. Tests cover four lanes; owner/expiry/pause; exact bytes and evidence freshness; provenance claim binding; unknown outcomes; lease fences; PostgreSQL private RPC denial; rollback fault discrimination; and Vercel HTTP/CLI adapter behavior with simulated provider responses. No test deploys, signs, changes aliases, provisions an account or arms updates.

Run `node scripts/release.mjs --rehearse` for the standalone local controller rehearsal. It asserts observe/pause denial, a simulated timeout after the provider side effect, successful exact-state reconciliation and one mutation only. Its result explicitly reports `local_fake_adapters`, no authentic signature verification, no hosted-database verification and no production change. This flag cannot be combined with a real release command.

Use `node scripts/updates-check.mjs` for a local observe report. Supply `--candidates <json-file>` for at most 50 candidates. This command never promotes or writes policy. Use the authenticated dashboard for the current durable mode; the local report does not impersonate a live control-plane query.

Use `node scripts/release.mjs --check-readiness`, `node scripts/rollback.mjs --check-readiness` or `node scripts/reconcile-release.mjs --check-readiness` to list missing configuration and capability gates. Exit code 2 means blocked. Preflight never authorizes a mutation.

The candidate directory contains `manifest.json`, `artifact.tar`, `provenance.sigstore.json`, `evidence.json` and the exact candidate `package-lock.json`. Despite its filename, `artifact.tar` contains the bounded `soren-vercel-output-v1` JSON package, including file bytes, paths, hashes and executable modes. This format deliberately has no archive links or extraction directives. Package production-built Vercel output with:

```powershell
node scripts/release.mjs --build-output .vercel/output --source <reviewed-commit> --package-output <new-artifact-path>
```

The command writes a new local file only. It requires `SOREN_RELEASE_PROJECT_ID` and `SOREN_RELEASE_TEAM_ID`. Application packages have a separate 128 MiB and 20,000-file ceiling. The 2 MiB discovery limit still applies to staged skill packages. These limits are tested against the operating policy.

`SOREN_RELEASE_TRUST_FILE` must point outside the candidate directory to an owner-managed trust configuration. Do not use the disabled example as an active trust root. Sigstore 4.1.1 supplies the maintained certificate, transparency-log and TUF verification. Exact issuer and escaped, anchored workflow SAN matching are mandatory. Trust can contain one legacy identity or `{ "enabled": true, "identities": [...] }` with at most two explicit owner-approved build/staged workflow identities. No wildcard or candidate-provided trust is accepted. The authenticated SLSA v1 statement binds artifact, repository, workflow path/ref, source commit, lockfile digest and policy digest. Full release verification additionally requires a `verification-evidence.json` subject with the SHA-256 of the exact `evidence.json` bytes. Authenticated evidence bytes are parsed directly; a contradictory array or duplicate required check is rejected.

The manifest binds source commit, lockfile, artifact, policy, project/environment, expected parent, catalog generation, schema range, human approval identifiers, provenance identity/reference and expiry. The verifier reads the checkout's locked dependencies and operating-policy bytes. No example deployable manifest, key or fabricated signature is provided.

```powershell
node scripts/verify-release.mjs --input <candidate-directory>
node scripts/release.mjs --input <candidate-directory> --stage --policy-generation <generation>
node scripts/release.mjs --input <candidate-directory> --deployment <exact-staged-id> --manual --policy-generation <generation>
node scripts/reconcile-release.mjs --input <candidate-directory> --intent <exact-intent-key>
node scripts/release.mjs --input <current-candidate-directory> --finish-probation --policy-generation <current-generation>
```

Run `--finish-probation` explicitly after at least 30 minutes of successful probation. It verifies the current candidate's actual bytes and signing identity, durable release binding, continuous distinct successful probes with gaps at most 60 seconds, fresh independent watcher and readiness, owner pause, approvals, revocation, security sequence, schema and catalog. It reads the production deployment and all configured aliases without changing them. The fenced database transaction independently checks the exact identity, current policy and probe coverage before recording `STABLE`; only then can a later release use this artifact as its known-good predecessor. Historical manifest expiry is allowed for this exact durable current release, with fresh safety checks; it does not authorize a stage or promotion. There is no automatic finalization scheduler.

Configured execution needs the isolated Supabase store, workspace/project/team, production domains, Vercel token, signing trust and a reviewed Vercel CLI JavaScript entry point plus its SHA-256 (`SOREN_VERCEL_CLI_PATH`, `SOREN_VERCEL_CLI_SHA256`). Credentials remain in environment/header fields. The CLI never interpolates them into a shell command. The durable owner review must already contain the exact manifest approval and stage/manual authorization. Stage authorization must be unexpired. Manual promotion authorization also binds the expected parent, policy generation, owner, project/environment, capability evidence and an expiry no more than 15 minutes ahead. Missing durable release/environment evidence blocks execution.

The owner creates those records through authenticated commands, without direct service-role SQL:

```powershell
node scripts/release.mjs --input <candidate-directory> --register --request <owner-review.json>
node scripts/release.mjs --authorize --request <owner-authorization.json>
node scripts/release.mjs --record-evidence --request <runner-observation.json>
node scripts/release.mjs --input <candidate-directory> --record-evidence --request <verification-receipt.json>
```

Owner commands use `SOREN_ADMIN_ORIGIN` and a recent human owner's `SOREN_MANAGEMENT_ACCESS_TOKEN`; the server independently verifies OAuth identity, owner membership and permission. The registration request contains `analysis`, explicit `confirmSourceReview: true`, `expectedGeneration`, `releaseSequence`, `schemaVersion`, `minimumSecureSequence` and `stageExpiresAt`. It may bind an already-staged `stagedDeploymentId`. The CLI supplies exact manifest, attestation, lockfile and evidence bytes. Registration sends metadata only, never the application package through a serverless request. The server verifies authenticated artifact identity and marks `artifactBytesVerified: false`; local controller and remote file inspection must still verify actual bytes. Candidate lockfile bytes permit reviewed dependency updates and must match both manifest and signed provenance.

An authorization request contains `releaseId`, `manifestSha256`, `projectId`, `environment`, `expectedGeneration`, `phase`, `expiresAt` and `capabilityEvidenceRef`. Allowed phases are `stage`, `manual_promotion` and `manual_rollback`. The server derives the exact rollback target from the durable known-good predecessor. Promotion requires recorded fresh staged verification before an owner can authorize it. None of these operations changes a production alias.

Evidence commands use `SOREN_EVIDENCE_ACCESS_TOKEN`. The server requires an active `updates:evidence` grant, exact configured OAuth client and database principal kind: release controller for readiness/verification/local probes, a distinct observer for independent probes. Independent observations additionally require the owner-verified scheduler principal, client, separate failure domain, actual cadence at most 60 seconds and fresh scheduler receipt. A 900-second budget watcher cannot pass. Receipt kinds are `readiness`, `verification`, `candidate_probe`, `control_probe`, `independent_probe` and `activation`. Each binds exact release/manifest/artifact/project/environment and a fresh `observation.observedAt` plus `evidenceRef`. Probe retries retain deterministic identity; contradictory data at the same observed time is rejected. Verification receipts must carry authentic exact staged evidence. A runner cannot approve source or grant owner authority.

`GET /api/admin/updates/releases` supplies a narrow, scope-bound read-only snapshot to an observer with `updates:read` and exact `SOREN_RELEASE_OBSERVER_CLIENT_ID`. It exposes `stagedDeploymentId` separately from active production `release.deploymentId`, and watcher status uses `PASS`/`FAIL`/`UNKNOWN`. It exposes no approval owner records or credentials.

Stage calls the reviewed CLI with `deploy --prebuilt --prod --skip-domain`. It creates no production alias. The adapter verifies production configuration, project/team, deployment metadata and every expected remote prebuilt file byte through Vercel's file APIs. Metadata labels alone are insufficient. If the platform does not expose the required prebuilt file bytes, verification blocks; it never treats a preview build as production-equivalent. Promotion uses the documented exact-deployment API without rebuilding, rechecks the parent and independently verifies all configured production aliases.

Full checks (`contracts`, `installer`, `security`, `operations`, `updates`, `protocol`, `browser`) must pass for the same artifact/source/lock/policy in staged production within 60 minutes. Final smoke must be at most 5 minutes old. Staged observation must cover 15 minutes with no failures or gaps above 60 seconds. A fresh independent watcher and current schema/security/catalog/budget records remain mandatory.

The build and staged-verification workflows run by manual dispatch through actual owner-review environments. Their scripts build/package/sign production-intended output and later attest exact staged results without fabricating missing checks. The release consumer downloads that exact reviewed candidate and invokes the durable flow without rebuilding during promotion. The repository currently has no activated trusted runner, signing authorization or production evidence. External activation and live acceptance rows remain `BLOCKED`/`NOT_RUN`.

Action commit revisions were resolved from the official repositories on 2026-10-20. The SDK behavior was checked against installed `sigstore` source and current Vercel tool/documentation contracts. Vercel documents `--prod --skip-domain`, `--prebuilt`, production build configuration, file inspection and exact deployment promotion. No live mutation was used to verify these capabilities.
