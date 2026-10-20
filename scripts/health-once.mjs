#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {watcherContract} from '../lib/operations/health.mjs';
import {randomUUID} from 'node:crypto';
import {readBoundedText} from '../lib/security/auth.mjs';
import {validateWatcherReceipt} from '../lib/operations/watcher.mjs';

/** Independent probes with optional narrow receipt delivery. Never registers a schedule or sends alerts. */
export async function healthOnce({env = process.env, fetchImpl = fetch, now = Date.now()} = {}) {
  let origin;
  try { origin = new URL(env.SOREN_WATCH_GATEWAY_URL); } catch { throw new Error('watcher_configuration_unavailable'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('watcher_configuration_invalid');
  const bearer = env.SOREN_WATCHER_ACCESS_TOKEN;
  if (!bearer || !env.SOREN_WATCHER_FAILURE_DOMAIN || !env.SOREN_GATEWAY_FAILURE_DOMAIN) throw new Error('watcher_configuration_unavailable');
  const results = await Promise.allSettled([
    fetchImpl(`${origin.origin}/api/health/live`, {signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store'}),
    fetchImpl(`${origin.origin}/api/admin/health`, {headers: {Authorization: `Bearer ${bearer}`}, signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store'}),
    fetchImpl(`${origin.origin}/api/health/ready`, {signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store'}),
  ]);
  const gatewayReachable = results[0].status === 'fulfilled' && results[0].value.ok;
  let profile = null;
  if (results[1].status === 'fulfilled' && results[1].value.ok) {
    const body = await readBoundedText(results[1].value, 650000);
    profile = JSON.parse(body).schedulerProfile;
  }
  const contract = watcherContract({gatewayDomain: env.SOREN_GATEWAY_FAILURE_DOMAIN, watcherDomain: env.SOREN_WATCHER_FAILURE_DOMAIN, lastObservationAt: new Date(now).toISOString(), lastDispatcherAt: profile?.last_dispatcher_at, cadenceSeconds: profile?.cadence_seconds || 300, now});
  let ready = false;
  if (results[2].status === 'fulfilled' && results[2].value.ok) {
    try { ready = JSON.parse(await readBoundedText(results[2].value, 4096)).ready === true; } catch { ready = false; }
  }
  if (results[0].status === 'fulfilled') await results[0].value.body?.cancel();
  const status = !gatewayReachable && !profile ? 'UNKNOWN' : gatewayReachable && ready && profile && contract.dispatcherFresh ? 'HEALTHY' : !gatewayReachable && profile ? 'UNHEALTHY' : 'DEGRADED';
  const cadence = profile?.watcher_cadence_seconds || Number(env.SOREN_WATCHER_CADENCE_SECONDS || 900);
  if (!Number.isInteger(cadence) || cadence < 60 || cadence > 172800) throw new Error('watcher_configuration_invalid');
  const probeIdentity = randomUUID();
  const receipt = validateWatcherReceipt({observedAt: new Date(now).toISOString(), scheduledSlot: new Date(Math.floor(now / (cadence * 1000)) * cadence * 1000).toISOString(), probeIdentity, status, gatewayReachable: gatewayReachable && ready, dispatcherFresh: contract.dispatcherFresh, failureDomain: env.SOREN_WATCHER_FAILURE_DOMAIN, environment: env.SOREN_ENVIRONMENT || 'production', sourceRevision: /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ? env.GITHUB_SHA : null, evidenceRef: env.GITHUB_RUN_ID ? `github-run:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT || 1}` : `manual:${probeIdentity}`}, {now});
  let durableDelivery = 'NOT_CONFIGURED'; let receiptId = null;
  if (env.SOREN_WATCHER_DELIVERY_ENABLED === 'true') {
    try {
      const response = await fetchImpl(`${origin.origin}/api/admin/health/watcher`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`}, body: JSON.stringify(receipt), signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store'});
      const body = JSON.parse(await readBoundedText(response, 4096));
      durableDelivery = response.ok && body.durable === true ? 'PERSISTED' : 'FAILED'; receiptId = body.receiptId || null;
    } catch { durableDelivery = 'UNKNOWN_OUTCOME'; }
  }
  return {observedAt: receipt.observedAt, status, gatewayReachable, dispatcherFresh: contract.dispatcherFresh, independent: contract.independent, watcherContractSatisfied: durableDelivery === 'PERSISTED' && gatewayReachable && ready && contract.promotionEligible, promotionEligible: false, evidenceKind: 'external_observation', durableDelivery, receiptId, receipt};
}

export async function healthOnceMain({env = process.env, fetchImpl = fetch, now = Date.now(), log = console.log, error = console.error} = {}) {
  try {
    const result = await healthOnce({env, fetchImpl, now});
    log(JSON.stringify(result));
    return result.status === 'HEALTHY' && (env.SOREN_WATCHER_DELIVERY_ENABLED !== 'true' || result.durableDelivery === 'PERSISTED') ? 0 : 1;
  } catch {
    error(JSON.stringify({status: 'UNKNOWN', error: 'watcher_unavailable', promotionEligible: false}));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await healthOnceMain();
