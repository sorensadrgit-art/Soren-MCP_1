import test from 'node:test';
import assert from 'node:assert/strict';
import {database, rpc, ids, asReader} from './database-helper.mjs';
import {prepareSkillVersion, verifyPrivateFile} from '../../lib/registry/identity.mjs';

test('real Postgres intent claims are idempotent, payload-conflicting and fenced', async () => {
  const db = await database();
  try {
    const args = [ids.workspace, 'probe:test', 'a'.repeat(64), 'gateway_probe', new Date().toISOString(), 'local', 'worker-one'];
    const claims = await Promise.all([rpc(db, 'claim_job', args), rpc(db, 'claim_job', [...args.slice(0, -1), 'worker-two'])]);
    assert.equal(claims.filter(claim => claim.claimed).length, 1);
    const claim = claims.find(item => item.claimed);
    await assert.rejects(rpc(db, 'claim_job', [ids.workspace, 'probe:test', 'b'.repeat(64), ...args.slice(3)]), /job_payload_conflict/);
    await db.query(`update leases set expires_at=clock_timestamp()-interval '1 second' where workspace_id=$1 and key=$2`, [ids.workspace, claim.lease.key]);
    const next = await rpc(db, 'acquire_lease', [ids.workspace, claim.lease.key, 'new-worker', 120]);
    assert.equal(next.fence, claim.lease.fence + 1);
    await assert.rejects(rpc(db, 'finish_job', [ids.workspace, claim.jobId, claim.lease.owner, claim.lease.fence, true, 'result', null, 0]), /stale_lease_fence/);
    const done = await rpc(db, 'finish_job', [ids.workspace, claim.jobId, next.owner, next.fence, true, 'result', null, 0]);
    assert.equal(done.state, 'succeeded');
    assert.equal((await rpc(db, 'claim_job', args)).claimed, false);
  } finally { await db.close(); }
});

test('real Postgres RLS isolates workspaces and immutable approval/revocation governs retrieval', async () => {
  const db = await database();
  try {
    const version = prepareSkillVersion({repository: 'https://github.com/Owner/Repo', directory: 'skills/example', revision: 'a'.repeat(40), license: 'MIT', files: [{path: 'SKILL.md', content: 'Approved bytes'}]});
    const versionId = await rpc(db, 'stage_skill_version', [ids.workspace, ids.owner, version.manifest, version.manifestSha256, version.files]);
    await assert.rejects(rpc(db, 'review_skill_version', [ids.workspace, ids.reader, versionId, version.manifestSha256, 'approve', 0, 'b'.repeat(64), 'test:review']), /human_authority_required/);
    await assert.rejects(rpc(db, 'review_skill_version', [ids.workspace, ids.owner, versionId, 'c'.repeat(64), 'approve', 0, 'b'.repeat(64), 'test:review']), /version_digest_conflict/);
    await assert.rejects(rpc(db, 'read_private_version', [ids.workspace, ids.reader, versionId, version.manifestSha256]), /private_access_denied/);
    await rpc(db, 'review_skill_version', [ids.workspace, ids.owner, versionId, version.manifestSha256, 'approve', 0, 'b'.repeat(64), 'test:review']);
    assert.equal((await rpc(db, 'get_workspace_status', [ids.workspace, ids.owner])).versions[0].published, false);
    await assert.rejects(rpc(db, 'review_skill_version', [ids.workspace, ids.owner, versionId, version.manifestSha256, 'approve', 0, 'b'.repeat(64), 'test:review']), /review_revision_conflict/);
    await rpc(db, 'publish_catalog', [ids.workspace, ids.owner, [versionId], 1]);
    assert.equal((await rpc(db, 'get_workspace_status', [ids.workspace, ids.owner])).versions[0].published, true);
    const retrieved = await rpc(db, 'read_private_version', [ids.workspace, ids.reader, versionId, version.manifestSha256]);
    assert.equal(retrieved.files.length, 1);
    assert.equal(verifyPrivateFile(retrieved, 'SKILL.md', version.manifestSha256).content, 'Approved bytes');
    const details = await rpc(db, 'get_review_details', [ids.workspace, ids.owner, versionId]);
    assert.equal(details.candidate.reviewRevision, 1);
    assert.equal(details.previous, null);
    await assert.rejects(rpc(db, 'get_review_details', [ids.workspace, ids.reader, versionId]), /human_authority_required/);
    assert.equal((await asReader(db, () => db.query('select id from skill_versions'))).rows.length, 1);
    assert.equal((await asReader(db, () => db.query('select id from skill_versions'), {client: 'different-client'})).rows.length, 0);
    await assert.rejects(asReader(db, () => rpc(db, 'review_skill_version', [ids.workspace, ids.owner, versionId, version.manifestSha256, 'approve', 1, 'b'.repeat(64), 'test:fake'])), /permission denied/);
    await assert.rejects(db.query('update skill_files set content_base64=$1 where version_id=$2', ['YmFk', versionId]), /immutable_record/);
    await assert.rejects(rpc(db, 'read_private_version', [ids.otherWorkspace, ids.reader, versionId, version.manifestSha256]), /private_access_denied/);
    const changed = prepareSkillVersion({...version.manifest, files: [{path: 'SKILL.md', content: 'Unreviewed replacement'}]});
    const changedId = await rpc(db, 'stage_skill_version', [ids.workspace, ids.owner, changed.manifest, changed.manifestSha256, changed.files]);
    assert.notEqual(changedId, versionId);
    await assert.rejects(rpc(db, 'read_private_version', [ids.workspace, ids.reader, changedId, changed.manifestSha256]), /private_access_denied/);
    await rpc(db, 'revoke_skill_version', [ids.workspace, ids.owner, versionId, 'test revocation']);
    await assert.rejects(rpc(db, 'read_private_version', [ids.workspace, ids.reader, versionId, version.manifestSha256]), /private_access_denied/);
    assert.equal((await asReader(db, () => db.query('select path from skill_files'))).rows.length, 0);
    await assert.rejects(rpc(db, 'publish_catalog', [ids.workspace, ids.owner, [versionId], 3]), /version_not_approved/);
  } finally { await db.close(); }
});

test('durable federation quotas serialize aggregate and cache rejects authorization errors', async () => {
  const db = await database();
  try {
    for (let i = 0; i < 6; i++) assert.equal((await rpc(db, 'claim_federation_budget', ['a'.repeat(64), false])).allowed, true);
    assert.equal((await rpc(db, 'claim_federation_budget', ['a'.repeat(64), false])).allowed, false);
    for (let i = 0; i < 24; i++) assert.equal((await rpc(db, 'claim_federation_budget', [(i + 1).toString(16).padStart(64, '0'), true])).allowed, true);
    assert.equal((await rpc(db, 'claim_federation_budget', ['f'.repeat(64), true])).allowed, false);
    await assert.rejects(rpc(db, 'put_federation_cache', ['c'.repeat(64), {status: 401}, false, 600]), /invalid_public_cache/);
    await assert.rejects(rpc(db, 'put_federation_cache', ['c'.repeat(64), {items: []}, true, 31]), /invalid_public_cache/);
    await rpc(db, 'put_federation_cache', ['c'.repeat(64), {items: []}, true, 30]);
    assert.deepEqual(await rpc(db, 'get_federation_cache', ['c'.repeat(64)]), {items: []});
  } finally { await db.close(); }
});

test('crashed final safe attempt becomes a visible deduplicated dead letter instead of an unbounded retry', async () => {
  const db = await database();
  try {
    const args = [ids.workspace, 'probe:crash', 'a'.repeat(64), 'gateway_probe', new Date().toISOString(), 'local', 'worker'];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claim = await rpc(db, 'claim_job', args);
      assert.equal(claim.claimed, true); assert.equal(claim.attempt, attempt);
      await db.query(`update leases set expires_at=clock_timestamp()-interval '1 second' where workspace_id=$1`, [ids.workspace]);
    }
    assert.equal((await rpc(db, 'list_due_jobs', [ids.workspace, 4, 'default'])).length, 1);
    const exhausted = await rpc(db, 'claim_job', args);
    assert.equal(exhausted.claimed, false); assert.equal(exhausted.state, 'dead_letter');
    assert.equal((await rpc(db, 'claim_job', args)).state, 'dead_letter');
    assert.equal((await db.query(`select count(*)::integer n from incident_events where event='opened'`)).rows[0].n, 1);
    assert.equal((await rpc(db, 'list_due_jobs', [ids.workspace, 4, 'default'])).length, 0);
  } finally { await db.close(); }
});
