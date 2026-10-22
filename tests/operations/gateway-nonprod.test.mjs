import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database} from './database-helper.mjs';
import {verifyGatewayStore, preconditions} from '../../scripts/verify-gateway-store.mjs';

const origin = 'https://nonprod-fixture.supabase.co';
const seed = {workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', issuer: `${origin}/auth/v1`, owner_subject: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner_client_id: 'management', agent_subject: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', agent_client_id: 'agent-probe'};
const jwt = claims => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'fixture'].join('.');
const exp = Math.floor(Date.now() / 1000) + 3600;
const env = {
  SOREN_STORE_TARGET: 'nonproduction', SUPABASE_URL: origin, SUPABASE_ANON_KEY: jwt({role: 'anon'}),
  SOREN_GATEWAY_DB_KEY: jwt({role: 'soren_gateway', workspace_id: seed.workspace_id, exp}), SOREN_WORKSPACE_ID: seed.workspace_id,
  SOREN_RATE_KEY: 'r'.repeat(32), SOREN_PROBE_SUBJECT: seed.agent_subject, SOREN_PROBE_CLIENT_ID: seed.agent_client_id,
};
const seedSql = async () => (await readFile(new URL('../../supabase/nonprod/seed-gateway-test.sql', import.meta.url), 'utf8'))
  .replace(/:'(\w+)'/g, (_, name) => { assert.ok(name in seed, `unbound seed variable ${name}`); return `'${seed[name]}'`; });

/** Minimal PostgREST stand-in: the bearer JWT's role and claims become the database role and request.jwt.claims. */
function postgrest(db) {
  let queue = Promise.resolve();
  const handle = async (url, init) => {
    const {pathname, searchParams} = new URL(url);
    const bearer = init.headers.Authorization?.slice(7) || init.headers.apikey;
    const claims = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
    await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify(claims)]);
    await db.exec(`set role ${claims.role === 'soren_gateway' ? 'soren_gateway' : 'anon'}`);
    try {
      let rows;
      if (pathname.startsWith('/rest/v1/rpc/')) {
        const args = Object.entries(JSON.parse(init.body));
        const sql = `select public.${pathname.slice(13)}(${args.map(([name], index) => `${name}=>$${index + 1}`).join(',')}) as value`;
        rows = (await db.query(sql, args.map(([, value]) => Array.isArray(value) ? `{${value.join(',')}}` : value !== null && typeof value === 'object' ? JSON.stringify(value) : value))).rows;
        return Response.json(rows[0].value ?? null);
      }
      rows = (await db.query(`select ${searchParams.get('select')} from public.${pathname.slice(9)} limit 1`)).rows;
      return Response.json(rows);
    } catch (error) {
      const status = error.code === '42501' ? 403 : error.code === '42883' ? 404 : 400;
      return Response.json({code: error.code, message: error.message}, {status});
    } finally { await db.exec('reset role'); }
  };
  return (url, init) => (queue = queue.then(() => handle(url, init), () => handle(url, init)));
}

test('non-production seed plus gateway role passes the store probe; every elevated path is denied', async () => {
  const db = await database();
  try {
    await db.exec('delete from grants; delete from workspace_memberships; delete from principals; delete from workspaces;');
    await db.exec(await seedSql());
    await assert.rejects(db.exec(await seedSql()), /seed_requires_empty_nonproduction_store/);
    await db.exec('rollback');
    const report = await verifyGatewayStore({env, fetchImpl: postgrest(db)});
    assert.equal(report.status, 'PASS', JSON.stringify(report.checks.filter(c => !c.pass)));
    assert.equal(report.checks.length, 10);
    assert.equal(JSON.stringify(report).includes(env.SOREN_GATEWAY_DB_KEY), false);
    assert.equal(JSON.stringify(report).includes(env.SOREN_RATE_KEY), false);
    await db.exec('grant execute on function public.get_health_snapshot to soren_gateway; grant select on public.grants to soren_gateway;');
    const widened = await verifyGatewayStore({env, fetchImpl: postgrest(db)});
    assert.equal(widened.status, 'FAIL');
    assert.deepEqual(widened.checks.filter(c => !c.pass).map(c => c.name), ['gateway key denied get_health_snapshot', 'gateway key cannot read tables directly']);
  } finally { await db.close(); }
});

test('store probe refuses production targets, elevated keys and mis-scoped gateway keys', async () => {
  const refused = async overrides => (await verifyGatewayStore({env: {...env, ...overrides}, fetchImpl: () => { throw new Error('network must not be used'); }}));
  for (const [overrides, issue] of [
    [{SOREN_STORE_TARGET: undefined}, /nonproduction/],
    [{VERCEL_ENV: 'production'}, /production runtime refused/],
    [{SUPABASE_SERVICE_ROLE_KEY: 'present'}, /SUPABASE_SERVICE_ROLE_KEY/],
    [{SOREN_GATEWAY_DB_KEY: jwt({role: 'service_role', workspace_id: seed.workspace_id, exp})}, /role is not soren_gateway/],
    [{SOREN_GATEWAY_DB_KEY: jwt({role: 'soren_gateway', workspace_id: seed.owner_subject, exp})}, /workspace_id does not match/],
    [{SOREN_GATEWAY_DB_KEY: jwt({role: 'soren_gateway', workspace_id: seed.workspace_id})}, /no expiry/],
    [{SOREN_RATE_KEY: 'short'}, /below 32 bytes/],
    [{SOREN_PRODUCTION_SUPABASE_REFS: 'other,nonprod-fixture'}, /production project/],
  ]) {
    const report = await refused(overrides);
    assert.equal(report.status, 'REFUSED');
    assert.ok(report.issues.some(value => issue.test(value)), JSON.stringify(report.issues));
  }
  assert.deepEqual(preconditions(env).issues, []);
});
