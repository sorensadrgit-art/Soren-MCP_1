import test from 'node:test';
import assert from 'node:assert/strict';
import {database, rpc, ids, asReader} from './database-helper.mjs';
import {sha256, canonicalJson} from '../../lib/registry/identity.mjs';
const watcher = '77777777-7777-4777-8777-777777777777';
const watcherSubject = '88888888-8888-4888-8888-888888888888';

async function setup(db) {
  await db.query(`insert into principals(id,auth_issuer,auth_subject,client_id,kind) values($1,'https://example.supabase.co/auth/v1',$2,'watcher-client','observer')`, [watcher, watcherSubject]);
  await db.query(`insert into workspace_memberships(workspace_id,principal_id,role) values($1,$2,'observer')`, [ids.workspace, watcher]);
  await db.query(`insert into grants(workspace_id,principal_id,operations,expires_at,created_by) values($1,$2,array['health:read','receipts:write'],now()+interval '1 day',$3)`, [ids.workspace, watcher, ids.owner]);
  await db.query(`insert into scheduler_profiles(workspace_id,profile,cadence_seconds,entitlement_evidence_ref,owner_id,consent_at,failure_domain,watcher_failure_domain,watcher_evidence_ref,watcher_principal_id,watcher_client_id,watcher_verified_at,watcher_cadence_seconds,last_dispatcher_at)
    values($1,'frequent',300,'fixture:entitlement',$2,now(),'vercel','independent:fixture','fixture:independence',$3,'watcher-client',now(),300,now())`, [ids.workspace, ids.owner, watcher]);
}
const receipt = now => ({observedAt: new Date(now).toISOString(), scheduledSlot: new Date(Math.floor(now / 300000) * 300000).toISOString(), probeIdentity: 'fixture:watcher', status: 'HEALTHY', gatewayReachable: true, dispatcherFresh: true, failureDomain: 'independent:fixture', environment: 'test', sourceRevision: null, evidenceRef: 'fixture:receipt'});
const send = (db, value, actor = watcher, client = 'watcher-client') => rpc(db, 'record_watcher_receipt', [ids.workspace, actor, client, value, sha256(canonicalJson(value))]);

test('independent observer receipts persist with exact-slot deduplication and reject grants, identity, domain and payload drift', async () => {
  const db = await database();
  try {
    await setup(db); const value = receipt(Date.now());
    const readGrant = await rpc(db, 'set_grant', [ids.workspace, ids.owner, watcher, ['updates:read'], new Date(Date.now() + 3600000).toISOString()]);
    assert.ok(readGrant);
    assert.equal((await rpc(db, 'get_principal_context', [ids.workspace, 'https://example.supabase.co/auth/v1', watcherSubject, 'watcher-client'])).permissions.includes('updates:read'), true);
    await assert.rejects(rpc(db, 'set_grant', [ids.workspace, ids.owner, watcher, ['updates:promote'], new Date(Date.now() + 3600000).toISOString()]), /grant_scope_denied/);
    await assert.rejects(send(db, value, ids.reader), /independent_watcher_not_authorized/);
    await assert.rejects(send(db, value, watcher, 'other-client'), /independent_watcher_not_authorized/);
    await assert.rejects(send(db, {...value, failureDomain: 'vercel'}), /independent_watcher_not_authorized/);
    assert.equal((await send(db, value)).durable, true);
    assert.equal((await send(db, value)).duplicate, true);
    assert.equal((await db.query('select count(*)::integer n from watcher_receipts')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::integer n from health_observations')).rows[0].n, 3);
    assert.ok((await rpc(db, 'get_scheduler_profile', [ids.workspace])).last_watcher_at);
    await assert.rejects(send(db, {...value, status: 'UNKNOWN'}), /watcher_payload_conflict/);
    await assert.rejects(send(db, {...value, scheduledSlot: new Date(Date.parse(value.scheduledSlot) - 1000).toISOString()}), /invalid_watcher_receipt/);
    await assert.rejects(asReader(db, () => send(db, value), {client: 'watcher-client', subject: watcherSubject}), /permission denied/);
    await db.query('update grants set revoked_at=now() where principal_id=$1', [watcher]);
    await assert.rejects(send(db, value), /watcher_grant_denied/);
  } finally { await db.close(); }
});

test('three distinct missed watcher samples persist one UNKNOWN deadman incident, not a fabricated outage', async () => {
  const db = await database();
  try {
    await setup(db); const now = Date.now();
    const lease = await rpc(db, 'acquire_lease', [ids.workspace, 'dispatcher', 'worker', 120]);
    for (const offset of [-2, -1, 0]) {
      const at = new Date(now + offset * 300000).toISOString();
      await rpc(db, 'record_health_observation', [ids.workspace, {component: 'watcher_deadman', environment: 'test', observedAt: at, scheduledSlot: at, status: 'UNKNOWN', failureClass: 'watcher_stale', probeIdentity: `probe:${offset}`, latencyMs: null, sourceRevision: null, evidenceRefs: []}, lease.key, lease.owner, lease.fence]);
    }
    const incident = (await db.query(`select state,severity from incidents where component='watcher_deadman'`)).rows[0];
    assert.equal(incident.state, 'OPEN'); assert.equal(incident.severity, 'warning');
    assert.equal((await rpc(db, 'get_health_snapshot', [ids.workspace])).observations[0].status, 'UNKNOWN');
    assert.equal((await db.query(`select count(*)::integer n from incident_events where event='opened'`)).rows[0].n, 1);
    await db.query(`update scheduler_profiles set last_dispatcher_at=now()-interval '1 day'`);
    await assert.rejects(send(db, receipt(now)), /invalid_watcher_receipt/);
  } finally { await db.close(); }
});
