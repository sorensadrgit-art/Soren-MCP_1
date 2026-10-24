import test from 'node:test';
import assert from 'node:assert/strict';
import {getReadiness} from '../../lib/operations/readiness.mjs';

let baseTime = Date.UTC(2026, 9, 20, 12, 0, 0);
function getNextNow() {
  baseTime += 60000; // Advance time by 60s to ensure module-level cache expires between test cases
  return baseTime;
}

const validPrivateEnv = {
  SOREN_CAPABILITY_MODE: 'private_enabled',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SOREN_AUTH_AUDIENCE: 'test-audience',
  SOREN_AUTH_RESOURCE: 'test-resource',
  SOREN_AUTH_CLIENT_ID: 'test-client-id',
};

test('getReadiness - public_only mode returns public readiness without invoking store or fetch', async () => {
  const now = getNextNow();
  let storeCalled = false;
  let fetchCalled = false;

  const result = await getReadiness({
    env: { SOREN_CAPABILITY_MODE: 'public_only' },
    now,
    createStore: () => { storeCalled = true; return {}; },
    fetchImpl: async () => { fetchCalled = true; return new Response(); },
  });

  assert.equal(result.ready, true);
  assert.equal(result.mode, 'public_only');
  assert.equal(result.status, 'HEALTHY');
  assert.equal(storeCalled, false);
  assert.equal(fetchCalled, false);
});

test('getReadiness - defaults to public_only mode when SOREN_CAPABILITY_MODE is unset', async () => {
  const now = getNextNow();
  const result = await getReadiness({ env: {}, now });
  assert.equal(result.ready, true);
  assert.equal(result.mode, 'public_only');
  assert.equal(result.status, 'HEALTHY');
});

test('getReadiness - private_enabled mode with missing configuration falls back to public readiness with status UNHEALTHY', async () => {
  const now = getNextNow();
  let storeCalled = false;
  const result = await getReadiness({
    env: { SOREN_CAPABILITY_MODE: 'private_enabled' },
    now,
    createStore: () => { storeCalled = true; return {}; },
  });

  assert.equal(result.ready, false);
  assert.equal(result.mode, 'private_enabled');
  assert.equal(result.status, 'UNHEALTHY');
  assert.equal(storeCalled, false);
});

test('getReadiness - private_enabled mode succeeds when health snapshot and auth probe are healthy', async () => {
  const now = getNextNow();
  let fetchedUrl = null;
  let fetchHeaders = null;

  const createStore = () => ({
    getHealthSnapshot: async () => ({ status: 'HEALTHY' }),
  });

  const fetchImpl = async (url, options) => {
    fetchedUrl = url;
    fetchHeaders = options.headers;
    return { ok: true };
  };

  const result = await getReadiness({
    env: { ...validPrivateEnv, SUPABASE_URL: 'https://test1.supabase.co' },
    now,
    createStore,
    fetchImpl,
  });

  assert.equal(result.ready, true);
  assert.equal(result.mode, 'private_enabled');
  assert.equal(result.status, 'HEALTHY');
  assert.equal(result.freshness, 'fresh');
  assert.equal(fetchedUrl, 'https://test1.supabase.co/auth/v1/health');
  assert.equal(fetchHeaders.apikey, 'test-anon-key');
});

test('getReadiness - private_enabled mode fails when store returns null snapshot', async () => {
  const now = getNextNow();
  const createStore = () => ({
    getHealthSnapshot: async () => null,
  });

  const fetchImpl = async () => ({ ok: true });

  const result = await getReadiness({
    env: { ...validPrivateEnv, SUPABASE_URL: 'https://test2.supabase.co' },
    now,
    createStore,
    fetchImpl,
  });

  assert.equal(result.ready, false);
  assert.equal(result.status, 'UNHEALTHY');
});

test('getReadiness - private_enabled mode fails when auth endpoint returns non-ok status', async () => {
  const now = getNextNow();
  const createStore = () => ({
    getHealthSnapshot: async () => ({ status: 'HEALTHY' }),
  });

  const fetchImpl = async () => ({ ok: false });

  const result = await getReadiness({
    env: { ...validPrivateEnv, SUPABASE_URL: 'https://test3.supabase.co' },
    now,
    createStore,
    fetchImpl,
  });

  assert.equal(result.ready, false);
  assert.equal(result.status, 'UNHEALTHY');
});

test('getReadiness - handles exceptions from store or fetch gracefully', async () => {
  const now = getNextNow();
  const createStore = () => ({
    getHealthSnapshot: async () => { throw new Error('DB Connection Error'); },
  });

  const fetchImpl = async () => ({ ok: true });

  const result = await getReadiness({
    env: { ...validPrivateEnv, SUPABASE_URL: 'https://test4.supabase.co' },
    now,
    createStore,
    fetchImpl,
  });

  assert.equal(result.ready, false);
  assert.equal(result.status, 'UNHEALTHY');
});

test('getReadiness - caches result for 15 seconds for the same SUPABASE_URL origin', async () => {
  const now = getNextNow();
  let callCount = 0;
  const env = { ...validPrivateEnv, SUPABASE_URL: 'https://cache.supabase.co' };

  const createStore = () => ({
    getHealthSnapshot: async () => {
      callCount++;
      return { status: 'HEALTHY' };
    },
  });

  const fetchImpl = async () => ({ ok: true });

  // First call caches the result
  const res1 = await getReadiness({ env, now, createStore, fetchImpl });
  assert.equal(res1.ready, true);
  assert.equal(callCount, 1);

  // Second call within 15 seconds uses cache
  const res2 = await getReadiness({ env, now: now + 10000, createStore, fetchImpl });
  assert.equal(res2.ready, true);
  assert.equal(callCount, 1);

  // Third call after 15 seconds expires cache and fetches fresh status
  const res3 = await getReadiness({ env, now: now + 16000, createStore, fetchImpl });
  assert.equal(res3.ready, true);
  assert.equal(callCount, 2);
});

test('getReadiness - cache is bypassed if SUPABASE_URL origin changes', async () => {
  const now = getNextNow();
  let callCount = 0;

  const createStore = () => ({
    getHealthSnapshot: async () => {
      callCount++;
      return { status: 'HEALTHY' };
    },
  });

  const fetchImpl = async () => ({ ok: true });

  const env1 = { ...validPrivateEnv, SUPABASE_URL: 'https://origin1.supabase.co' };
  const env2 = { ...validPrivateEnv, SUPABASE_URL: 'https://origin2.supabase.co' };

  await getReadiness({ env: env1, now, createStore, fetchImpl });
  assert.equal(callCount, 1);

  await getReadiness({ env: env2, now: now + 1000, createStore, fetchImpl });
  assert.equal(callCount, 2);
});
