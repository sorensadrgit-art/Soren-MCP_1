import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database, ids, rpc } from '../operations/database-helper.mjs';
import { createReleaseIngress, createReleaseRead } from '../../lib/updates/ingress.mjs';
import { createUpdateStore } from '../../lib/updates/store.mjs';
import { runUpdateCommand } from '../../lib/updates/cli.mjs';
import { digestJson, sha256 } from '../../lib/updates/policy.mjs';

const runnerId = '77777777-7777-4777-8777-777777777777';
const watcherId = '88888888-8888-4888-8888-888888888888';
const actor = (subjectId, kind, clientId, role) => ({ workspaceId: ids.workspace, subjectId, kind, clientId, role, isHuman: kind === 'human' });

test('owner CLI registers metadata, trusted runner receipts deduplicate, owner authorizes exact stage/promotion and old outcome cannot regress state', async () => {
  const db = await database(); const directory = await mkdtemp(join(tmpdir(), 'soren-ingress-test-'));
  try {
    const policyBytes = Buffer.from('isolated operating policy'); const lockfileBytes = Buffer.from('new candidate lockfile differs from running service');
    const time = () => new Date().toISOString(); const expiresAt = () => new Date(Date.now() + 600_000).toISOString();
    const artifact = Buffer.from('isolated application bytes');
    const manifest = { releaseId: 'release-1', projectId: 'project', environment: 'production', sourceCommit: 'a'.repeat(40), artifactSha256: sha256(artifact), policySha256: sha256(policyBytes), lockfileSha256: sha256(lockfileBytes), expectedParentDeploymentId: 'previous', approvalIds: ['reserved-human-review-id'], catalogGeneration: 0, schemaCompatibility: { minimum: 1, maximum: 2, destructiveMigration: false } };
    const input = { manifestBytes: Buffer.from(JSON.stringify(manifest)), artifact, bundleBytes: Buffer.from('{}'), evidenceBytes: Buffer.from('[]'), lockfileBytes };
    const manifestHash = () => sha256(input.manifestBytes);
    const operations = { rpc: async (name, args) => (await db.query(`select public.${name}(${Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')}) as value`, Object.values(args))).rows[0].value };
    const store = createUpdateStore(operations, ids.workspace);
    const env = { SOREN_RELEASE_PROJECT_ID: 'project', SOREN_RELEASE_TEAM_ID: 'team', SOREN_RELEASE_ENVIRONMENT: 'production', SOREN_RELEASE_TRUST_JSON: '{"enabled":false}', SOREN_RELEASE_RUNNER_CLIENT_ID: 'fixed-runner', SOREN_WATCHER_CLIENT_ID: 'fixed-watcher', SOREN_RELEASE_OBSERVER_CLIENT_ID: 'read-observer', SOREN_ADMIN_ORIGIN: 'https://example.test', SOREN_MANAGEMENT_ACCESS_TOKEN: 'isolated-owner-token' };
    let currentActor = actor(ids.owner, 'human', 'management', 'owner'), active = 'previous';
    // Crypto and OAuth are injected fixture boundaries here. This test exercises the real PostgreSQL and CLI/API state path.
    const verify = async options => {
      assert.equal(typeof options.metadataOnly, 'boolean');
      if (options.metadataOnly) assert.equal(options.artifact, undefined); else assert.deepEqual(options.artifact, artifact);
      assert.deepEqual(options.lockfileBytes, lockfileBytes);
      const parsed = JSON.parse(options.manifestBytes);
      return { manifest: parsed, manifestSha256: sha256(options.manifestBytes), artifactSha256: parsed.artifactSha256, verifiedAt: time(), identity: { artifactBytesVerified: !options.metadataOnly, method: 'explicit-test-verifier' }, evidence: [{ testId: 'security', finishedAt: time() }, { testId: 'final-smoke', finishedAt: time() }] };
    };
    const handle = createReleaseIngress({ env, operations, authenticate: async (_request, options) => { assert.equal(options.owner, currentActor.kind === 'human'); return currentActor; }, verify, read: async () => policyBytes, providerFactory: () => ({ activeDeployment: async () => active, inspectDeploymentMetadata: async () => ({ artifactSha256: manifest.artifactSha256, productionConfiguration: true, productionDomainsAssigned: false }) }) });
    const fetchImpl = (url, options) => handle(new Request(url, options), url.pathname.endsWith('/authorize') ? 'authorize' : url.pathname.endsWith('/evidence') ? 'evidence' : 'register');
    const requestPath = join(directory, 'request.json');
    const command = async (flag, body, extra = []) => { await writeFile(requestPath, JSON.stringify(body)); return runUpdateCommand('release', [flag, '--request', requestPath, ...extra], env, { fetchImpl, loadCandidate: async () => input }); };
    const review = () => ({ analysis: { channel: 'stable', changedPaths: ['lib/routing/rank.mjs'] }, confirmSourceReview: true, expectedGeneration: 0, releaseSequence: 1, schemaVersion: 1, minimumSecureSequence: 1, stageExpiresAt: expiresAt() });
    assert.equal((await command('--register', review(), ['--input', 'isolated-candidate'])).status, 'RECORDED');
    assert.equal((await command('--register', review(), ['--input', 'isolated-candidate'])).result.idempotent, true);
    let snapshot = await store.snapshot(manifest); assert.equal(snapshot.release.state, 'BUILT'); assert.ok(snapshot.stageAuthorization.ownerId); assert.equal(snapshot.approvals[0].ownerId, ids.owner);
    assert.equal((await db.query('select snapshot from update_release_records where release_id=$1', ['release-1'])).rows[0].snapshot.identity.artifactBytesVerified, false);
    const lease = await rpc(db, 'acquire_lease', [ids.workspace, 'release:project:production', 'fixture-worker', 120]);
    operations.acquireLease = async () => lease; operations.renewLease = async () => lease;
    const stage = { kind: 'stage', authorizationMode: 'manual', releaseId: 'release-1', projectId: 'project', environment: 'production', manifestSha256: manifestHash(), artifactSha256: manifest.artifactSha256, expectedParentDeploymentId: 'previous', targetDeploymentId: null, policyGeneration: 0, catalogGeneration: 0, operationId: '99999999-9999-4999-8999-999999999999', intentKey: 'stage:project:production:release-1' }; stage.payloadSha256 = digestJson(stage);
    await store.beginIntent(stage, lease); await store.markIntent(stage.intentKey, { status: 'SENT' }, lease); await store.bindStagedDeployment(stage.intentKey, 'candidate', lease);
    const observed = { projectId: 'project', environment: 'production', artifactSha256: manifest.artifactSha256, deploymentId: 'candidate', activeDeploymentId: 'previous', aliasVerified: false };
    await store.markIntent(stage.intentKey, { status: 'APPLIED', observed }, lease); await store.recordReleaseOutcome(stage, observed, lease, time());
    for (const [id, client, kind, role] of [[runnerId, 'fixed-runner', 'release_controller', 'maintenance'], [watcherId, 'fixed-watcher', 'observer', 'observer']]) {
      await db.query(`insert into principals(id,auth_issuer,auth_subject,client_id,kind) values($1,'https://example.supabase.co/auth/v1',$1,$2,$3)`, [id, client, kind]);
      await db.query('insert into workspace_memberships(workspace_id,principal_id,role) values($1,$2,$3)', [ids.workspace, id, role]);
      await db.query("insert into grants(workspace_id,principal_id,operations,expires_at,created_by) values($1,$2,array['updates:evidence'],now()+interval '1 hour',$3)", [ids.workspace, id, ids.owner]);
    }
    currentActor = actor(runnerId, 'release_controller', 'fixed-runner', 'maintenance'); env.SOREN_EVIDENCE_ACCESS_TOKEN = 'isolated-runner-token';
    const receipt = (kind, observation) => ({ releaseId: manifest.releaseId, manifestSha256: manifestHash(), artifactSha256: manifest.artifactSha256, projectId: 'project', environment: 'production', kind, observation: { observedAt: time(), evidenceRef: 'isolated-evidence', ...observation } });
    await command('--record-evidence', receipt('readiness', { dependenciesReady: true, budgetAvailable: true, securityIncident: false }));
    const probe = receipt('candidate_probe', { deploymentId: 'candidate', status: 'PASS' });
    await command('--record-evidence', probe); assert.equal((await command('--record-evidence', probe)).result.idempotent, true);
    assert.equal((await db.query("select count(*)::int as count from update_release_evidence where kind='candidate_probe'")).rows[0].count, 1);
    await assert.rejects(command('--record-evidence', { ...probe, observation: { ...probe.observation, evidenceRef: 'changed-same-observation' } }), /ingress_denied/);
    await command('--record-evidence', receipt('verification', {}), ['--input', 'isolated-candidate']);
    currentActor = actor(watcherId, 'observer', 'fixed-watcher', 'observer');
    await assert.rejects(command('--record-evidence', receipt('independent_probe', { deploymentId: 'candidate', status: 'PASS', failureDomain: 'independent' })), /ingress_denied/);
    await db.query(`insert into scheduler_profiles(workspace_id,profile,cadence_seconds,entitlement_evidence_ref,owner_id,consent_at,failure_domain,watcher_failure_domain,watcher_principal_id,watcher_client_id,watcher_verified_at,watcher_evidence_ref,watcher_cadence_seconds,last_watcher_at) values($1,'frequent',300,'fixture-entitlement',$2,now(),'gateway','independent',$3,'fixed-watcher',now(),'fixture-independent-monitor',60,now())`, [ids.workspace, ids.owner, watcherId]);
    await command('--record-evidence', receipt('independent_probe', { deploymentId: 'candidate', status: 'PASS', failureDomain: 'independent' }));
    currentActor = actor(ids.owner, 'human', 'management', 'owner');
    await command('--authorize', { releaseId: manifest.releaseId, manifestSha256: manifestHash(), projectId: 'project', environment: 'production', expectedGeneration: 0, phase: 'manual_promotion', expiresAt: expiresAt(), capabilityEvidenceRef: 'owner-reviewed-nonatomic-manual-operation' });
    snapshot = await store.snapshot(manifest); assert.equal(snapshot.manualAuthorization.ownerId, ids.owner);
    const promote = { ...stage, kind: 'promote', targetDeploymentId: 'candidate', operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', intentKey: 'promote:project:production:release-1' }; promote.payloadSha256 = digestJson(promote);
    await store.beginIntent(promote, lease); await store.markIntent(promote.intentKey, { status: 'SENT' }, lease);
    const applied = { ...observed, activeDeploymentId: 'candidate', aliasVerified: true };
    await store.markIntent(promote.intentKey, { status: 'APPLIED', observed: applied }, lease); await store.recordReleaseOutcome(promote, applied, lease, time()); active = 'candidate';
    await store.recordReleaseOutcome(stage, observed, lease, time()); snapshot = await store.snapshot(manifest);
    assert.equal(snapshot.release.state, 'PROBATION'); assert.equal(snapshot.activeDeploymentId, 'candidate');
    // Only elapsed time and historical probe observations are fixtures. The CLI/controller/fenced SQL must perform the real STABLE transition.
    const finalProvider = { activeDeployment: async () => active, inspectDeployment: async () => ({ ...applied, productionConfiguration: true, productionDomainsAssigned: true, artifactBytesVerified: true }) };
    const finish = () => runUpdateCommand('release', ['--input', 'isolated-candidate', '--finish-probation', '--policy-generation', '0'], env, { loadCandidate: async () => input, operations, store, verify, provider: finalProvider });
    await assert.rejects(finish(), /probation_incomplete/);
    await db.query("update update_release_records set promoted_at=now()-interval '30 minutes 2 seconds' where release_id='release-1'");
    await assert.rejects(finish(), /probation_probe_gap_or_failure/);
    await db.query(`insert into update_probation_probes(workspace_id,release_id,observed_at,body)
      select $1,r.release_id,r.promoted_at+n*interval '60 seconds',jsonb_build_object('id','fixture-probation-'||n,'observedAt',r.promoted_at+n*interval '60 seconds','deploymentId','candidate','status','PASS')
      from update_release_records r cross join generate_series(0,30) n where r.release_id='release-1'`, [ids.workspace]);
    const proof = { releaseId: manifest.releaseId, manifestSha256: manifestHash(), artifactSha256: manifest.artifactSha256, deploymentId: 'candidate', policyGeneration: 0, artifactBytesVerified: true, verifiedAt: time(), observation: { ...await finalProvider.inspectDeployment(), observedAt: time() } };
    await assert.rejects(store.finishProbation({ ...proof, artifactSha256: 'f'.repeat(64) }, lease), /probation_identity_changed/);
    await assert.rejects(store.finishProbation({ ...proof, observation: { ...proof.observation, aliasVerified: false } }, lease), /probation_provider_verification_required/);
    await assert.rejects(store.finishProbation(proof, { ...lease, fence: lease.fence + 1 }), /lease/);
    const finalized = await finish(); assert.equal(finalized.status, 'STABLE'); assert.equal(finalized.productionModified, false);
    assert.equal((await store.snapshot(manifest)).release.state, 'STABLE');
    assert.equal((await db.query("select count(*)::int count from update_release_audit where event='probation_completed'")).rows[0].count, 1);
    await assert.rejects(finish(), /probation_incomplete/);
    manifest.releaseId = 'release-2'; manifest.expectedParentDeploymentId = 'candidate'; input.manifestBytes = Buffer.from(JSON.stringify(manifest));
    await command('--register', { ...review(), releaseSequence: 2 }, ['--input', 'isolated-candidate']);
    snapshot = await store.snapshot(manifest); assert.ok(snapshot.previous.identityVerifiedAt); assert.equal(snapshot.previous.manifestSha256, sha256(JSON.stringify({ ...manifest, releaseId: 'release-1', expectedParentDeploymentId: 'previous' })));
    // Advance the promotion-budget fixture clock without waiting a day. All following transitions use the real fenced SQL functions.
    await db.query("update update_release_operations set updated_at=now()-interval '25 hours' where body->>'kind'='promote'");
    const stage2 = { ...stage, releaseId: 'release-2', manifestSha256: manifestHash(), expectedParentDeploymentId: 'candidate', intentKey: 'stage:project:production:release-2', operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }; stage2.payloadSha256 = digestJson(stage2);
    await store.beginIntent(stage2, lease); await store.markIntent(stage2.intentKey, { status: 'SENT' }, lease); await store.bindStagedDeployment(stage2.intentKey, 'candidate-2', lease);
    const staged2 = { ...observed, deploymentId: 'candidate-2', activeDeploymentId: 'candidate' };
    await store.markIntent(stage2.intentKey, { status: 'APPLIED', observed: staged2 }, lease); await store.recordReleaseOutcome(stage2, staged2, lease, time());
    currentActor = actor(runnerId, 'release_controller', 'fixed-runner', 'maintenance');
    await command('--record-evidence', receipt('readiness', { dependenciesReady: true, budgetAvailable: true, securityIncident: false }));
    await command('--record-evidence', receipt('verification', {}), ['--input', 'isolated-candidate']);
    currentActor = actor(watcherId, 'observer', 'fixed-watcher', 'observer');
    await command('--record-evidence', receipt('independent_probe', { deploymentId: 'candidate-2', status: 'PASS', failureDomain: 'independent' }));
    currentActor = actor(ids.owner, 'human', 'management', 'owner');
    await command('--authorize', { releaseId: manifest.releaseId, manifestSha256: manifestHash(), projectId: 'project', environment: 'production', expectedGeneration: 0, phase: 'manual_promotion', expiresAt: expiresAt(), capabilityEvidenceRef: 'owner-reviewed-manual-promotion' });
    const promote2 = { ...stage2, kind: 'promote', targetDeploymentId: 'candidate-2', intentKey: 'promote:project:production:release-2', operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }; promote2.payloadSha256 = digestJson(promote2);
    await store.beginIntent(promote2, lease); await store.markIntent(promote2.intentKey, { status: 'SENT' }, lease);
    const promoted2 = { ...staged2, activeDeploymentId: 'candidate-2', aliasVerified: true };
    await store.markIntent(promote2.intentKey, { status: 'APPLIED', observed: promoted2 }, lease); await store.recordReleaseOutcome(promote2, promoted2, lease, time()); active = 'candidate-2';
    currentActor = actor(runnerId, 'release_controller', 'fixed-runner', 'maintenance');
    await command('--record-evidence', receipt('candidate_probe', { deploymentId: 'candidate-2', status: 'FAIL', failureClass: 'core_contract' }));
    await command('--record-evidence', receipt('control_probe', { deploymentId: 'candidate', status: 'PASS' }));
    currentActor = actor(watcherId, 'observer', 'fixed-watcher', 'observer');
    await command('--record-evidence', receipt('independent_probe', { deploymentId: 'candidate-2', status: 'FAIL', failureClass: 'core_contract', failureDomain: 'independent' }));
    currentActor = actor(ids.owner, 'human', 'management', 'owner');
    await command('--authorize', { releaseId: manifest.releaseId, manifestSha256: manifestHash(), projectId: 'project', environment: 'production', expectedGeneration: 0, phase: 'manual_rollback', expiresAt: expiresAt(), capabilityEvidenceRef: 'owner-reviewed-manual-rollback' });
    snapshot = await store.snapshot(manifest);
    const rollback = { ...promote2, kind: 'rollback', manifestSha256: snapshot.previous.manifestSha256, expectedParentDeploymentId: 'candidate-2', targetDeploymentId: 'candidate', intentKey: 'rollback:project:production:release-2', operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }; rollback.payloadSha256 = digestJson(rollback);
    await store.beginIntent(rollback, lease); await store.markIntent(rollback.intentKey, { status: 'SENT' }, lease);
    const rolledBack = { ...observed, deploymentId: 'candidate', activeDeploymentId: 'candidate', aliasVerified: true };
    await store.markIntent(rollback.intentKey, { status: 'APPLIED', observed: rolledBack }, lease); await store.recordReleaseOutcome(rollback, rolledBack, lease, time());
    await store.enterCooldown({ projectId: 'project', environment: 'production', releaseId: 'release-2', mode: 'observe' }, lease);
    snapshot = await store.snapshot(manifest); assert.equal(snapshot.release.state, 'ROLLED_BACK'); assert.equal(snapshot.release.rollbackCount, 1); assert.equal(snapshot.policy.mode, 'observe'); assert.ok(Date.parse(snapshot.policy.cooldownUntil) > Date.now());
    await assert.rejects(store.beginIntent({ ...rollback, intentKey: `${rollback.intentKey}:again`, operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', policyGeneration: 1 }, lease), /rollback_limit/);
    const read = createReleaseRead({ env, operations, authenticate: async () => actor('read-only', 'observer', 'read-observer', 'observer') });
    const response = await read(new Request(`https://example.test/api/admin/updates/releases?releaseId=release-2&manifestSha256=${manifestHash()}&projectId=project&environment=production`));
    assert.equal(response.status, 200); const summary = await response.json(); assert.equal(summary.artifactSha256, manifest.artifactSha256); assert.equal(summary.approvals, undefined); assert.equal(summary.stagedDeploymentId, 'candidate-2'); assert.equal(summary.release.deploymentId, 'candidate'); assert.equal(summary.watcher.status, 'FAIL');
  } finally { await db.close(); await rm(directory, { recursive: true, force: true }); }
});
