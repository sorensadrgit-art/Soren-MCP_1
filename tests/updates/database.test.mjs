import test from 'node:test';
import assert from 'node:assert/strict';
import { database, rpc, ids, asReader } from '../operations/database-helper.mjs';
import { initialPolicy, pausePolicy, digestJson } from '../../lib/updates/policy.mjs';

async function setup(db) {
  const policy = { ...initialPolicy({ projectId: 'project', environment: 'production', policySha256: 'a'.repeat(64) }), generation: 1, mode: 'armed', arming: { ownerId: ids.owner, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), policySha256: 'a'.repeat(64) } };
  await rpc(db, 'update_change_policy', [ids.workspace, 'project', 'production', 0, policy, ids.owner]);
  const lease = await rpc(db, 'acquire_lease', [ids.workspace, 'release:project:production', 'runner', 120]);
  const intent = { kind: 'promote', authorizationMode: 'automatic', releaseId: 'release', projectId: 'project', environment: 'production', intentKey: 'promote:project:production:release', operationId: '77777777-7777-4777-8777-777777777777', manifestSha256: 'b'.repeat(64), artifactSha256: 'c'.repeat(64), expectedParentDeploymentId: 'previous', targetDeploymentId: 'candidate', policyGeneration: 1, catalogGeneration: 0 };
  intent.payloadSha256 = digestJson(intent);
  const observedAt = new Date().toISOString();
  const manifest = { releaseId: 'release', sourceCommit: 'd'.repeat(40), projectId: 'project', environment: 'production', policySha256: 'a'.repeat(64), artifactSha256: 'c'.repeat(64), approvalIds: ['approval'], catalogGeneration: 0, schemaCompatibility: { minimum: 1, maximum: 1, destructiveMigration: false }, createdAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), expectedParentDeploymentId: 'previous' };
  const snapshot = { dependenciesReady: true, budgetAvailable: true, securityIncident: false, readinessObservedAt: observedAt, activeDeploymentId: 'previous', stagedDeploymentId: 'candidate', releaseSequence: 1, minimumSecureSequence: 1, schemaVersion: 1, catalogGeneration: 0, watcher: { status: 'PASS', observedAt, maxProbeIntervalSeconds: 60, independent: true }, candidate: { sourceReviewed: true, reviewedManifestSha256: 'b'.repeat(64) }, approvals: [{ id: 'approval', decision: 'approved', isHuman: true, manifestSha256: 'b'.repeat(64), sourceCommit: manifest.sourceCommit, artifactSha256: manifest.artifactSha256, policySha256: manifest.policySha256 }], verification: { status: 'PASS', manifestSha256: 'b'.repeat(64), artifactSha256: manifest.artifactSha256, fullEvidenceFinishedAt: observedAt, finalSmokeAt: observedAt } };
  Object.assign(snapshot.candidate, { channel: 'stable', changedPaths: ['lib/routing/rank.mjs'] });
  for (const key of 'newPackages newPublishers newSources newInstallScripts permissionChanges protocolChanges databaseMigrations runtimeMajorUpgrade frameworkMajorUpgrade scriptChanges resourceIncrease billingIncrease environmentChanges targetChanges scheduleChanges trustChanges testThresholdChanges allowlistChanges'.split(' ')) snapshot.candidate[key] = false;
  await rpc(db, 'update_register_release', [ids.workspace, ids.owner, { manifest, manifestSha256: 'b'.repeat(64), snapshot, state: 'STAGED' }, policy, 1]);
  return { policy, lease, intent, begin: value => rpc(db, 'update_begin_intent', [ids.workspace, value, lease.key, lease.owner, lease.fence]) };
}

test('Postgres update intent is payload-bound, unresolved singleton and stale-fence protected', async () => {
  const db = await database();
  try {
    const { lease, intent, begin } = await setup(db);
    assert.equal((await begin(intent)).status, 'PENDING');
    assert.equal((await begin(intent)).operationId, intent.operationId);
    await assert.rejects(begin({ ...intent, payloadSha256: 'd'.repeat(64) }), /intent_conflict/);
    await rpc(db, 'update_mark_intent', [ids.workspace, intent.intentKey, { status: 'UNKNOWN_OUTCOME' }, lease.key, lease.owner, lease.fence]);
    assert.equal((await begin(intent)).status, 'UNKNOWN_OUTCOME');
    await assert.rejects(begin({ ...intent, intentKey: `${intent.intentKey}-other`, operationId: '88888888-8888-4888-8888-888888888888' }), /one_pending_release_operation/);
    await db.query("update leases set expires_at=now()-interval '1 second' where workspace_id=$1 and key=$2", [ids.workspace, lease.key]);
    const next = await rpc(db, 'acquire_lease', [ids.workspace, lease.key, 'successor', 120]); assert.ok(next.fence > lease.fence);
    await assert.rejects(rpc(db, 'update_mark_intent', [ids.workspace, intent.intentKey, { status: 'APPLIED' }, lease.key, lease.owner, lease.fence]), /stale|lease/);
    assert.equal((await rpc(db, 'update_get_intent', [ids.workspace, intent.intentKey])).status, 'UNKNOWN_OUTCOME');
  } finally { await db.close(); }
});

test('Postgres owner pause invalidates unsent promotion and agent cannot call private update RPC', async () => {
  const db = await database();
  try {
    const { policy, lease, intent, begin } = await setup(db); await begin(intent);
    const paused = pausePolicy(policy, { isHuman: true, role: 'owner', subjectId: ids.owner });
    await rpc(db, 'update_change_policy', [ids.workspace, 'project', 'production', 1, paused, ids.owner]);
    await assert.rejects(rpc(db, 'update_mark_intent', [ids.workspace, intent.intentKey, { status: 'SENT' }, lease.key, lease.owner, lease.fence]), /policy_invalidated/);
    await assert.rejects(rpc(db, 'update_change_policy', [ids.workspace, 'project', 'production', 1, paused, ids.owner]), /policy_conflict/);
    await assert.rejects(asReader(db, () => rpc(db, 'update_read_policy', [ids.workspace, 'project', 'production'])), /permission denied/);
    await assert.rejects(rpc(db, 'update_change_policy', [ids.workspace, 'project', 'production', 2, { ...paused, generation: 3 }, ids.reader]), /human_authority_required/);
  } finally { await db.close(); }
});
