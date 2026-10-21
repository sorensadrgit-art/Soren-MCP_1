import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticateRequest, authorizeCron, readJsonBody, errorResponse} from '../../lib/security/auth.mjs';

const now = Date.UTC(2026, 9, 20, 12);
const env = {SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key', SOREN_WORKSPACE_ID: 'workspace-one', SOREN_AUTH_AUDIENCE: 'authenticated', SOREN_AUTH_RESOURCE: 'https://router.example/api/mcp', SOREN_AUTH_CLIENT_ID: 'management,agent', SOREN_MANAGEMENT_CLIENT_ID: 'management', SOREN_ADMIN_ORIGIN: 'https://router.example'};
const claims = {iss: 'https://example.supabase.co/auth/v1', sub: 'user-one', aud: 'authenticated', resource: env.SOREN_AUTH_RESOURCE, client_id: 'management', exp: now / 1000 + 300, auth_time: now / 1000 - 10};
const token = overrides => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({...claims, ...overrides})).toString('base64url')}.signature`;
const request = (overrides, headers = {}, method = 'GET') => new Request('https://router.example/api/admin/status', {method, headers: {Authorization: `Bearer ${token(overrides)}`, ...headers}});
const context = {workspaceId: 'workspace-one', subjectId: 'principal-one', clientId: 'management', kind: 'human', role: 'owner', permissions: ['dashboard:read', 'reviews:write'], grantRevision: 1};
const store = {getPrincipalContext: async () => context};
const fetchImpl = async () => Response.json({id: 'user-one'});

test('managed auth validates remotely before enforcing issuer audience resource expiry and client binding', async () => {
  let calls = 0;
  const fetchSpy = async (url, options) => { calls++; assert.equal(url, `${env.SUPABASE_URL}/auth/v1/user`); assert.match(options.headers.Authorization, /^Bearer /); return fetchImpl(); };
  const actual = await authenticateRequest(request(), {env, fetchImpl: fetchSpy, store, human: true, permission: 'dashboard:read', now});
  assert.equal(actual.isHuman, true); assert.equal(actual.permissions.has('reviews:write'), true); assert.equal(calls, 1);
  for (const overrides of [{iss: 'https://evil.example/auth/v1'}, {aud: 'other'}, {resource: 'other'}, {exp: now / 1000}, {client_id: 'other'}, {sub: 'other'}, {nbf: now / 1000 + 100}]) {
    await assert.rejects(authenticateRequest(request(overrides), {env, fetchImpl, store, now}), error => error.status === 401);
  }
});

test('invalid explicit tokens and revoked grants never become anonymous reads', async () => {
  await assert.rejects(authenticateRequest(request(), {env, fetchImpl: async () => Response.json({}, {status: 401}), store, now}), error => error.status === 401);
  await assert.rejects(authenticateRequest(request(), {env, fetchImpl, store: {getPrincipalContext: async () => null}, now}), error => error.status === 403);
  await assert.rejects(authenticateRequest(new Request('https://router.example/api/admin/status', {headers: {Authorization: 'invalid', Cookie: 'management=existing'}}), {env, fetchImpl, store, now}), error => error.status === 401);
  await assert.rejects(authenticateRequest(request(), {env: {...env, SOREN_AUTH_RESOURCE: ''}, fetchImpl, store, now}), error => error.status === 503);
});

test('agent grants do not confer human approval or owner authority; recent authentication and CSRF bind writes', async () => {
  const agent = {getPrincipalContext: async () => ({...context, kind: 'agent', role: 'owner', permissions: ['reviews:write']})};
  await assert.rejects(authenticateRequest(request(), {env, fetchImpl, store: agent, human: true, now}), error => error.code === 'human_session_required');
  const reviewer = {getPrincipalContext: async () => ({...context, role: 'reviewer'})};
  await assert.rejects(authenticateRequest(request(), {env, fetchImpl, store: reviewer, owner: true, now}), error => error.code === 'owner_required');
  await assert.rejects(authenticateRequest(request({auth_time: now / 1000 - 901}), {env, fetchImpl, store, human: true, now}), error => error.code === 'recent_authentication_required');
  await assert.rejects(authenticateRequest(request({}, {}, 'POST'), {env, fetchImpl, store, human: true, now}), error => error.code === 'origin_denied');
  await assert.rejects(authenticateRequest(request({}, {origin: 'https://evil.example'}, 'POST'), {env, fetchImpl, store, human: true, now}), error => error.code === 'origin_denied');
  assert.equal((await authenticateRequest(request({}, {origin: env.SOREN_ADMIN_ORIGIN}, 'POST'), {env, fetchImpl, store, human: true, now})).isHuman, true);
});

test('identity and database outages fail closed with redacted errors', async () => {
  await assert.rejects(authenticateRequest(request(), {env, fetchImpl: async () => { throw new Error('secret=do-not-log'); }, store, now}), error => error.code === 'identity_service_unavailable');
  const response = errorResponse(new Error('secret=do-not-log'));
  assert.equal(response.status, 503); assert.equal(await response.text(), '{"error":"service_unavailable"}');
});

test('chunked Auth responses stop at the byte limit before buffering their remaining body', async () => {
  let chunks = 0, cancelled = false;
  const stream = new ReadableStream({pull(controller) { chunks++; controller.enqueue(new Uint8Array(16384)); }, cancel() { cancelled = true; }});
  await assert.rejects(authenticateRequest(request(), {env, fetchImpl: async () => new Response(stream), store, now}), error => error.code === 'identity_service_unavailable');
  assert.equal(cancelled, true);
  assert.ok(chunks <= 6);
});

test('scheduler authentication is constant-time and refuses missing/short configured secrets', () => {
  const secret = 'a'.repeat(43);
  assert.doesNotThrow(() => authorizeCron(new Request('https://router.example/api/cron/maintenance', {headers: {Authorization: `Bearer ${secret}`}}), {CRON_SECRET: secret}));
  assert.throws(() => authorizeCron(new Request('https://router.example/api/cron/maintenance'), {CRON_SECRET: secret}), error => error.status === 401);
  assert.throws(() => authorizeCron(new Request('https://router.example/api/cron/maintenance'), {}), error => error.status === 503);
  assert.throws(() => authorizeCron(new Request('https://router.example/api/cron/maintenance'), {CRON_SECRET: 'weak'}), error => error.status === 503);
});

test('JSON trust boundary caps actual streaming bytes and rejects invalid bodies', async () => {
  const make = body => new Request('https://router.example/api/admin/reviews', {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
  assert.deepEqual(await readJsonBody(make('{"ok":true}')), {ok: true});
  for (const body of ['[]', 'null', '{']) await assert.rejects(readJsonBody(make(body)), error => error.status === 400);
  await assert.rejects(readJsonBody(make('{"value":"long"}'), 5), error => error.status === 413);
});

// RFC 7519: nbf is optional, but when present its value must be a NumericDate.
// The managed identity response is deliberately stubbed so local binding validation
// is exercised independently; these are not claims of a hosted Auth-service bypass.
for (const [label, nbf] of [
  ['nonnumeric string', 'not-a-date'], ['numeric string', String(now / 1000 - 10)],
  ['null', null], ['false', false], ['object', {}], ['array', []],
]) {
  test(`verified identity still rejects malformed nbf (${label}) before grant lookup`, async () => {
    let grantLookups = 0;
    const trackedStore = {getPrincipalContext: async () => { grantLookups++; return context; }};
    await assert.rejects(
      authenticateRequest(request({nbf}), {env, fetchImpl, store: trackedStore, now}),
      error => error.status === 401 && error.code === 'invalid_token_binding',
    );
    assert.equal(grantLookups, 0);
  });
}

test('malformed claims payload is a redacted authorization denial, not an internal exception', async () => {
  for (const value of [null, [], 7, 'claims']) {
    const encoded = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(value)).toString('base64url')}.signature`;
    const input = new Request('https://router.example/api/admin/status', {headers: {Authorization: `Bearer ${encoded}`}});
    await assert.rejects(authenticateRequest(input, {env, fetchImpl, store, now}), error => error.status === 401);
  }
});

test('absent and finite numeric not-before claims retain valid boundary behavior', async () => {
  for (const nbf of [undefined, 0, now / 1000 - 0.25, now / 1000]) {
    const actual = await authenticateRequest(request({nbf}), {env, fetchImpl, store, now});
    assert.equal(actual.workspaceId, context.workspaceId);
  }
});
