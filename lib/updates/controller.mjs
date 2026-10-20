import { randomUUID } from 'node:crypto';
import { LIMITS, assertPromotionAuthority, classifyUpdate, digestJson, requireGate, time } from './policy.mjs';
import { verifyEvidence, verifyRelease } from './verification.mjs';
const verifyEvidenceForDispatch = (_input, verified, now) => verifyEvidence(verified.manifest, verified.evidence, now);

export const RELEASE_TRANSITIONS = Object.freeze({
  DISCOVERED: ['CLASSIFIED', 'REJECTED'], CLASSIFIED: ['REVIEW_REQUIRED', 'ELIGIBLE', 'PAUSED'],
  REVIEW_REQUIRED: ['ELIGIBLE', 'REJECTED', 'REVOKED'], ELIGIBLE: ['BUILDING', 'PAUSED', 'REVOKED'],
  BUILDING: ['BUILT', 'FAILED'], BUILT: ['STAGED', 'FAILED', 'UNKNOWN_OUTCOME'],
  STAGED: ['VERIFYING', 'REVOKED'], VERIFYING: ['APPROVED_FOR_PROMOTION', 'FAILED', 'PAUSED'],
  APPROVED_FOR_PROMOTION: ['PROMOTING', 'PAUSED', 'REVOKED'], PROMOTING: ['PROBATION', 'FAILED', 'UNKNOWN_OUTCOME'],
  UNKNOWN_OUTCOME: ['STAGED', 'PROBATION', 'ROLLED_BACK', 'FAILED', 'PAUSED'],
  PROBATION: ['STABLE', 'ROLLED_BACK', 'PAUSED', 'UNKNOWN_OUTCOME'], STABLE: ['REVOKED'],
});

export function transitionRelease(current, next) {
  requireGate(RELEASE_TRANSITIONS[current]?.includes(next), `invalid_release_transition:${current}:${next}`);
  return next;
}

function assertSnapshot(snapshot, verified, now) {
  const { manifest, manifestSha256 } = verified;
  requireGate(snapshot && snapshot.dependenciesReady === true && snapshot.budgetAvailable === true, 'dependencies_or_budget_unavailable');
  requireGate(time(snapshot.readinessObservedAt) <= now && now - time(snapshot.readinessObservedAt) <= 60_000, 'readiness_observation_stale');
  requireGate(snapshot.verification?.status === 'PASS' && snapshot.verification.manifestSha256 === manifestSha256 && snapshot.verification.artifactSha256 === manifest.artifactSha256 && time(snapshot.verification.fullEvidenceFinishedAt) <= now && now - time(snapshot.verification.fullEvidenceFinishedAt) <= LIMITS.fullEvidenceMinutes * 60_000 && time(snapshot.verification.finalSmokeAt) <= now && now - time(snapshot.verification.finalSmokeAt) <= LIMITS.smokeMinutes * 60_000, 'durable_verification_missing_or_stale');
  requireGate(snapshot.securityIncident === false, 'security_incident_or_unknown');
  requireGate(Array.isArray(snapshot.revokedDigests) && !snapshot.revokedDigests.includes(manifest.artifactSha256) && !snapshot.revokedDigests.includes(manifestSha256), 'release_revoked_or_unknown');
  requireGate(Number.isSafeInteger(snapshot.minimumSecureSequence) && Number.isSafeInteger(snapshot.releaseSequence) && snapshot.releaseSequence >= snapshot.minimumSecureSequence, 'minimum_secure_release_unknown_or_violated');
  requireGate(snapshot.schemaVersion >= manifest.schemaCompatibility.minimum && snapshot.schemaVersion <= manifest.schemaCompatibility.maximum, 'schema_incompatible');
  requireGate(snapshot.catalogGeneration === manifest.catalogGeneration, 'catalog_generation_changed');
  requireGate(snapshot.watcher?.status === 'PASS' && time(snapshot.watcher.observedAt) <= now && now - time(snapshot.watcher.observedAt) <= LIMITS.probeSeconds * 1000 && snapshot.watcher.maxProbeIntervalSeconds <= LIMITS.probeSeconds && snapshot.watcher.independent === true, 'independent_watcher_missing_or_stale');
  for (const id of manifest.approvalIds) {
    requireGate(snapshot.approvals?.some(approval => approval.id === id && approval.decision === 'approved' && approval.isHuman === true && approval.manifestSha256 === manifestSha256 && approval.sourceCommit === manifest.sourceCommit && approval.artifactSha256 === manifest.artifactSha256 && approval.policySha256 === manifest.policySha256 && !approval.revokedAt), 'exact_human_release_approval_missing');
  }
}

function assertManualAuthority(snapshot, verified, input, lease, now) {
  const { manifest, manifestSha256 } = verified;
  const authorization = snapshot.manualAuthorization;
  requireGate(snapshot.policy.mode !== 'paused' && snapshot.policy.generation === input.policyGeneration && snapshot.policy.policySha256 === manifest.policySha256, 'manual_policy_changed');
  requireGate(lease?.key === `release:${manifest.projectId}:${manifest.environment}` && time(lease.expiresAt) > now && Number.isSafeInteger(lease.fence) && lease.fence > 0, 'manual_lease_invalid');
  requireGate(authorization?.isHuman === true && authorization.role === 'owner' && authorization.ownerId && authorization.manifestSha256 === manifestSha256 && authorization.expectedParentDeploymentId === manifest.expectedParentDeploymentId && authorization.policyGeneration === snapshot.policy.generation && authorization.projectId === manifest.projectId && authorization.environment === manifest.environment && time(authorization.expiresAt) > now && time(authorization.expiresAt) <= now + 15 * 60_000 && authorization.capabilityEvidenceRef, 'exact_manual_owner_authorization_required');
}

export function rollbackEligibility({ release, previous, snapshot, probes, now = Date.now() }) {
  const reasons = [];
  if (!release || release.state !== 'PROBATION' || time(release.promotedAt) > now || now - time(release.promotedAt) > LIMITS.probationMinutes * 60_000) reasons.push('outside_probation');
  if (release?.rollbackCount !== 0) reasons.push('rollback_already_attempted');
  const fresh = probe => probe && time(probe.observedAt) <= now && now - time(probe.observedAt) <= LIMITS.probeSeconds * 1000;
  const candidateFailures = (probes?.candidate ?? []).filter(probe => typeof probe.id === 'string' && probe.id && fresh(probe) && probe.status === 'FAIL' && ['core_contract', 'integrity', 'local_functionality'].includes(probe.failureClass));
  const distinct = [...new Map(candidateFailures.map(probe => [probe.observedAt, probe])).values()];
  if (!distinct.some(probe => ['core_contract', 'integrity'].includes(probe.failureClass)) && distinct.filter(probe => probe.failureClass === 'local_functionality').length < 3) reasons.push('candidate_fault_not_proven');
  if (!fresh(probes?.control) || probes.control.status !== 'PASS' || probes.control.deploymentId !== previous?.deploymentId) reasons.push('control_not_healthy');
  if (!fresh(probes?.independent) || probes.independent.status !== 'FAIL' || probes.independent.independent !== true || probes.independent.deploymentId !== release?.deploymentId || !['core_contract', 'integrity', 'local_functionality'].includes(probes.independent.failureClass)) reasons.push('independent_failure_missing');
  if (!previous || previous.authentic !== true || previous.authorized !== true || previous.environment !== release?.environment || previous.projectId !== release?.projectId || !Array.isArray(snapshot?.revokedDigests) || snapshot.revokedDigests.includes(previous?.artifactSha256) || snapshot.revokedDigests.includes(previous?.manifestSha256)) reasons.push('previous_release_not_authorized');
  if (!Number.isSafeInteger(previous?.sequence) || !Number.isSafeInteger(snapshot?.minimumSecureSequence) || previous.sequence < snapshot.minimumSecureSequence) reasons.push('security_downgrade');
  if (!previous?.schemaCompatibility || !Number.isSafeInteger(snapshot?.schemaVersion) || snapshot.schemaVersion < previous.schemaCompatibility.minimum || snapshot.schemaVersion > previous.schemaCompatibility.maximum || previous.schemaCompatibility.destructiveMigration !== false) reasons.push('schema_incompatible');
  return { eligible: reasons.length === 0, reasons };
}

/** Store mutations must assert a database fence. Providers must reconcile immutable operation IDs before any retry. */
export function createReleaseController({ store, provider, clock = Date.now, verify = verifyRelease }) {
  function assertCurrentStage(snapshot, verified) {
    const { manifest, manifestSha256 } = verified; const authorization = snapshot.stageAuthorization;
    requireGate(['observe', 'armed'].includes(snapshot.policy.mode) && snapshot.policy.policySha256 === manifest.policySha256 && snapshot.policy.projectId === manifest.projectId && snapshot.policy.environment === manifest.environment, 'stage_policy_changed');
    requireGate(authorization?.manifestSha256 === manifestSha256 && authorization.isHuman === true && authorization.ownerId && time(authorization.expiresAt) > clock() && time(manifest.expiresAt) > clock(), 'owner_stage_authorization_required');
    requireGate(Array.isArray(snapshot.revokedDigests) && !snapshot.revokedDigests.includes(manifestSha256) && !snapshot.revokedDigests.includes(manifest.artifactSha256), 'stage_release_revoked');
  }
  function assertCurrentRollback(snapshot, verifiedPrevious, input, lease) {
    const { previous, release } = snapshot;
    requireGate(previous?.wasStable === true && release && previous.manifestSha256 === verifiedPrevious.manifestSha256 && previous.artifactSha256 === verifiedPrevious.artifactSha256 && previous.sourceCommit === verifiedPrevious.manifest.sourceCommit && digestJson(previous.schemaCompatibility) === digestJson(verifiedPrevious.manifest.schemaCompatibility), 'rollback_previous_changed');
    const eligibility = rollbackEligibility({ release, previous: { ...previous, authentic: verifiedPrevious.identity?.artifactBytesVerified === true, identityVerifiedAt: verifiedPrevious.verifiedAt, schemaCompatibility: verifiedPrevious.manifest.schemaCompatibility }, snapshot, probes: snapshot.rollbackProbes, now: clock() });
    requireGate(eligibility.eligible, `rollback_denied:${eligibility.reasons.join(',')}`);
    if (input.authorizationMode === 'manual') {
      const authorization = snapshot.rollbackAuthorization;
      requireGate(authorization?.isHuman === true && authorization.role === 'owner' && authorization.ownerId && authorization.manifestSha256 === verifiedPrevious.manifestSha256 && authorization.targetDeploymentId === previous.deploymentId && authorization.expectedParentDeploymentId === release.deploymentId && authorization.projectId === release.projectId && authorization.environment === release.environment && authorization.policyGeneration === snapshot.policy.generation && time(authorization.expiresAt) > clock() && time(authorization.expiresAt) <= clock() + 15 * 60_000, 'exact_manual_rollback_authorization_required');
    } else {
      requireGate(provider.capabilities?.atomicCompareAndSwap === true, 'provider_atomic_parent_cas_unavailable');
      assertPromotionAuthority(snapshot.policy, { projectId: release.projectId, environment: release.environment, policySha256: snapshot.policy.policySha256, policyGeneration: snapshot.policy.generation }, lease, clock());
    }
  }
  function assertCurrentPromotion(snapshot, verified, input, lease) {
    const now = clock(); const { manifest } = verified;
    const manual = input.authorizationMode === 'manual';
    if (manual) assertManualAuthority(snapshot, verified, input, lease, now);
    else {
      requireGate(provider.capabilities?.atomicCompareAndSwap === true, 'provider_atomic_parent_cas_unavailable');
      assertPromotionAuthority(snapshot.policy, { ...manifest, policyGeneration: input.policyGeneration }, lease, now);
    }
    assertSnapshot(snapshot, verified, now);
    const classified = classifyUpdate(snapshot.candidate, snapshot.policy, now);
    requireGate(snapshot.candidate.reviewedManifestSha256 === verified.manifestSha256 && (manual ? snapshot.candidate.sourceReviewed === true : classified.state === 'ELIGIBLE' && classified.automatic), 'release_review_required');
    requireGate(Number.isSafeInteger(snapshot.promotionCount24h) && snapshot.promotionCount24h < LIMITS.maxPromotionsPerDay, 'promotion_budget_exhausted');
    requireGate(snapshot.activeDeploymentId === manifest.expectedParentDeploymentId, 'parent_deployment_changed');
  }
  async function reconcile(intentKey, lease) {
    const intent = await store.getIntent(intentKey);
    requireGate(intent, 'intent_not_found');
    if (intent.status === 'APPLIED') {
      await store.recordReleaseOutcome(intent, intent.observed, lease, new Date(clock()).toISOString());
      return intent;
    }
    if (intent.status === 'NOT_APPLIED') return intent;
    const observed = await provider.inspectOperation(intent);
    requireGate(['applied', 'not_applied', 'unknown'].includes(observed?.outcome), 'provider_reconciliation_invalid');
    if (observed.outcome === 'unknown') {
      await store.markIntent(intentKey, { status: 'UNKNOWN_OUTCOME', observed }, lease);
      return { ...intent, status: 'UNKNOWN_OUTCOME', observed };
    }
    if (observed.outcome === 'applied') {
      if (intent.kind === 'stage' && !intent.targetDeploymentId) {
        await store.bindStagedDeployment(intentKey, observed.deploymentId, lease);
        intent.targetDeploymentId = observed.deploymentId;
      }
      requireGate(observed.deploymentId === intent.targetDeploymentId && observed.artifactSha256 === intent.artifactSha256 && observed.projectId === intent.projectId && observed.environment === intent.environment, 'reconciled_identity_mismatch');
      if (intent.kind !== 'stage') requireGate(observed.activeDeploymentId === intent.targetDeploymentId && observed.aliasVerified === true, 'production_alias_not_verified');
      await store.markIntent(intentKey, { status: 'APPLIED', observed }, lease);
      await store.recordReleaseOutcome(intent, observed, lease, new Date(clock()).toISOString());
      return { ...intent, status: 'APPLIED', observed };
    }
    await store.markIntent(intentKey, { status: 'NOT_APPLIED', observed }, lease);
    return { ...intent, status: 'NOT_APPLIED', observed };
  }

  async function mutate(kind, input, verified, snapshot, lease) {
    const manifest = verified.manifest;
    const payload = { kind, authorizationMode: input.authorizationMode ?? 'automatic', releaseId: manifest.releaseId, manifestSha256: verified.manifestSha256, artifactSha256: manifest.artifactSha256, projectId: manifest.projectId, environment: manifest.environment, expectedParentDeploymentId: input.expectedParentDeploymentId ?? manifest.expectedParentDeploymentId, targetDeploymentId: input.targetDeploymentId, policyGeneration: snapshot.policy.generation, catalogGeneration: manifest.catalogGeneration };
    requireGate(kind === 'stage' || typeof payload.targetDeploymentId === 'string' && payload.targetDeploymentId, 'target_deployment_required');
    const intentKey = `${kind}:${manifest.projectId}:${manifest.environment}:${manifest.releaseId}`;
    const prior = await store.getIntent(intentKey);
    if (prior && prior.payloadSha256 !== digestJson(payload)) requireGate(false, 'intent_payload_conflict');
    if (prior && prior.status !== 'NOT_APPLIED') return reconcile(intentKey, lease);
    if (prior) requireGate(input.retryConfirmedNotApplied === true, 'retry_requires_confirmed_not_applied');
    await store.assertFence(lease);
    requireGate(await provider.activeDeployment(manifest.projectId, manifest.environment) === payload.expectedParentDeploymentId, 'parent_deployment_changed');
    const latest = await store.snapshot(manifest);
    requireGate(latest.policy.generation === snapshot.policy.generation && latest.policy.mode !== 'paused', 'policy_changed_before_side_effect');
    if (kind === 'promote') {
      assertCurrentPromotion(latest, verified, input, lease);
      verifyEvidenceForDispatch(input, verified, clock());
    }
    if (kind === 'stage') assertCurrentStage(latest, verified);
    if (kind === 'rollback') assertCurrentRollback(latest, input.verifiedPrevious, input, lease);
    const intent = await store.beginIntent({ ...payload, intentKey, payloadSha256: digestJson(payload), operationId: prior?.operationId ?? randomUUID() }, lease);
    if (intent.status !== 'PENDING') return reconcile(intentKey, lease);
    await store.markIntent(intentKey, { status: 'SENT' }, lease);
    // A timeout can occur after the provider has applied the operation. Never send a second mutation here.
    try { await provider[kind]({ ...intent, artifact: input.artifact, authorizationMode: input.authorizationMode ?? 'automatic' }); }
    catch { await store.markIntent(intentKey, { status: 'UNKNOWN_OUTCOME' }, lease); return { ...intent, status: 'UNKNOWN_OUTCOME' }; }
    return reconcile(intentKey, lease);
  }

  return {
    reconcile,
    async stage(input, lease) {
      const verified = await verify({ ...input, now: clock(), evidenceRequired: false, reconciliationOnly: false, metadataOnly: false });
      const snapshot = await store.snapshot(verified.manifest);
      assertCurrentStage(snapshot, verified);
      return mutate('stage', { ...input, targetDeploymentId: null, authorizationMode: 'manual' }, verified, snapshot, lease);
    },
    async promote(input, lease) {
      const now = clock();
      const verified = await verify({ ...input, now, evidenceRequired: true, reconciliationOnly: false, metadataOnly: false });
      const { manifest } = verified;
      requireGate(manifest.environment === 'production', 'production_manifest_required');
      const snapshot = await store.snapshot(manifest);
      assertCurrentPromotion(snapshot, verified, input, lease);
      const staged = await provider.inspectDeployment(input.targetDeploymentId);
      requireGate(staged?.projectId === manifest.projectId && staged.environment === 'production' && staged.artifactSha256 === manifest.artifactSha256 && staged.productionDomainsAssigned === false && staged.productionConfiguration === true, 'exact_staged_production_artifact_required');
      return mutate('promote', input, verified, snapshot, lease);
    },
    async rollback(input, lease) {
      const snapshot = await store.snapshot(input.manifest);
      const release = snapshot.release; const recordedPrevious = snapshot.previous;
      requireGate(release && recordedPrevious?.wasStable === true && release.releaseId === input.manifest.releaseId, 'durable_rollback_state_required');
      const previousVerified = await verify({ ...input.previousVerification, now: clock(), evidenceRequired: false, reconciliationOnly: true, metadataOnly: false });
      requireGate(previousVerified.manifestSha256 === recordedPrevious.manifestSha256 && previousVerified.artifactSha256 === recordedPrevious.artifactSha256 && previousVerified.manifest.projectId === release.projectId && previousVerified.manifest.environment === release.environment && previousVerified.manifest.sourceCommit === recordedPrevious.sourceCommit && digestJson(previousVerified.manifest.schemaCompatibility) === digestJson(recordedPrevious.schemaCompatibility), 'previous_exact_artifact_verification_failed');
      const previous = { ...recordedPrevious, authentic: previousVerified.identity?.artifactBytesVerified === true, identityVerifiedAt: previousVerified.verifiedAt, schemaCompatibility: previousVerified.manifest.schemaCompatibility };
      requireGate(snapshot.policy.mode !== 'paused', 'owner_pause');
      const eligibility = rollbackEligibility({ release, previous, snapshot, probes: snapshot.rollbackProbes, now: clock() });
      requireGate(eligibility.eligible, `rollback_denied:${eligibility.reasons.join(',')}`);
      assertCurrentRollback(snapshot, previousVerified, input, lease);
      requireGate(await provider.activeDeployment(release.projectId, release.environment) === release.deploymentId, 'rollback_parent_changed');
      requireGate(previous.identityVerifiedAt && time(previous.identityVerifiedAt) <= clock(), 'previous_identity_verification_required');
      const verified = { manifest: { ...input.manifest, releaseId: release.releaseId, artifactSha256: previous.artifactSha256, expectedParentDeploymentId: release.deploymentId }, manifestSha256: previous.manifestSha256 };
      const intent = await mutate('rollback', { ...input, verifiedPrevious: previousVerified, artifact: input.previousVerification.artifact, targetDeploymentId: previous.deploymentId, expectedParentDeploymentId: release.deploymentId }, verified, snapshot, lease);
      if (intent.status === 'APPLIED') {
        await store.enterCooldown({ projectId: release.projectId, environment: release.environment, releaseId: release.releaseId, until: new Date(clock() + LIMITS.cooldownMinutes * 60_000).toISOString(), mode: 'observe' }, lease);
        const schedules = await provider.inspectSchedules();
        await store.recordScheduleReconciliation({ releaseId: release.releaseId, schedules, requiresOperator: digestJson(schedules) !== snapshot.policy.scheduleSha256 }, lease);
      } else if (intent.status === 'UNKNOWN_OUTCOME') {
        await store.enterCooldown({ projectId: release.projectId, environment: release.environment, releaseId: release.releaseId, until: new Date(clock() + LIMITS.cooldownMinutes * 60_000).toISOString(), mode: 'paused' }, lease);
      }
      return intent;
    },
    async finishProbation(input, lease) {
      const verified = await verify({ ...input, now: clock(), evidenceRequired: false, reconciliationOnly: true, metadataOnly: false });
      const { manifest, manifestSha256 } = verified;
      function assertCurrent(snapshot) {
        const now = clock(); const release = snapshot?.release;
        requireGate(verified.identity?.artifactBytesVerified === true && snapshot?.manifestSha256 === manifestSha256 && snapshot.artifactSha256 === manifest.artifactSha256 && snapshot.sourceCommit === manifest.sourceCommit, 'probation_exact_artifact_required');
        requireGate(release?.releaseId === manifest.releaseId && release.state === 'PROBATION' && release.rollbackCount === 0 && now - time(release.promotedAt) >= LIMITS.probationMinutes * 60_000, 'probation_incomplete');
        requireGate(snapshot.policy?.mode !== 'paused' && snapshot.policy?.generation === input.policyGeneration && snapshot.policy?.policySha256 === manifest.policySha256 && snapshot.policy?.projectId === manifest.projectId && snapshot.policy?.environment === manifest.environment, 'probation_policy_changed');
        requireGate(lease?.key === `release:${manifest.projectId}:${manifest.environment}` && time(lease.expiresAt) > now && Number.isSafeInteger(lease.fence) && lease.fence > 0, 'probation_lease_invalid');
        requireGate(snapshot.dependenciesReady === true && snapshot.budgetAvailable === true && time(snapshot.readinessObservedAt) <= now && now - time(snapshot.readinessObservedAt) <= 60_000 && snapshot.securityIncident === false, 'probation_readiness_or_security_unavailable');
        requireGate(Array.isArray(snapshot.revokedDigests) && !snapshot.revokedDigests.includes(manifestSha256) && !snapshot.revokedDigests.includes(manifest.artifactSha256), 'probation_release_revoked');
        requireGate(Number.isSafeInteger(snapshot.releaseSequence) && Number.isSafeInteger(snapshot.minimumSecureSequence) && snapshot.releaseSequence >= snapshot.minimumSecureSequence && snapshot.schemaVersion >= manifest.schemaCompatibility.minimum && snapshot.schemaVersion <= manifest.schemaCompatibility.maximum && snapshot.catalogGeneration === manifest.catalogGeneration, 'probation_security_schema_or_catalog_changed');
        requireGate(snapshot.watcher?.status === 'PASS' && snapshot.watcher.independent === true && snapshot.watcher.maxProbeIntervalSeconds <= LIMITS.probeSeconds && time(snapshot.watcher.observedAt) <= now && now - time(snapshot.watcher.observedAt) <= LIMITS.probeSeconds * 1000, 'independent_watcher_missing_or_stale');
        requireGate(snapshot.activeDeploymentId && snapshot.activeDeploymentId === snapshot.stagedDeploymentId && release.deploymentId === snapshot.activeDeploymentId, 'probation_active_deployment_changed');
        for (const id of manifest.approvalIds) requireGate(snapshot.approvals?.some(approval => approval.id === id && approval.decision === 'approved' && approval.isHuman === true && approval.manifestSha256 === manifestSha256 && approval.sourceCommit === manifest.sourceCommit && approval.artifactSha256 === manifest.artifactSha256 && approval.policySha256 === manifest.policySha256 && !approval.revokedAt), 'exact_human_release_approval_missing');
        return release;
      }
      async function assertCoverage(release) {
        const start = time(release.promotedAt); const now = clock();
        const sorted = (await store.probationProbes(release.releaseId)).filter(probe => time(probe.observedAt) >= start - LIMITS.probeSeconds * 1000 && time(probe.observedAt) <= now).sort((a, b) => time(a.observedAt) - time(b.observedAt));
        requireGate(new Set(sorted.map(probe => probe.observedAt)).size >= LIMITS.probationMinutes + 1 && time(sorted[0]?.observedAt) <= start && time(sorted.at(-1)?.observedAt) >= start + LIMITS.probationMinutes * 60_000 && now - time(sorted.at(-1)?.observedAt) <= LIMITS.probeSeconds * 1000 && sorted.every((probe, index) => probe.status === 'PASS' && probe.deploymentId === release.deploymentId && (!index || time(probe.observedAt) - time(sorted[index - 1].observedAt) <= LIMITS.probeSeconds * 1000)), 'probation_probe_gap_or_failure');
      }
      const snapshot = await store.snapshot(manifest); const release = assertCurrent(snapshot);
      await assertCoverage(release); await store.assertFence(lease);
      const observed = await provider.inspectDeployment(release.deploymentId);
      requireGate(observed?.deploymentId === release.deploymentId && observed.projectId === manifest.projectId && observed.environment === manifest.environment && observed.artifactSha256 === manifest.artifactSha256 && observed.artifactBytesVerified === true && observed.productionConfiguration === true && observed.productionDomainsAssigned === true && observed.aliasVerified === true && await provider.activeDeployment(manifest.projectId, manifest.environment) === release.deploymentId, 'probation_production_identity_or_alias_changed');
      const latest = assertCurrent(await store.snapshot(manifest));
      requireGate(latest.deploymentId === release.deploymentId && latest.promotedAt === release.promotedAt, 'probation_release_changed');
      await assertCoverage(latest); await store.assertFence(lease);
      await store.finishProbation({ releaseId: manifest.releaseId, manifestSha256, artifactSha256: manifest.artifactSha256, deploymentId: release.deploymentId, policyGeneration: input.policyGeneration, verifiedAt: verified.verifiedAt, artifactBytesVerified: true, observation: { ...observed, observedAt: new Date(clock()).toISOString(), activeDeploymentId: release.deploymentId } }, lease);
      return { status: 'STABLE', state: 'STABLE', releaseId: manifest.releaseId, observed: { deploymentId: release.deploymentId, aliasVerified: true }, productionModified: false };
    },
  };
}
