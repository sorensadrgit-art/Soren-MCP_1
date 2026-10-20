import test from 'node:test';
import assert from 'node:assert/strict';
import {database, rpc, ids} from './database-helper.mjs';

test('gateway database role cannot mutate reviews, publish catalogs, read admin state or call updater RPCs', async () => {
  const db = await database();
  try {
    await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({workspace_id: ids.workspace})]);
    await db.exec('set role soren_gateway');
    try {
      const context = await rpc(db, 'get_principal_context', [ids.workspace, 'https://example.supabase.co/auth/v1', ids.otherUser, 'agent']);
      assert.equal(context.kind, 'agent');
      await assert.rejects(rpc(db, 'get_principal_context', [ids.otherWorkspace, 'https://example.supabase.co/auth/v1', ids.otherUser, 'agent']), /workspace_access_denied/);
      await assert.rejects(db.query('select * from grants'), /permission denied/);
      await assert.rejects(db.query('insert into operation_events(workspace_id,operation,target_identity) values($1,$2,$3)', [ids.workspace, 'bad', 'bad']), /permission denied/);
      await assert.rejects(rpc(db, 'review_skill_version', [ids.workspace, ids.owner, ids.reader, 'a'.repeat(64), 'approve', 0, 'b'.repeat(64), 'fixture']), /permission denied/);
      await assert.rejects(rpc(db, 'publish_catalog', [ids.workspace, ids.owner, [], 0]), /permission denied/);
      await assert.rejects(rpc(db, 'get_workspace_status', [ids.workspace, ids.owner]), /permission denied/);
      await assert.rejects(rpc(db, 'update_read_policy', [ids.workspace, 'project', 'production']), /permission denied/);
      assert.equal((await rpc(db, 'claim_federation_budget', ['a'.repeat(64), false])).allowed, true);
    } finally { await db.exec('reset role'); }
  } finally { await db.close(); }
});
