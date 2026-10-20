const STATUSES = new Set(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN', 'DISABLED']);
export const COMPONENTS = ['gateway', 'bundled_catalog', 'private_database', 'private_auth', 'scheduler', 'release_controller'];

export function classifyFailure({component, failureClass, candidateReachable = true, controlReachable = true}) {
  if (!candidateReachable && !controlReachable) return {status: 'UNKNOWN', rollbackEligible: false, hardFailure: false};
  if (component.startsWith('provider:') || ['provider_429', 'provider_timeout', 'provider_catalog'].includes(failureClass)) return {status: 'DEGRADED', rollbackEligible: false, hardFailure: false};
  const hardFailure = ['contract', 'artifact_identity', 'bundled_integrity'].includes(failureClass);
  return {status: hardFailure ? 'UNHEALTHY' : 'UNKNOWN', rollbackEligible: hardFailure && candidateReachable && controlReachable, hardFailure};
}

export function validateObservation(value) {
  if (!value || !/^[\w:.-]{1,120}$/.test(value.component || '') || !/^[\w.-]{1,80}$/.test(value.environment || '') || !STATUSES.has(value.status)
    || !/^[\w:.-]{1,160}$/.test(value.probeIdentity || '') || !Number.isFinite(Date.parse(value.observedAt)) || !Number.isFinite(Date.parse(value.scheduledSlot))
    || (value.failureClass !== null && value.failureClass !== undefined && !/^[\w.-]{1,80}$/.test(value.failureClass))
    || (value.latencyMs != null && (!Number.isFinite(value.latencyMs) || value.latencyMs < 0 || value.latencyMs > 45000))
    || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 16 || value.evidenceRefs.some(item => typeof item !== 'string' || item.length > 256)) throw new Error('invalid_observation');
  return value;
}

export function reconcileIncident(observations, {now = Date.now(), cadenceSeconds = 300, previous = null} = {}) {
  if (!Number.isInteger(cadenceSeconds) || cadenceSeconds < 30 || cadenceSeconds > 172800) throw new Error('invalid_cadence');
  const deduped = new Map();
  for (const value of observations) {
    validateObservation(value);
    const key = `${value.component}:${value.environment}:${value.scheduledSlot}`;
    if (!deduped.has(key) || Date.parse(value.observedAt) < Date.parse(deduped.get(key).observedAt)) deduped.set(key, value);
  }
  const sorted = [...deduped.values()].filter(value => Date.parse(value.observedAt) <= now + 5000).sort((a, b) => Date.parse(a.scheduledSlot) - Date.parse(b.scheduledSlot));
  const latest = sorted.at(-1);
  if (!latest || now - Date.parse(latest.observedAt) > cadenceSeconds * 3000 || Date.parse(latest.scheduledSlot) > now + 5000) return {state: previous?.state || 'UNKNOWN', status: 'UNKNOWN', stale: true, failureCount: 0, successCount: 0, notify: null};
  let failures = 0, successes = 0, previousSlot = null, failureClass = null;
  for (const sample of sorted) {
    const slot = Date.parse(sample.scheduledSlot);
    if (previousSlot != null && slot - previousSlot > cadenceSeconds * 1500) { failures = 0; successes = 0; failureClass = null; }
    if (sample.status === 'HEALTHY') { successes++; failures = 0; }
    else if (sample.status === 'UNHEALTHY' || sample.status === 'DEGRADED' || (sample.status === 'UNKNOWN' && ['scheduler_stale', 'watcher_stale'].includes(sample.failureClass))) {
      if (sample.failureClass !== failureClass) failures = 0;
      failures++; successes = 0; failureClass = sample.failureClass;
    } else { failures = 0; successes = 0; }
    previousSlot = slot;
  }
  const wasOpen = ['OPEN', 'RECOVERING'].includes(previous?.state);
  const state = failures >= 3 ? 'OPEN' : wasOpen ? (successes >= 2 ? 'RESOLVED' : successes ? 'RECOVERING' : 'OPEN') : failures ? 'SUSPECT' : 'HEALTHY';
  const status = latest.status;
  const notify = state === 'OPEN' && !wasOpen ? 'opened' : state === 'RESOLVED' && wasOpen ? 'recovered' : state === 'OPEN' && now - Date.parse(previous?.lastNotifiedAt || new Date(now).toISOString()) >= 1800000 ? 'escalated' : null;
  return {state, status, stale: false, failureCount: failures, successCount: successes, failureClass, notify};
}

export function publicReadiness({mode = 'public_only', bundledReady, privateReady = false, observedAt = null, now = Date.now(), cadenceSeconds = 300}) {
  const fresh = observedAt != null && now - Date.parse(observedAt) >= -5000 && now - Date.parse(observedAt) <= cadenceSeconds * 3000;
  return {ready: Boolean(bundledReady && (mode === 'public_only' || (fresh && privateReady))), mode, status: !bundledReady ? 'UNHEALTHY' : mode === 'public_only' ? 'HEALTHY' : fresh ? privateReady ? 'HEALTHY' : 'UNHEALTHY' : 'UNKNOWN', observedAt, freshness: observedAt == null ? 'unknown' : fresh ? 'fresh' : 'stale'};
}

export function watcherContract({gatewayDomain, watcherDomain, lastObservationAt, lastDispatcherAt, cadenceSeconds, now = Date.now()}) {
  const independent = Boolean(gatewayDomain && watcherDomain && gatewayDomain !== watcherDomain);
  const fresh = value => Number.isFinite(Date.parse(value)) && now - Date.parse(value) <= cadenceSeconds * 3000 && Date.parse(value) <= now + 5000;
  return {independent, watcherFresh: fresh(lastObservationAt), dispatcherFresh: fresh(lastDispatcherAt), promotionEligible: independent && fresh(lastObservationAt) && fresh(lastDispatcherAt)};
}

export function retryDecision({attempt, failureClass, retryAfterSeconds = 0}) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= 3 || ['authentication', 'invalid_payload', 'policy_denied', 'unknown_outcome'].includes(failureClass)) return {retry: false, delaySeconds: null};
  return {retry: true, delaySeconds: Math.max([30, 120, 600][attempt - 1], Math.min(86400, Math.max(0, retryAfterSeconds)))};
}
