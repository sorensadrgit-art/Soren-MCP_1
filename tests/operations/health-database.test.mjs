import test from 'node:test';
import assert from 'node:assert/strict';
import {database, rpc, ids, asReader} from './database-helper.mjs';

test('Postgres incident pipeline deduplicates delivery, opens at three and resolves at two successes', async () => {
  const db = await database();
  try {
    await db.query(`insert into scheduler_profiles(workspace_id,profile,cadence_seconds,entitlement_evidence_ref,owner_id,consent_at,failure_domain) values($1,'frequent',300,'fixture:entitlement',$2,now(),'fixture-vercel')`, [ids.workspace, ids.owner]);
    const lease = await rpc(db, 'acquire_lease', [ids.workspace, 'dispatcher', 'worker', 120]);
    const now = Date.now();
    const observation = (slot, status) => ({component: 'gateway', environment: 'test', observedAt: new Date(now + slot * 300000).toISOString(), scheduledSlot: new Date(now + slot * 300000).toISOString(), status, failureClass: status === 'HEALTHY' ? null : 'contract', latencyMs: 1, probeIdentity: `probe-${slot}`, sourceRevision: null, evidenceRefs: []});
    const record = value => rpc(db, 'record_health_observation', [ids.workspace, value, lease.key, lease.owner, lease.fence]);
    assert.equal((await record(observation(-2, 'UNHEALTHY'))).state, 'SUSPECT');
    assert.equal((await record(observation(-1, 'UNHEALTHY'))).state, 'SUSPECT');
    assert.equal((await record(observation(-1, 'UNHEALTHY'))).duplicate, true);
    assert.equal((await record(observation(0, 'UNHEALTHY'))).state, 'OPEN');
    assert.equal((await db.query(`select count(*)::integer n from incident_events where event='opened'`)).rows[0].n, 1);
    // Move persisted samples into earlier slots to exercise recovery without sleeps or pretending future data is fresh.
    await db.query(`update health_observations set scheduled_slot=scheduled_slot-interval '10 minutes',observed_at=observed_at-interval '10 minutes'`);
    await record(observation(-1, 'HEALTHY'));
    await record(observation(0, 'HEALTHY'));
    assert.equal((await db.query(`select state from incidents`)).rows[0].state, 'RESOLVED');
    assert.equal((await db.query(`select count(*)::integer n from incident_events where event='recovered'`)).rows[0].n, 1);
    await assert.rejects(record(observation(-10, 'UNHEALTHY')), /stale_observation/);
    await rpc(db, 'record_dispatcher_heartbeat', [ids.workspace, lease.key, lease.owner, lease.fence]);
    assert.ok((await rpc(db, 'get_scheduler_profile', [ids.workspace])).last_dispatcher_at);
    await db.query(`update leases set expires_at=clock_timestamp()-interval '1 second' where workspace_id=$1`, [ids.workspace]);
    await assert.rejects(rpc(db, 'record_dispatcher_heartbeat', [ids.workspace, lease.key, lease.owner, lease.fence]), /stale_lease_fence/);
    await db.query(`update health_observations set observed_at=observed_at-interval '1 day',scheduled_slot=scheduled_slot-interval '1 day'`);
    const stale = await rpc(db, 'get_health_snapshot', [ids.workspace]);
    assert.equal(stale.observations[0].status, 'UNKNOWN'); assert.equal(stale.observations[0].freshness, 'stale');
  } finally { await db.close(); }
});

test('grant revocation immediately removes principal read permission; no agent can grant human authority', async () => {
  const db = await database();
  try {
    const args = [ids.workspace, 'https://example.supabase.co/auth/v1', ids.otherUser, 'agent'];
    const before = await rpc(db, 'get_principal_context', args);
    assert.equal(before.permissions.includes('skills:read'), true);
    assert.equal(before.permissions.includes('reviews:write'), false);
    assert.equal(before.permissions.includes('updates:promote'), false);
    const owner = await rpc(db, 'get_principal_context', [ids.workspace, 'https://example.supabase.co/auth/v1', ids.user, 'management']);
    assert.equal(owner.permissions.includes('updates:promote'), true);
    await db.query(`update workspace_memberships set role='reviewer' where workspace_id=$1 and principal_id=$2`, [ids.workspace, ids.owner]);
    const reviewer = await rpc(db, 'get_principal_context', [ids.workspace, 'https://example.supabase.co/auth/v1', ids.user, 'management']);
    assert.equal(reviewer.permissions.includes('updates:promote'), false);
    await db.query(`update workspace_memberships set role='owner' where workspace_id=$1 and principal_id=$2`, [ids.workspace, ids.owner]);
    await assert.rejects(rpc(db, 'set_grant', [ids.workspace, ids.reader, ids.reader, ['skills:read'], new Date(Date.now() + 3600000).toISOString()]), /human_authority_required/);
    await assert.rejects(rpc(db, 'set_grant', [ids.workspace, ids.owner, ids.reader, ['reviews:write'], new Date(Date.now() + 3600000).toISOString()]), /grant_scope_denied/);
    await assert.rejects(rpc(db, 'set_grant', [ids.workspace, ids.owner, ids.reader, ['updates:promote'], new Date(Date.now() + 3600000).toISOString()]), /grant_scope_denied/);
    const grant = (await db.query('select id,revision from grants where principal_id=$1', [ids.reader])).rows[0];
    await rpc(db, 'revoke_grant', [ids.workspace, ids.owner, grant.id, grant.revision]);
    const after = await rpc(db, 'get_principal_context', args);
    assert.equal(after.permissions.includes('skills:read'), false);
    assert.ok(after.grantRevision > before.grantRevision);
    await assert.rejects(asReader(db, () => rpc(db, 'get_principal_context', args)), /permission denied/);
    await assert.rejects(asReader(db, () => rpc(db, 'version_approved', [ids.otherWorkspace, ids.owner])), /permission denied/);
  } finally { await db.close(); }
});
