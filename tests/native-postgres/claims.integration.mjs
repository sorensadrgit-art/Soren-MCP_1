import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import pg from 'pg';
import {ids, rpc, asReader} from '../operations/database-helper.mjs';

const connection = process.env.SOREN_TEST_DATABASE_URL;
if (!connection) throw new Error('BLOCKED: SOREN_TEST_DATABASE_URL must name an isolated local PostgreSQL service');
const url = new URL(connection);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/postgres') throw new Error('isolated_test_postgres_required');

test('native PostgreSQL uses independent backend sessions for claims, fences and permissions', {timeout: 120_000}, async t => {
  const admin = new pg.Client({connectionString: connection});
  const databaseName = `soren_test_${randomUUID().replaceAll('-', '')}`;
  const clients = [];
  let created = false;
  await admin.connect();
  try {
    await admin.query(`create database "${databaseName}"`);
    created = true;
    const testUrl = new URL(url); testUrl.pathname = `/${databaseName}`;
    for (let index = 0; index < 2; index++) {
      const client = new pg.Client({connectionString: testUrl.href, statement_timeout: 20_000});
      await client.connect(); clients.push(client);
      client.exec = statement => client.query(statement);
    }
    const [first, second] = clients;
    assert.notEqual((await first.query('select pg_backend_pid() id')).rows[0].id, (await second.query('select pg_backend_pid() id')).rows[0].id);
    t.diagnostic(JSON.stringify({postgresVersion:(await first.query('select version()')).rows[0].version,distinctBackendSessions:true}));
    await first.query(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
      end $$;
      create schema auth; grant usage on schema auth,public to authenticated,anon,service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant execute on all functions in schema auth to authenticated,anon,service_role;`);
    for (const file of (await readdir(new URL('../../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) await first.query(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    await first.query('insert into workspaces(id) values($1),($2)', [ids.workspace, ids.otherWorkspace]);
    await first.query(`insert into principals(id,auth_issuer,auth_subject,client_id,kind) values($1,'https://example.supabase.co/auth/v1',$3,'management','human'),($2,'https://example.supabase.co/auth/v1',$4,'agent','agent')`, [ids.owner, ids.reader, ids.user, ids.otherUser]);
    await first.query(`insert into workspace_memberships(workspace_id,principal_id,role) values($1,$2,'owner'),($1,$3,'reader')`, [ids.workspace, ids.owner, ids.reader]);
    await first.query(`insert into grants(workspace_id,principal_id,operations,expires_at,created_by) values($1,$2,array['skills:read','health:read'],now()+interval '1 day',$3)`, [ids.workspace, ids.reader, ids.owner]);

    await t.test('simultaneous intent claims elect one worker and a stale fence cannot finish', async () => {
      const args = [ids.workspace, 'native:parallel', 'a'.repeat(64), 'gateway_probe', new Date().toISOString(), 'native-test'];
      const claims = await Promise.all(clients.map((client, index) => rpc(client, 'claim_job', [...args, `worker-${index}`])));
      assert.equal(claims.filter(item => item.claimed).length, 1);
      const claim = claims.find(item => item.claimed);
      await assert.rejects(rpc(second, 'claim_job', [ids.workspace, 'native:parallel', 'b'.repeat(64), ...args.slice(3), 'conflicting-worker']), /job_payload_conflict/);
      await first.query(`update leases set expires_at=clock_timestamp()-interval '1 second' where workspace_id=$1 and key=$2`, [ids.workspace, claim.lease.key]);
      const next = await rpc(second, 'acquire_lease', [ids.workspace, claim.lease.key, 'replacement-worker', 120]);
      assert.equal(next.fence, claim.lease.fence + 1);
      await assert.rejects(rpc(first, 'finish_job', [ids.workspace, claim.jobId, claim.lease.owner, claim.lease.fence, true, 'native-result', null, 0]), /stale_lease_fence/);
      assert.equal((await rpc(second, 'finish_job', [ids.workspace, claim.jobId, next.owner, next.fence, true, 'native-result', null, 0])).state, 'succeeded');
    });
    await t.test('RLS and the gateway role deny cross-workspace and administrative access', async () => {
      assert.equal((await asReader(first, () => first.query('select id from workspaces'))).rows.length, 1);
      assert.equal((await asReader(first, () => first.query('select id from workspaces'), {client: 'wrong-client'})).rows.length, 0);
      await second.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({workspace_id: ids.workspace})]);
      await second.query('set role soren_gateway');
      try {
        assert.equal((await rpc(second, 'get_principal_context', [ids.workspace, 'https://example.supabase.co/auth/v1', ids.otherUser, 'agent'])).kind, 'agent');
        await assert.rejects(rpc(second, 'get_principal_context', [ids.otherWorkspace, 'https://example.supabase.co/auth/v1', ids.otherUser, 'agent']), /workspace_access_denied/);
        await assert.rejects(second.query('select * from grants'), /permission denied/);
        await assert.rejects(rpc(second, 'publish_catalog', [ids.workspace, ids.owner, [], 0]), /permission denied/);
      } finally { await second.query('reset role'); }
    });
  } finally {
    await Promise.allSettled(clients.map(client => client.end()));
    if (created) await admin.query(`drop database "${databaseName}" with (force)`);
    await admin.end();
  }
});
