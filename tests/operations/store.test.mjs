import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseStore, createGatewayStore} from '../../lib/operations/store.mjs';
import {prepareSkillVersion} from '../../lib/registry/identity.mjs';
const env = {SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-test-key', SOREN_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111'};

test('Supabase durable adapter has no memory fallback, refuses missing environment, and redacts SQL failures', async () => {
  assert.throws(() => createSupabaseStore({env: {}}), error => error.status === 503);
  assert.throws(() => createSupabaseStore({env: {...env, SUPABASE_URL: 'http://localhost'}}), error => error.status === 503);
  const store = createSupabaseStore({env, fetchImpl: async () => Response.json({code: 'XX000', message: 'credential=never-return'}, {status: 500})});
  await assert.rejects(store.getHealthSnapshot(), error => error.code === 'private_store_unavailable' && !error.message.includes('credential'));
});

test('public gateway uses a distinct restricted credential without service-role fallback or admin methods', async () => {
  assert.throws(() => createGatewayStore({env: {...env, SUPABASE_ANON_KEY: 'public'}}), error => error.status === 503);
  let calls = 0;
  const gateway = createGatewayStore({env: {...env, SUPABASE_ANON_KEY: 'public', SOREN_GATEWAY_DB_KEY: 'restricted'}, fetchImpl: async (url, options) => {
    calls++; assert.equal(options.headers.apikey, 'public'); assert.equal(options.headers.Authorization, 'Bearer restricted');
    return Response.json({allowed: true});
  }});
  assert.equal(gateway.reviewVersion, undefined);
  assert.equal((await gateway.rpc('claim_federation_budget', {p_subject: 'a'.repeat(64), p_authenticated: false})).allowed, true);
  await assert.rejects(gateway.rpc('review_skill_version', {}), error => error.status === 403);
  assert.equal(calls, 1);
});

test('private content adapter revalidates every read and preserves canonical JSON after database key reordering', async () => {
  const version = prepareSkillVersion({repository: 'https://github.com/owner/repo', directory: 'skills/test', revision: 'a'.repeat(40), license: 'MIT', files: [{path: 'SKILL.md', content: 'private approved content'}]});
  let calls = 0;
  const store = createSupabaseStore({env, fetchImpl: async (url, options) => {
    calls++; assert.match(url, /read_private_version$/); assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(JSON.parse(options.body).p_workspace_id, env.SOREN_WORKSPACE_ID);
    if (calls === 2) return Response.json({code: '42501'}, {status: 403});
    return Response.json({...version, manifest: Object.fromEntries(Object.entries(version.manifest).reverse()), revision: version.manifest.revision});
  }});
  const context = {workspaceId: env.SOREN_WORKSPACE_ID, subjectId: '44444444-4444-4444-8444-444444444444'};
  const ref = {versionId: '77777777-7777-4777-8777-777777777777', manifestSha256: version.manifestSha256};
  assert.equal((await store.readPrivateVersion(context, ref)).content, 'private approved content');
  await assert.rejects(store.readPrivateVersion(context, ref), error => error.status === 403);
  assert.equal(calls, 2);
  await assert.rejects(store.readPrivateVersion({...context, workspaceId: 'other'}, ref), error => error.status === 403);
});
