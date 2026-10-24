import test from 'node:test';
import assert from 'node:assert/strict';
import { armPolicy, assertPromotionAuthority, classifyUpdate, effectiveMode, initialPolicy, pausePolicy, sha256, REQUIRED_CHECKS } from '../../lib/updates/policy.mjs';
import { parseManifest, verifyEvidence, verifyRelease, verifyProvenance } from '../../lib/updates/verification.mjs';
import { createReleaseController, rollbackEligibility, transitionRelease } from '../../lib/updates/controller.mjs';
import { runUpdateCommand } from '../../lib/updates/cli.mjs';

const now = Date.parse('2026-10-20T12:00:00Z');
const date = delta => new Date(now + delta).toISOString();
const owner = { isHuman: true, role: 'owner', subjectId: 'owner' };
function fixtures() {
  const artifact = Buffer.from('isolated-test-artifact');
  const lockfileBytes = Buffer.from('isolated-lockfile');
  const policyBytes = Buffer.from('observe-policy');
  const trust = { enabled: true, certificateIssuer: 'https://token.actions.githubusercontent.com', certificateIdentityURI: 'https://github.com/example/repo/.github/workflows/release.yml@refs/heads/stable', repository: 'https://github.com/example/repo', workflow: '.github/workflows/release.yml', ref: 'refs/heads/stable' };
  const sourceCommit = 'a'.repeat(40);
  const statement = { _type: 'https://in-toto.io/Statement/v1', predicateType: 'https://slsa.dev/provenance/v1', subject: [{ name: 'artifact', digest: { sha256: sha256(artifact) } }], predicate: { buildDefinition: { externalParameters: { workflow: { repository: trust.repository, path: trust.workflow, ref: trust.ref } }, resolvedDependencies: [{ uri: `git+${trust.repository}@refs/heads/stable`, digest: { gitCommit: sourceCommit } }, { uri: 'file:package-lock.json', digest: { sha256: sha256(lockfileBytes) } }, { uri: 'file:config/operating-policy.json', digest: { sha256: sha256(policyBytes) } }] } } };
  // This fixture tests claim binding only. It contains no signature and is never a production authenticity proof.
  const bundle = { dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from(JSON.stringify(statement)).toString('base64') } };
  let bundleBytes = Buffer.from(JSON.stringify(bundle));
  const manifest = { schemaVersion: 1, releaseId: 'release-1', sourceCommit, lockfileSha256: sha256(lockfileBytes), artifactSha256: sha256(artifact), policySha256: sha256(policyBytes), environment: 'production', projectId: 'project', expectedParentDeploymentId: 'previous', catalogGeneration: 2, schemaCompatibility: { minimum: 1, maximum: 2, destructiveMigration: false }, approvalIds: ['approval-1'], provenance: { method: 'verified_ci_attestation', verificationReference: `sha256:${sha256(bundleBytes)}`, trustedIdentity: trust.certificateIdentityURI }, createdAt: date(-120_000), expiresAt: date(3_600_000) };
  let manifestBytes = Buffer.from(JSON.stringify(manifest));
  const evidence = [...REQUIRED_CHECKS, 'final-smoke', 'staged-observation'].map(testId => ({ testId, status: 'PASS', scope: 'release', sourceRevision: sourceCommit, lockfileSha256: manifest.lockfileSha256, method: 'isolated fake adapter rehearsal', environment: 'staged_production', startedAt: date(testId === 'staged-observation' ? -1_000_000 : -120_000), finishedAt: date(-10_000), evidenceRefs: [`test-fixture:${testId}`], observed: { artifactSha256: manifest.artifactSha256, policySha256: manifest.policySha256, maximumProbeGapSeconds: 60, failures: 0 } }));
  statement.subject.push({ name: 'verification-evidence.json', digest: { sha256: sha256(JSON.stringify(evidence)) } });
  bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString('base64'); bundleBytes = Buffer.from(JSON.stringify(bundle));
  manifest.provenance.verificationReference = `sha256:${sha256(bundleBytes)}`; manifestBytes = Buffer.from(JSON.stringify(manifest));
  const policy = { ...initialPolicy(manifest), generation: 1, mode: 'armed', arming: { ownerId: 'owner', lane: 'application', channel: 'stable', projectId: manifest.projectId, environment: manifest.environment, policySha256: manifest.policySha256, expiresAt: date(86_400_000) } };
  const candidate = { lane: 'application', channel: 'stable', sourceReviewed: true, reviewedManifestSha256: sha256(manifestBytes), changedPaths: ['lib/routing/rank.mjs'], ...Object.fromEntries(['newPackages', 'newPublishers', 'newSources', 'newInstallScripts', 'permissionChanges', 'protocolChanges', 'databaseMigrations', 'runtimeMajorUpgrade', 'frameworkMajorUpgrade', 'scriptChanges', 'resourceIncrease', 'billingIncrease', 'environmentChanges', 'targetChanges', 'scheduleChanges', 'trustChanges', 'testThresholdChanges', 'allowlistChanges'].map(key => [key, false])) };
  const lease = { key: 'release:project:production', owner: 'runner', fence: 1, expiresAt: date(120_000) };
  const snapshot = { policy, candidate, activeDeploymentId: 'previous', dependenciesReady: true, budgetAvailable: true, securityIncident: false, revokedDigests: [], minimumSecureSequence: 1, releaseSequence: 2, schemaVersion: 1, catalogGeneration: 2, watcher: { status: 'PASS', observedAt: date(-1000), maxProbeIntervalSeconds: 60, independent: true }, promotionCount24h: 0, approvals: [{ id: 'approval-1', decision: 'approved', isHuman: true, manifestSha256: sha256(manifestBytes), sourceCommit, artifactSha256: manifest.artifactSha256, policySha256: manifest.policySha256 }] };
  snapshot.readinessObservedAt = date(-1000); snapshot.verification = { status: 'PASS', manifestSha256: sha256(manifestBytes), artifactSha256: manifest.artifactSha256, fullEvidenceFinishedAt: date(-1000), finalSmokeAt: date(-1000) };
  return { artifact, lockfileBytes, policyBytes, trust, bundleBytes, bundle, statement, manifest, manifestBytes, evidence, policy, candidate, lease, snapshot, now, verifier: async () => {}, policyGeneration: 1, targetDeploymentId: 'candidate' };
}

test('observe defaults, expired arming falls back, owner pause immediately invalidates generation', () => {
  const { policy, manifest, lease } = fixtures();
  assert.equal(effectiveMode(initialPolicy(manifest), now), 'observe');
  assert.equal(effectiveMode({ ...policy, arming: { ...policy.arming, expiresAt: date(-1) } }, now), 'observe');
  const paused = pausePolicy(policy, owner, now);
  assert.equal(paused.generation, 2); assert.equal(paused.arming, null);
  assert.throws(() => assertPromotionAuthority(paused, { ...manifest, policyGeneration: 1 }, lease, now), /updates_not_armed/);
  assert.throws(() => pausePolicy(policy, { ...owner, isHuman: false }, now), /human_owner_required/);
});

test('arming requires exact scope, expiring owner grant and persisted rehearsals', () => {
  const { manifest } = fixtures(); const policy = initialPolicy(manifest);
  const request = { ...manifest, expectedGeneration: 0, channel: 'stable', lane: 'application', expiresAt: date(86_400_000), entitlementEvidenceId: 'entitlement', trustEvidenceId: 'trust', watcherEvidenceId: 'watcher', providerCapabilityEvidenceId: 'provider' };
  const rehearsals = ['pause', 'unknown_outcome', 'rollback'].map(kind => ({ kind, id: kind, status: 'PASS', policySha256: manifest.policySha256, projectId: manifest.projectId, environment: manifest.environment, verifiedAt: date(-1000), evidenceRef: 'isolated-test' }));
  assert.equal(effectiveMode(armPolicy(policy, request, owner, rehearsals, now), now), 'armed');
  assert.throws(() => armPolicy(policy, request, owner, [], now), /rehearsal_missing/);
  assert.throws(() => armPolicy(policy, { ...request, expiresAt: date(31 * 86_400_000) }, owner, rehearsals, now), /arming_expiry_invalid/);
  assert.throws(() => armPolicy(policy, { ...request, projectId: 'other' }, owner, rehearsals, now), /scope_changed/);
  assert.throws(() => armPolicy(policy, { ...request, policySha256: 'b'.repeat(64) }, owner, rehearsals, now), /policy_changed/);
});

test('four lanes retain authority; semver patch and omitted risk analysis grant no approval', () => {
  const { candidate, policy } = fixtures();
  assert.equal(classifyUpdate({ lane: 'catalog_metadata' }, policy, now).automatic, true);
  for (const lane of ['skill_content', 'desktop_metadata']) assert.equal(classifyUpdate({ lane }, policy, now).automatic, false);
  assert.equal(classifyUpdate(candidate, policy, now).state, 'ELIGIBLE');
  for (const changedPaths of [['lib/security/auth.mjs'], ['lib/updates/policy.mjs'], ['.github/workflows/release.yml'], ['installer/writer.mjs'], ['../x'], ['AGENTS.md'], ['tests/security.test.mjs']]) assert.equal(classifyUpdate({ ...candidate, version: '1.0.1', changedPaths }, policy, now).state, 'REVIEW_REQUIRED');
  for (const property of ['newPublishers', 'permissionChanges', 'databaseMigrations', 'trustChanges', 'newInstallScripts', 'billingIncrease']) assert.equal(classifyUpdate({ ...candidate, [property]: true }, policy, now).state, 'REVIEW_REQUIRED');
  assert.equal(classifyUpdate({ ...candidate, newPublishers: undefined }, policy, now).state, 'REVIEW_REQUIRED');
  assert.equal(classifyUpdate({ lane: 'catalog_metadata' }, { mode: 'paused' }, now).state, 'PAUSED');
});

test('manifest schema, expiry, source/artifact/lock/policy digests and evidence bind exact bytes', async () => {
  const f = fixtures();
  assert.equal((await verifyRelease(f)).manifestSha256, sha256(f.manifestBytes));
  for (const field of ['artifact', 'lockfileBytes', 'policyBytes']) await assert.rejects(verifyRelease({ ...f, [field]: Buffer.from('changed') }), /digest_mismatch/);
  assert.throws(() => parseManifest(Buffer.from(JSON.stringify({ ...f.manifest, expiresAt: date(-1) })), now), /expired_or_future/);
  assert.throws(() => parseManifest(Buffer.from(JSON.stringify({ ...f.manifest, surprise: 'value' })), now), /schema_invalid/);
  for (const field of ['artifactSha256', 'policySha256']) {
    const evidence = structuredClone(f.evidence); evidence[0].observed[field] = 'b'.repeat(64);
    assert.throws(() => verifyEvidence(f.manifest, evidence, now), /identity_mismatch/);
  }
  const stale = structuredClone(f.evidence); stale.find(row => row.testId === 'final-smoke').finishedAt = date(-301_000); stale.find(row => row.testId === 'final-smoke').startedAt = date(-400_000);
  assert.throws(() => verifyEvidence(f.manifest, stale, now), /evidence_stale/);
  const empty = structuredClone(f.evidence); empty[0].evidenceRefs = [];
  assert.throws(() => verifyEvidence(f.manifest, empty, now), /check_not_passed/);
  const contradictory = structuredClone(f.evidence); contradictory[0].status = 'FAIL';
  await assert.rejects(verifyRelease({ ...f, evidenceBytes: Buffer.from(JSON.stringify(contradictory)), evidence: f.evidence }), /evidence_bytes_array_mismatch/);
  assert.throws(() => verifyEvidence(f.manifest, [...f.evidence, { ...f.evidence[0], status: 'FAIL' }], now), /ambiguous_or_missing_check/);
  await assert.rejects(rehearsal(f).controller.promote({ ...f, metadataOnly: true, artifact: Buffer.from('forged') }, f.lease), /artifact_digest_mismatch/);
});

test('provenance invokes maintained verifier with anchored identity; unprovisioned trust and mixed claims denied', async () => {
  const f = fixtures(); let options;
  await verifyProvenance({ ...f, verifier: async (_bundle, opts) => { options = opts; } });
  assert.equal(options.certificateIssuer, f.trust.certificateIssuer);
  assert.ok(options.certificateIdentityURI.startsWith('^') && options.certificateIdentityURI.endsWith('$'));
  assert.equal(options.tlogThreshold, 1); assert.equal(options.ctLogThreshold, 1);
  await assert.rejects(verifyProvenance({ ...f, trust: { enabled: false } }), /trust_not_provisioned/);
  await verifyProvenance({ ...f, trust: { enabled: true, identities: [f.trust] } });
  await assert.rejects(verifyProvenance({ ...f, trust: { enabled: true, identities: [f.trust] }, manifest: { ...f.manifest, provenance: { ...f.manifest.provenance, trustedIdentity: 'https://github.com/unapproved/workflow' } } }), /identity_not_owner_approved/);
  await assert.rejects(verifyProvenance({ ...f, verifier: async () => { throw new Error('signature_invalid'); } }), /signature_invalid/);
  for (const mutate of [statement => statement.subject[0].digest.sha256 = '0'.repeat(64), statement => statement.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/attacker/repo', statement => statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'b'.repeat(40), statement => statement.predicate.buildDefinition.resolvedDependencies[1].digest.sha256 = 'b'.repeat(64)]) {
    const statement = structuredClone(f.statement); mutate(statement);
    const bundle = { dsseEnvelope: { ...f.bundle.dsseEnvelope, payload: Buffer.from(JSON.stringify(statement)).toString('base64') } };
    const bundleBytes = Buffer.from(JSON.stringify(bundle));
    const manifest = { ...f.manifest, provenance: { ...f.manifest.provenance, verificationReference: `sha256:${sha256(bundleBytes)}` } };
    await assert.rejects(verifyProvenance({ ...f, bundle, bundleBytes, manifest }), /mismatch/);
  }
});

function rehearsal(f, { timeout = false } = {}) {
  const intents = new Map(); let sends = 0, applied = false, outcomes = 0, staleFence = false;
  const store = {
    snapshot: async () => f.snapshot, getIntent: async key => intents.get(key),
    assertFence: async () => { if (staleFence) throw new Error('stale_fence'); },
    beginIntent: async intent => { const row = { ...intent, status: 'PENDING' }; intents.set(intent.intentKey, row); return row; },
    markIntent: async (key, patch) => { if (staleFence) throw new Error('stale_fence'); Object.assign(intents.get(key), patch); },
    recordReleaseOutcome: async () => { outcomes++; }, enterCooldown: async () => {}, recordScheduleReconciliation: async () => {},
    probationProbes: async () => [], finishProbation: async () => {},
  };
  const provider = {
    capabilities: { atomicCompareAndSwap: true },
    activeDeployment: async () => applied ? 'candidate' : 'previous',
    inspectDeployment: async () => ({ projectId: 'project', environment: 'production', artifactSha256: f.manifest.artifactSha256, productionDomainsAssigned: false, productionConfiguration: true }),
    promote: async () => { sends++; applied = true; if (timeout) throw new Error('timeout_after_side_effect'); },
    inspectOperation: async intent => ({ outcome: applied ? 'applied' : 'unknown', deploymentId: intent.targetDeploymentId, activeDeploymentId: intent.targetDeploymentId, artifactSha256: intent.artifactSha256, projectId: intent.projectId, environment: intent.environment, aliasVerified: true }),
  };
  return { store, provider, controller: createReleaseController({ store, provider, clock: () => now, verify: verifyRelease }), sends: () => sends, outcomes: () => outcomes, stale: () => { staleFence = true; } };
}

test('provider error during mutation sets UNKNOWN_OUTCOME and triggers paused cooldown on rollback', async () => {
  const f = fixtures();
  f.snapshot.activeDeploymentId = 'candidate';
  f.snapshot.release = { releaseId: 'current', state: 'PROBATION', promotedAt: date(-1000), rollbackCount: 0, deploymentId: 'candidate', projectId: 'project', environment: 'production' };
  f.snapshot.previous = { wasStable: true, authentic: true, authorized: true, deploymentId: 'previous', sequence: 1, projectId: 'project', environment: 'production', manifestSha256: sha256(f.manifestBytes), artifactSha256: f.manifest.artifactSha256, sourceCommit: f.manifest.sourceCommit, schemaCompatibility: f.manifest.schemaCompatibility, identityVerifiedAt: date(-1000) };
  f.snapshot.rollbackProbes = { candidate: [{ id: 'probe', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000) }], control: { deploymentId: 'previous', status: 'PASS', observedAt: date(-1000) }, independent: { deploymentId: 'candidate', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000), independent: true } };

  const r = rehearsal(f);
  r.provider.activeDeployment = async () => 'candidate';
  r.provider.rollback = async () => { throw new Error('network_failure_during_rollback'); };

  let cooldownEntered = null;
  r.store.enterCooldown = async (params) => { cooldownEntered = params; };

  const current = { ...f.manifest, releaseId: 'current' };
  const intent = await r.controller.rollback({ manifest: current, previousVerification: f }, f.lease);

  assert.equal(intent.status, 'UNKNOWN_OUTCOME');
  assert.deepEqual(cooldownEntered, {
    projectId: 'project',
    environment: 'production',
    releaseId: 'current',
    until: new Date(now + 60 * 60_000).toISOString(),
    mode: 'paused'
  });
});

test('unknown outcome after sent mutation reconciles exact provider identity; never retries mutation', async () => {
  const f = fixtures(); const r = rehearsal(f, { timeout: true });
  const first = await r.controller.promote(f, f.lease); assert.equal(first.status, 'UNKNOWN_OUTCOME'); assert.equal(r.sends(), 1);
  const second = await r.controller.promote(f, f.lease); assert.equal(second.status, 'APPLIED'); assert.equal(r.sends(), 1); assert.equal(r.outcomes(), 1);
});

test('Vercel without atomic parent CAS denies automatic promotion; exact short-lived manual owner scope can promote', async () => {
  const f = fixtures(); const r = rehearsal(f); r.provider.capabilities.atomicCompareAndSwap = false;
  await assert.rejects(r.controller.promote(f, f.lease), /provider_atomic_parent_cas_unavailable/); assert.equal(r.sends(), 0);
  f.snapshot.policy.mode = 'observe'; f.snapshot.policy.arming = null;
  f.snapshot.manualAuthorization = { isHuman: true, role: 'owner', ownerId: 'owner', manifestSha256: sha256(f.manifestBytes), expectedParentDeploymentId: 'previous', policyGeneration: 1, projectId: 'project', environment: 'production', expiresAt: date(10 * 60_000), capabilityEvidenceRef: 'isolated-provider-no-cas-reviewed' };
  f.authorizationMode = 'manual';
  assert.equal((await r.controller.promote(f, f.lease)).status, 'APPLIED'); assert.equal(r.sends(), 1);
});

test('operator release command executes the complete injected nonproduction rehearsal and preserves uncertain outcome', async () => {
  const f = fixtures(); const r = rehearsal(f, { timeout: true });
  const dependencies = { loadCandidate: async () => f, verify: verifyRelease, clock: () => now, operations: { acquireLease: async () => f.lease, renewLease: async () => f.lease }, store: r.store, provider: r.provider };
  const result = await runUpdateCommand('release', ['--input', 'isolated-fake-adapter', '--deployment', 'candidate', '--policy-generation', '1'], {}, dependencies);
  assert.equal(result.status, 'UNKNOWN_OUTCOME'); assert.equal(r.sends(), 1);
  const reconciled = await runUpdateCommand('reconcile-release', ['--input', 'isolated-fake-adapter', '--intent', result.intentKey], {}, dependencies);
  assert.equal(reconciled.status, 'APPLIED'); assert.equal(r.sends(), 1);
});

test('promotion denies stale fence, pause, parent drift, watcher absence, revoked bytes, changed policy and budget', async () => {
  for (const mutate of [f => f.snapshot.policy.mode = 'paused', f => f.snapshot.activeDeploymentId = 'other', f => f.snapshot.watcher.observedAt = date(-61_000), f => f.snapshot.revokedDigests.push(f.manifest.artifactSha256), f => f.snapshot.policy.generation++, f => f.snapshot.promotionCount24h = 1, f => f.snapshot.candidate.permissionChanges = true]) {
    const f = fixtures(); mutate(f); const r = rehearsal(f);
    await assert.rejects(r.controller.promote(f, f.lease)); assert.equal(r.sends(), 0);
  }
  const f = fixtures(), r = rehearsal(f); r.stale();
  await assert.rejects(r.controller.promote(f, f.lease), /stale_fence/); assert.equal(r.sends(), 0);
  await assert.rejects(rehearsal(fixtures()).controller.promote(fixtures(), { ...f.lease, expiresAt: date(-1) }), /lease_expired/);
});

test('revocation during awaited staged inspection is rechecked immediately before any dispatch', async () => {
  const f = fixtures(); const r = rehearsal(f);
  r.provider.inspectDeployment = async () => {
    f.snapshot.revokedDigests.push(f.manifest.artifactSha256);
    return { projectId: 'project', environment: 'production', artifactSha256: f.manifest.artifactSha256, productionDomainsAssigned: false, productionConfiguration: true };
  };
  await assert.rejects(r.controller.promote(f, f.lease), /release_revoked_or_unknown/); assert.equal(r.sends(), 0);
});

test('stage authorization expiry during parent inspection denies the upload', async () => {
  const f = fixtures(); const r = rehearsal(f); let uploads = 0;
  f.snapshot.stageAuthorization = { manifestSha256: sha256(f.manifestBytes), isHuman: true, ownerId: 'owner', expiresAt: date(60_000) };
  r.provider.activeDeployment = async () => { f.snapshot.stageAuthorization.expiresAt = date(-1); return 'previous'; };
  r.provider.stage = async () => { uploads++; };
  await assert.rejects(r.controller.stage(f, f.lease), /owner_stage_authorization_required/); assert.equal(uploads, 0);
});

test('rollback previous revocation during awaited parent inspection denies the routing mutation', async () => {
  const f = fixtures(); const r = rehearsal(f); let calls = 0;
  f.snapshot.release = { releaseId: 'current', state: 'PROBATION', promotedAt: date(-1000), rollbackCount: 0, deploymentId: 'candidate', projectId: 'project', environment: 'production' };
  f.snapshot.previous = { wasStable: true, authentic: true, authorized: true, deploymentId: 'previous', sequence: 1, projectId: 'project', environment: 'production', manifestSha256: sha256(f.manifestBytes), artifactSha256: f.manifest.artifactSha256, sourceCommit: f.manifest.sourceCommit, schemaCompatibility: f.manifest.schemaCompatibility, identityVerifiedAt: date(-1000) };
  f.snapshot.rollbackProbes = { candidate: [{ id: 'probe', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000) }], control: { deploymentId: 'previous', status: 'PASS', observedAt: date(-1000) }, independent: { deploymentId: 'candidate', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000), independent: true } };
  r.provider.activeDeployment = async () => { f.snapshot.revokedDigests.push(f.manifest.artifactSha256); return 'candidate'; };
  r.provider.rollback = async () => { calls++; };
  await assert.rejects(r.controller.rollback({ manifest: { ...f.manifest, releaseId: 'current' }, previousVerification: f }, f.lease), /rollback_denied/); assert.equal(calls, 0);
});

test('rollback rejects previous schema metadata that contradicts verified manifest before mutation', async () => {
  const f = fixtures(); f.manifest.schemaCompatibility = { minimum: 5, maximum: 6, destructiveMigration: false }; f.manifestBytes = Buffer.from(JSON.stringify(f.manifest));
  f.snapshot.release = { releaseId: f.manifest.releaseId, state: 'PROBATION', promotedAt: date(-1000), rollbackCount: 0, deploymentId: 'candidate', projectId: 'project', environment: 'production' };
  f.snapshot.previous = { wasStable: true, authentic: true, authorized: true, deploymentId: 'previous', sequence: 1, environment: 'production', projectId: 'project', artifactSha256: f.manifest.artifactSha256, manifestSha256: sha256(f.manifestBytes), sourceCommit: f.manifest.sourceCommit, schemaCompatibility: { minimum: 1, maximum: 2, destructiveMigration: false }, identityVerifiedAt: date(-1000) };
  const r = rehearsal(f); let rollbackCalls = 0; r.provider.rollback = async () => { rollbackCalls++; };
  await assert.rejects(r.controller.rollback({ manifest: f.manifest, previousVerification: f, previous: f.snapshot.previous, release: f.snapshot.release }, f.lease), /previous_exact_artifact_verification_failed/);
  assert.equal(rollbackCalls, 0);
});

test('expired historical manifest is usable only for the exact durable known-good predecessor', async () => {
  const f = fixtures(); f.manifest.createdAt = date(-7_200_000); f.manifest.expiresAt = date(-3_600_000); f.manifestBytes = Buffer.from(JSON.stringify(f.manifest));
  f.snapshot.activeDeploymentId = 'candidate';
  f.snapshot.release = { releaseId: 'current', state: 'PROBATION', promotedAt: date(-1000), rollbackCount: 0, deploymentId: 'candidate', projectId: 'project', environment: 'production' };
  f.snapshot.previous = { wasStable: true, authentic: false, authorized: true, deploymentId: 'previous', sequence: 1, projectId: 'project', environment: 'production', manifestSha256: sha256(f.manifestBytes), artifactSha256: f.manifest.artifactSha256, sourceCommit: f.manifest.sourceCommit, schemaCompatibility: f.manifest.schemaCompatibility };
  f.snapshot.rollbackProbes = { candidate: [{ id: 'probe', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000) }], control: { deploymentId: 'previous', status: 'PASS', observedAt: date(-1000) }, independent: { deploymentId: 'candidate', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000), independent: true } };
  const r = rehearsal(f); let calls = 0, rolled = false;
  r.provider.activeDeployment = async () => rolled ? 'previous' : 'candidate';
  r.provider.rollback = async () => { calls++; rolled = true; };
  r.provider.inspectSchedules = async () => [];
  r.provider.inspectOperation = async intent => ({ outcome: 'applied', deploymentId: 'previous', activeDeploymentId: 'previous', artifactSha256: intent.artifactSha256, projectId: 'project', environment: 'production', aliasVerified: true });
  const current = { ...f.manifest, releaseId: 'current' };
  const arbitrary = { ...f, manifestBytes: Buffer.from(JSON.stringify({ ...f.manifest, releaseId: 'arbitrary-old-release' })) };
  await assert.rejects(r.controller.rollback({ manifest: current, previousVerification: arbitrary }, f.lease), /previous_exact_artifact_verification_failed/); assert.equal(calls, 0);
  await assert.rejects(r.controller.rollback({ manifest: current, previousVerification: f, authorizationMode: 'manual' }, f.lease), /exact_manual_rollback_authorization_required/); assert.equal(calls, 0);
  assert.equal((await r.controller.rollback({ manifest: current, previousVerification: f }, f.lease)).status, 'APPLIED'); assert.equal(calls, 1);
  await assert.rejects(verifyRelease({ ...f, evidenceRequired: false }), /manifest_expired/);
});

test('rollback requires candidate fault, healthy control, independent corroboration, safe previous release and one probation attempt', () => {
  const f = fixtures();
  const input = { release: { state: 'PROBATION', promotedAt: date(-100_000), rollbackCount: 0, deploymentId: 'candidate', projectId: 'project', environment: 'production' }, previous: { deploymentId: 'previous', authentic: true, authorized: true, environment: 'production', projectId: 'project', sequence: 1, artifactSha256: 'd'.repeat(64), manifestSha256: 'e'.repeat(64), schemaCompatibility: { minimum: 1, maximum: 2, destructiveMigration: false } }, snapshot: f.snapshot, probes: { candidate: [{ id: 'probe-1', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000) }], control: { deploymentId: 'previous', status: 'PASS', observedAt: date(-1000) }, independent: { deploymentId: 'candidate', status: 'FAIL', failureClass: 'core_contract', observedAt: date(-1000), independent: true } }, now };
  assert.equal(rollbackEligibility(input).eligible, true);
  for (const mutate of [x => x.release.rollbackCount = 1, x => x.release.promotedAt = date(-31 * 60_000), x => x.previous.sequence = 0, x => x.snapshot.revokedDigests.push(x.previous.artifactSha256), x => x.previous.schemaCompatibility.minimum = 3, x => x.probes.candidate[0].failureClass = 'provider_timeout', x => x.probes.independent.failureClass = 'provider_timeout', x => x.probes.control.status = 'FAIL']) {
    const changed = structuredClone(input); mutate(changed); assert.equal(rollbackEligibility(changed).eligible, false);
  }
  const repeated = structuredClone(input); repeated.probes.candidate = Array(3).fill({ id: 'same', status: 'FAIL', failureClass: 'local_functionality', observedAt: date(-1000) });
  assert.equal(rollbackEligibility(repeated).eligible, false);
});

test('probation cannot become stable without full 30-minute one-minute probe coverage', async () => {
  const f = fixtures(), r = rehearsal(f);
  Object.assign(f.snapshot, { manifestSha256: sha256(f.manifestBytes), artifactSha256: f.manifest.artifactSha256, sourceCommit: f.manifest.sourceCommit, activeDeploymentId: 'candidate', stagedDeploymentId: 'candidate', release: { state: 'PROBATION', promotedAt: date(-30 * 60_000), releaseId: 'release-1', deploymentId: 'candidate', rollbackCount: 0 } });
  await assert.rejects(r.controller.finishProbation(f, f.lease), /probe_gap/);
  assert.equal(transitionRelease('PROMOTING', 'UNKNOWN_OUTCOME'), 'UNKNOWN_OUTCOME');
  assert.throws(() => transitionRelease('UNKNOWN_OUTCOME', 'PROMOTING'), /invalid_release_transition/);
});

test('probation finalization rechecks pause, revocation, security and exact active alias after inspection', async () => {
  for (const change of [snapshot => snapshot.policy.mode = 'paused', snapshot => snapshot.revokedDigests.push(snapshot.artifactSha256), snapshot => snapshot.securityIncident = true, snapshot => snapshot.watcher.status = 'UNKNOWN', snapshot => snapshot.activeDeploymentId = 'other']) {
    const f = fixtures(), r = rehearsal(f); let finished = 0;
    Object.assign(f.snapshot, { manifestSha256: sha256(f.manifestBytes), artifactSha256: f.manifest.artifactSha256, sourceCommit: f.manifest.sourceCommit, activeDeploymentId: 'candidate', stagedDeploymentId: 'candidate', release: { state: 'PROBATION', promotedAt: date(-30 * 60_000), releaseId: 'release-1', deploymentId: 'candidate', rollbackCount: 0 } });
    r.store.probationProbes = async () => Array.from({ length: 31 }, (_, index) => ({ observedAt: date((-30 + index) * 60_000), deploymentId: 'candidate', status: 'PASS' }));
    r.store.finishProbation = async () => { finished++; };
    r.provider.activeDeployment = async () => 'candidate';
    r.provider.inspectDeployment = async () => { change(f.snapshot); return { deploymentId: 'candidate', projectId: 'project', environment: 'production', artifactSha256: f.manifest.artifactSha256, artifactBytesVerified: true, productionConfiguration: true, productionDomainsAssigned: true, aliasVerified: true }; };
    await assert.rejects(r.controller.finishProbation({ ...f, metadataOnly: true }, f.lease)); assert.equal(finished, 0); assert.equal(r.sends(), 0);
  }
});
