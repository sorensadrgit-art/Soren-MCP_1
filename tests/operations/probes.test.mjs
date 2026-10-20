import test from 'node:test';
import assert from 'node:assert/strict';
import {probeComponents} from '../../lib/operations/probes.mjs';
import {validateWatcherReceipt} from '../../lib/operations/watcher.mjs';
const now = Date.UTC(2026, 9, 20, 12);
const profile = {cadence_seconds: 300};
const run = (jobType, options = {}, targetIdentity = 'local_control_plane') => probeComponents({jobType, targetIdentity}, {env: {}, profile, now: () => now, store: {}, ...options});

test('private probes separate database, auth service liveness and actually verified managed identity', async () => {
  const result = await run('private_probe', {env: {SUPABASE_URL: 'https://example.supabase.co'}, store: {getOperationsProbeState: async () => ({databaseAvailable: true})}, fetchImpl: async () => Response.json({version: 'auth'})});
  assert.equal(result.observations.find(item => item.component === 'private_database').status, 'HEALTHY');
  assert.equal(result.observations.find(item => item.component === 'private_auth_service').status, 'HEALTHY');
  assert.equal(result.observations.find(item => item.component === 'private_auth').status, 'UNKNOWN');
});

test('provider probes use shared budget and classify 429 with Retry-After without becoming core failures', async () => {
  let requests = 0;
  const denied = await run('provider_probe', {store: {workspaceId: 'test', rpc: async () => ({allowed: false, retry_after: 120})}, fetchImpl: async () => { requests++; }}, 'provider:skillsmp');
  assert.equal(denied.observations[0].failureClass, 'provider_quota'); assert.equal(requests, 0);
  const limited = await run('provider_probe', {store: {workspaceId: 'test', rpc: async () => ({allowed: true})}, fetchImpl: async () => new Response('', {status: 429, headers: {'Retry-After': '120'}})}, 'provider:skillsmp');
  assert.equal(limited.observations[0].status, 'DEGRADED'); assert.equal(limited.observations[0].failureClass, 'provider_429'); assert.equal(limited.retryAfterSeconds, 120);
  assert.equal((await run('provider_probe', {}, 'provider:skills_sh')).observations[0].status, 'UNKNOWN');
});

test('release probes observe persisted policy and unresolved outcome freshness without deployment authority', async () => {
  const store = state => ({getOperationsProbeState: async () => state});
  assert.equal((await run('release_probe', {store: store({policy: null})})).observations[0].status, 'UNKNOWN');
  assert.equal((await run('release_probe', {store: store({policy: {mode: 'observe'}})})).observations[0].status, 'HEALTHY');
  assert.equal((await run('release_probe', {store: store({policy: {mode: 'armed', arming: {expiresAt: new Date(now + 60000).toISOString()}}})})).observations[0].status, 'HEALTHY');
  assert.equal((await run('release_probe', {store: store({policy: {mode: 'armed', arming: {expiresAt: new Date(now - 1).toISOString()}}})})).observations[0].failureClass, 'arming_expired');
  assert.equal((await run('release_probe', {store: store({policy: {mode: 'observe'}, oldestPendingOperationAt: new Date(now - 1000000).toISOString()})})).observations[0].status, 'DEGRADED');
});

test('scheduler and watcher gaps remain UNKNOWN and fixed watcher receipts reject false healthy or arbitrary fields', async () => {
  assert.equal((await run('scheduler_probe')).observations[0].failureClass, 'scheduler_stale');
  assert.equal((await run('watcher_probe')).observations[0].failureClass, 'watcher_not_configured');
  const receipt = {observedAt: new Date(now).toISOString(), scheduledSlot: new Date(now).toISOString(), probeIdentity: 'probe:one', status: 'HEALTHY', gatewayReachable: true, dispatcherFresh: true, failureDomain: 'github:owner/repository', environment: 'test', sourceRevision: null, evidenceRef: 'test:receipt'};
  assert.equal(validateWatcherReceipt(receipt, {now}).status, 'HEALTHY');
  assert.throws(() => validateWatcherReceipt({...receipt, dispatcherFresh: false}, {now}));
  assert.throws(() => validateWatcherReceipt({...receipt, shell: 'arbitrary'}, {now}));
});
