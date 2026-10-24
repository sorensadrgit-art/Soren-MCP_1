import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFailure, reconcileIncident, publicReadiness, watcherContract, retryDecision} from '../../lib/operations/health.mjs';
import {runMaintenance} from '../../lib/operations/maintenance.mjs';
import {getReadiness, clearReadinessCache} from '../../lib/operations/readiness.mjs';

test.beforeEach(() => {
  clearReadinessCache();
});

const now = Date.UTC(2026, 9, 20, 12);
const sample = (offset, status = 'UNHEALTHY', failureClass = 'contract') => ({component: 'gateway', environment: 'test', status, failureClass, probeIdentity: `probe-${offset}`, scheduledSlot: new Date(now + offset * 300000).toISOString(), observedAt: new Date(now + offset * 300000).toISOString(), evidenceRefs: []});

test('incidents require three distinct consecutive fresh failure slots, followed by two fresh successes', () => {
  assert.equal(reconcileIncident([sample(-1), sample(0), sample(0)], {now}).state, 'SUSPECT');
  const opened = reconcileIncident([sample(-2), sample(-1), sample(0)], {now});
  assert.equal(opened.state, 'OPEN'); assert.equal(opened.notify, 'opened');
  const previous = {...opened, lastNotifiedAt: new Date(now).toISOString()};
  assert.equal(reconcileIncident([sample(-1), sample(0, 'HEALTHY', null)], {now, previous}).state, 'RECOVERING');
  const resolved = reconcileIncident([sample(-2), sample(-1, 'HEALTHY', null), sample(0, 'HEALTHY', null)], {now, previous});
  assert.equal(resolved.state, 'RESOLVED'); assert.equal(resolved.notify, 'recovered');
  assert.equal(reconcileIncident([sample(-5), sample(-1), sample(0)], {now}).state, 'SUSPECT');
});

test('missing or expired observations are UNKNOWN, with cadence-aware freshness', () => {
  assert.equal(reconcileIncident([], {now}).status, 'UNKNOWN');
  assert.equal(reconcileIncident([sample(-4)], {now}).stale, true);
  assert.equal(reconcileIncident([sample(-4)], {now, cadenceSeconds: 86400}).stale, false);
  const publicMode = publicReadiness({mode: 'public_only', bundledReady: true, privateReady: false, now});
  assert.equal(publicMode.ready, true);
  assert.equal(publicReadiness({mode: 'private_enabled', bundledReady: true, privateReady: true, observedAt: sample(-4).observedAt, now}).ready, false);
  const deadman = reconcileIncident([sample(-2, 'UNKNOWN', 'watcher_stale'), sample(-1, 'UNKNOWN', 'watcher_stale'), sample(0, 'UNKNOWN', 'watcher_stale')], {now});
  assert.equal(deadman.state, 'OPEN'); assert.equal(deadman.status, 'UNKNOWN');
});

test('provider outages and ambiguous network failures never authorize release rollback', () => {
  assert.deepEqual(classifyFailure({component: 'provider:skillsmp', failureClass: 'provider_timeout'}), {status: 'DEGRADED', rollbackEligible: false, hardFailure: false});
  assert.equal(classifyFailure({component: 'gateway', failureClass: 'contract'}).rollbackEligible, true);
  assert.equal(classifyFailure({component: 'gateway', failureClass: 'contract', candidateReachable: false, controlReachable: false}).status, 'UNKNOWN');
});

test('independent watcher requires fresh dispatcher and separate declared deployment failure domain', () => {
  const input = {gatewayDomain: 'vercel-project', watcherDomain: 'external-monitor', lastObservationAt: sample(0).observedAt, lastDispatcherAt: sample(0).observedAt, cadenceSeconds: 300, now};
  assert.equal(watcherContract(input).promotionEligible, true);
  assert.equal(watcherContract({...input, watcherDomain: input.gatewayDomain}).promotionEligible, false);
  assert.equal(watcherContract({...input, lastDispatcherAt: sample(-4).observedAt}).promotionEligible, false);
  assert.equal(watcherContract({...input, lastObservationAt: null}).promotionEligible, false);
});

test('bounded safe retry respects larger Retry-After and denies uncertain/auth/policy retries', () => {
  assert.deepEqual(retryDecision({attempt: 1, failureClass: 'provider_429', retryAfterSeconds: 90}), {retry: true, delaySeconds: 90});
  assert.equal(retryDecision({attempt: 2, failureClass: 'timeout'}).delaySeconds, 120);
  for (const failureClass of ['authentication', 'invalid_payload', 'policy_denied', 'unknown_outcome']) assert.equal(retryDecision({attempt: 1, failureClass}).retry, false);
  assert.equal(retryDecision({attempt: 3, failureClass: 'timeout'}).retry, false);
});

test('maintenance cannot start without a persisted entitled owner-consented scheduler profile', async () => {
  let invoked = false;
  await assert.rejects(runMaintenance({store: {getSchedulerProfile: async () => null, acquireLease: async () => { invoked = true; }}, now: () => now}), /schedule_not_authorized/);
  assert.equal(invoked, false);
});

test('maintenance budget prevents a later lease mutation after a slow dependency', async () => {
  let elapsed = 0, acquired = false;
  const store = {getSchedulerProfile: async () => { elapsed = 35000; return {profile: 'frequent', cadence_seconds: 300, entitlement_evidence_ref: 'fixture', consent_at: new Date(now).toISOString()}; }, acquireLease: async () => { acquired = true; }};
  await assert.rejects(runMaintenance({store, now: () => now + elapsed}), /maintenance_budget_exhausted/);
  assert.equal(acquired, false);
});

test('public-only readiness avoids private dependencies and private mode fails closed on missing auth or database', async () => {
  let calls = 0;
  const createStore = () => { calls++; throw new Error('unavailable'); };
  assert.equal((await getReadiness({env: {}, createStore, now})).ready, true);
  assert.equal(calls, 0);
  assert.equal((await getReadiness({env: {SOREN_CAPABILITY_MODE: 'private_enabled'}, createStore, now})).ready, false);
  assert.equal(calls, 0);
  const privateEnv = {SOREN_CAPABILITY_MODE: 'private_enabled', SUPABASE_ANON_KEY: 'test', SOREN_AUTH_AUDIENCE: 'authenticated', SOREN_AUTH_RESOURCE: 'test', SOREN_AUTH_CLIENT_ID: 'test'};
  assert.equal((await getReadiness({env: privateEnv, createStore, now, fetchImpl: async () => Response.json({})})).ready, false);
  assert.equal(calls, 1);
});
