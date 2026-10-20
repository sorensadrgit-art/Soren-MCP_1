import assert from 'node:assert/strict';
import { createReleaseController } from './controller.mjs';
import { sha256, initialPolicy, REQUIRED_CHECKS } from './policy.mjs';

/** Explicit local fixture harness. No credentials, network, signing, database or production adapter is constructed. */
export async function rehearseRelease() {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const artifact = Buffer.from('local-unsigned-rehearsal');
  const manifest = { releaseId: 'local-rehearsal', sourceCommit: 'a'.repeat(40), artifactSha256: sha256(artifact), policySha256: 'b'.repeat(64), environment: 'production', projectId: 'local-fake-project', expectedParentDeploymentId: 'local-fake-parent', catalogGeneration: 0, approvalIds: ['local-fake-approval'], schemaCompatibility: { minimum: 1, maximum: 1, destructiveMigration: false } };
  const manifestSha256 = sha256(JSON.stringify(manifest));
  const candidate = { lane: 'application', channel: 'stable', sourceReviewed: true, reviewedManifestSha256: manifestSha256, changedPaths: ['lib/routing/rehearsal.mjs'] };
  for (const key of 'newPackages newPublishers newSources newInstallScripts permissionChanges protocolChanges databaseMigrations runtimeMajorUpgrade frameworkMajorUpgrade scriptChanges resourceIncrease billingIncrease environmentChanges targetChanges scheduleChanges trustChanges testThresholdChanges allowlistChanges'.split(' ')) candidate[key] = false;
  const policy = initialPolicy(manifest);
  const snapshot = { policy, candidate, activeDeploymentId: manifest.expectedParentDeploymentId, dependenciesReady: true, budgetAvailable: true, securityIncident: false, revokedDigests: [], minimumSecureSequence: 1, releaseSequence: 1, schemaVersion: 1, catalogGeneration: 0, watcher: { status: 'PASS', observedAt: new Date(now).toISOString(), maxProbeIntervalSeconds: 60, independent: true }, promotionCount24h: 0, approvals: [{ id: 'local-fake-approval', decision: 'approved', isHuman: true, manifestSha256, sourceCommit: manifest.sourceCommit, artifactSha256: manifest.artifactSha256, policySha256: manifest.policySha256 }] };
  snapshot.readinessObservedAt = new Date(now).toISOString(); snapshot.verification = { status: 'PASS', manifestSha256, artifactSha256: manifest.artifactSha256, fullEvidenceFinishedAt: new Date(now).toISOString(), finalSmokeAt: new Date(now).toISOString() };
  const lease = { key: 'release:local-fake-project:production', owner: 'local-fake-worker', fence: 1, expiresAt: new Date(now + 120_000).toISOString() };
  const intents = new Map(); let sends = 0, applied = false;
  const store = {
    snapshot: async () => snapshot, getIntent: async key => intents.get(key), assertFence: async () => {},
    beginIntent: async row => { const intent = { ...row, status: 'PENDING' }; intents.set(row.intentKey, intent); return intent; },
    markIntent: async (key, patch) => Object.assign(intents.get(key), patch), recordReleaseOutcome: async () => {},
  };
  const provider = {
    capabilities: { atomicCompareAndSwap: true }, activeDeployment: async () => applied ? 'local-fake-candidate' : manifest.expectedParentDeploymentId,
    inspectDeployment: async () => ({ projectId: manifest.projectId, environment: 'production', artifactSha256: manifest.artifactSha256, productionConfiguration: true, productionDomainsAssigned: false }),
    promote: async () => { sends++; applied = true; throw new Error('simulated_timeout_after_side_effect'); },
    inspectOperation: async row => ({ outcome: 'applied', deploymentId: row.targetDeploymentId, activeDeploymentId: row.targetDeploymentId, artifactSha256: row.artifactSha256, projectId: row.projectId, environment: row.environment, aliasVerified: true }),
  };
  const controller = createReleaseController({ store, provider, clock: () => now, verify: async () => ({ manifest, manifestSha256, artifactSha256: manifest.artifactSha256, evidence }) });
  const evidence = [...REQUIRED_CHECKS, 'final-smoke', 'staged-observation'].map(testId => ({ testId, status: 'PASS', scope: 'release', sourceRevision: manifest.sourceCommit, method: 'explicit local fake fixture', environment: 'staged_production', startedAt: new Date(now - 15 * 60_000).toISOString(), finishedAt: new Date(now).toISOString(), evidenceRefs: ['local-fake-fixture'], observed: { artifactSha256: manifest.artifactSha256, policySha256: manifest.policySha256, maximumProbeGapSeconds: 60, failures: 0 } }));
  const input = { artifact, evidence, targetDeploymentId: 'local-fake-candidate', policyGeneration: 1 };
  await assert.rejects(controller.promote(input, lease), /updates_not_armed/); assert.equal(sends, 0);
  Object.assign(policy, { mode: 'armed', generation: 1, arming: { ownerId: 'local-fixture-owner', policySha256: manifest.policySha256, projectId: manifest.projectId, environment: 'production', lane: 'application', channel: 'stable', expiresAt: new Date(now + 86_400_000).toISOString() } });
  const first = await controller.promote(input, lease); assert.equal(first.status, 'UNKNOWN_OUTCOME'); assert.equal(sends, 1);
  const reconciled = await controller.reconcile(first.intentKey, lease); assert.equal(reconciled.status, 'APPLIED'); assert.equal(sends, 1);
  policy.mode = 'paused'; policy.generation++;
  await assert.rejects(controller.promote(input, lease), /updates_not_armed/); assert.equal(sends, 1);
  return { status: 'PASS', scope: 'local_fake_adapters', checks: ['observe_denies', 'timeout_retains_unknown', 'provider_state_reconciled', 'mutation_sent_once', 'pause_denies'], sends, authenticSignatureVerified: false, durableHostedDatabaseVerified: false, productionModified: false, updaterArmed: false };
}
