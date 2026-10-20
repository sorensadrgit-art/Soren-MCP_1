import test from 'node:test';
import assert from 'node:assert/strict';
import {database, ids} from './database-helper.mjs';
import {createSupabaseStore} from '../../lib/operations/store.mjs';
import {runMaintenance} from '../../lib/operations/maintenance.mjs';
import {healthOnce, healthOnceMain} from '../../scripts/health-once.mjs';

test('maintenance persists bounded jobs, skips duplicate slots and retries only eligible due jobs in Postgres', async () => {
  const db = await database();
  try {
    await db.query(`insert into scheduler_profiles(workspace_id,profile,cadence_seconds,entitlement_evidence_ref,owner_id,consent_at,failure_domain) values($1,'frequent',300,'fixture:entitlement',$2,now(),'fixture-vercel')`, [ids.workspace, ids.owner]);
    const store = createSupabaseStore({env: {SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', SOREN_WORKSPACE_ID: ids.workspace}, fetchImpl: async (url, options) => {
      const name = url.split('/').at(-1); const args = JSON.parse(options.body); const keys = Object.keys(args);
      try {
        const result = await db.query(`select public.${name}(${keys.map((key, index) => `${key}=>$${index + 1}`).join(',')}) value`, Object.values(args));
        return Response.json(result.rows[0].value);
      } catch (error) { return Response.json({code: error.code}, {status: 400}); }
    }});
    const fetchImpl = async url => url.includes('skillsmp.com') ? Response.json({result: {content: [{type: 'text', text: '{"skills":[]}'}]}}) : Response.json([]);
    const first = await runMaintenance({store, env: {SOREN_ENVIRONMENT: 'test'}, owner: 'first-worker', fetchImpl});
    assert.equal(first.completed, 7);
    assert.equal((await db.query('select count(*)::integer n from jobs where state=$1', ['succeeded'])).rows[0].n, 7);
    assert.ok((await store.getSchedulerProfile()).last_dispatcher_at);
    await db.query(`update leases set expires_at=clock_timestamp()-interval '1 second' where key='dispatcher'`);
    const duplicate = await runMaintenance({store, env: {SOREN_ENVIRONMENT: 'test'}, owner: 'second-worker', fetchImpl});
    assert.equal(duplicate.completed, 0);
    assert.equal((await db.query('select count(*)::integer n from jobs')).rows[0].n, 7);
    assert.equal((await db.query('select count(*)::integer n from health_observations')).rows[0].n, 9);
  } finally { await db.close(); }
});

test('independent watcher exposes missing durable delivery and ambiguous outages honestly', async () => {
  const now = Date.now();
  const env = {SOREN_WATCH_GATEWAY_URL: 'https://router.example', SOREN_WATCHER_ACCESS_TOKEN: 'read-only-test-token', SOREN_GATEWAY_FAILURE_DOMAIN: 'vercel', SOREN_WATCHER_FAILURE_DOMAIN: 'independent-monitor'};
  const healthy = await healthOnce({env, now, fetchImpl: async url => url.endsWith('/live') ? Response.json({status: 'live'}) : url.endsWith('/ready') ? Response.json({ready: true}) : Response.json({schedulerProfile: {last_dispatcher_at: new Date(now).toISOString(), cadence_seconds: 300}})});
  assert.equal(healthy.status, 'HEALTHY');
  assert.equal(healthy.durableDelivery, 'NOT_CONFIGURED');
  const unavailable = await healthOnce({env, now, fetchImpl: async () => { throw new Error('network'); }});
  assert.equal(unavailable.status, 'UNKNOWN'); assert.equal(unavailable.promotionEligible, false);
  await assert.rejects(healthOnce({env: {...env, SOREN_WATCHER_ACCESS_TOKEN: ''}}), /watcher_configuration_unavailable/);
});

test('watcher delivery is explicit and writes only the fixed authenticated receipt endpoint', async () => {
  const now = Date.now(); let delivered;
  const env = {SOREN_WATCH_GATEWAY_URL: 'https://router.example', SOREN_WATCHER_ACCESS_TOKEN: 'read-only-and-receipt-test', SOREN_GATEWAY_FAILURE_DOMAIN: 'vercel', SOREN_WATCHER_FAILURE_DOMAIN: 'independent:fixture', SOREN_WATCHER_DELIVERY_ENABLED: 'true'};
  const result = await healthOnce({env, now, fetchImpl: async (url, options) => {
    if (options.method === 'POST') { assert.equal(url, 'https://router.example/api/admin/health/watcher'); delivered = JSON.parse(options.body); return Response.json({durable: true, receiptId: 'receipt:test'}); }
    return url.endsWith('/live') ? Response.json({status: 'live'}) : url.endsWith('/ready') ? Response.json({ready: true}) : Response.json({schedulerProfile: {last_dispatcher_at: new Date(now).toISOString(), cadence_seconds: 300, watcher_cadence_seconds: 900}});
  }});
  assert.equal(result.durableDelivery, 'PERSISTED'); assert.equal(result.watcherContractSatisfied, true); assert.equal(result.promotionEligible, false);
  assert.equal(delivered.failureDomain, 'independent:fixture');
  assert.equal(delivered.status, 'HEALTHY');
});

test('watcher CLI fails enabled durable delivery failures even when gateway probes are healthy', async () => {
  const now = Date.now();
  const baseEnv = {SOREN_WATCH_GATEWAY_URL: 'https://router.example', SOREN_WATCHER_ACCESS_TOKEN: 'secret-receipt-test', SOREN_GATEWAY_FAILURE_DOMAIN: 'vercel', SOREN_WATCHER_FAILURE_DOMAIN: 'independent:fixture'};
  for (const [enabled, delivery, expectedCode] of [['false', 'NOT_CONFIGURED', 0], ['true', 'PERSISTED', 0], ['true', 'FAILED', 1], ['true', 'UNKNOWN_OUTCOME', 1]]) {
    const outputs = [];
    const code = await healthOnceMain({env: {...baseEnv, SOREN_WATCHER_DELIVERY_ENABLED: enabled}, now, log: value => outputs.push(value), error: value => outputs.push(value), fetchImpl: async (url, options) => {
      if (options.method === 'POST') {
        if (delivery === 'UNKNOWN_OUTCOME') throw new Error('network outcome unavailable');
        return Response.json({durable: delivery === 'PERSISTED'}, {status: delivery === 'FAILED' ? 503 : 200});
      }
      return url.endsWith('/live') ? Response.json({status: 'live'}) : url.endsWith('/ready') ? Response.json({ready: true}) : Response.json({schedulerProfile: {last_dispatcher_at: new Date(now).toISOString(), cadence_seconds: 300}});
    }});
    assert.equal(code, expectedCode, delivery);
    assert.equal(JSON.parse(outputs[0]).status, 'HEALTHY');
    assert.equal(JSON.parse(outputs[0]).durableDelivery, delivery);
    assert.equal(outputs.join('').includes(baseEnv.SOREN_WATCHER_ACCESS_TOKEN), false);
  }
});
