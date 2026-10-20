import {discoverSkills} from '../federation.mjs';
import {authenticateRequest, readBoundedText} from '../security/auth.mjs';
import {sha256} from '../registry/identity.mjs';

export const HEALTH_PROVIDERS = ['skillsmp', 'skills_sh', 'anthropic'];
export const SAFE_PROBE_JOBS = ['gateway_probe', 'private_probe', 'scheduler_probe', 'release_probe', 'watcher_probe', 'cache_cleanup', 'provider_probe'];

export async function probeComponents(job, {store, env, profile, now = Date.now, fetchImpl = fetch, oidcToken = '', bundledReady}) {
  const at = now();
  const sample = (component, status, failureClass = null) => ({component, status, failureClass});
  const fresh = (timestamp, cadence) => Number.isFinite(Date.parse(timestamp)) && at - Date.parse(timestamp) <= cadence * 3000 && Date.parse(timestamp) <= at + 5000;
  if (job.jobType === 'cache_cleanup') return {observations: [], detail: await store.safeHousekeeping(job.lease)};
  if (job.jobType === 'scheduler_probe') return {observations: [sample('scheduler', fresh(profile.last_dispatcher_at, profile.cadence_seconds) ? 'HEALTHY' : 'UNKNOWN', fresh(profile.last_dispatcher_at, profile.cadence_seconds) ? null : 'scheduler_stale')]};
  if (job.jobType === 'watcher_probe') {
    const configured = profile.watcher_verified_at && profile.watcher_principal_id && profile.watcher_evidence_ref && profile.watcher_failure_domain && profile.watcher_failure_domain !== profile.failure_domain;
    const healthy = configured && fresh(profile.last_watcher_at, profile.watcher_cadence_seconds || profile.cadence_seconds);
    return {observations: [sample('watcher_deadman', healthy ? 'HEALTHY' : 'UNKNOWN', healthy ? null : configured ? 'watcher_stale' : 'watcher_not_configured')]};
  }
  if (job.jobType === 'provider_probe') {
    const provider = job.targetIdentity.slice('provider:'.length);
    if (!HEALTH_PROVIDERS.includes(provider)) throw new Error('provider_policy_denied');
    if (provider === 'skills_sh' && !oidcToken) return {observations: [sample(`provider:${provider}`, 'UNKNOWN', 'provider_not_configured')]};
    const budget = await store.rpc('claim_federation_budget', {p_subject: sha256(`health:${store.workspaceId}:${provider}`), p_authenticated: true});
    if (!budget?.allowed) return {observations: [sample(`provider:${provider}`, 'DEGRADED', 'provider_quota')], retryAfterSeconds: budget?.retry_after || 60};
    let retryAfterSeconds = 0;
    const result = await discoverSkills('accessibility', {providers: [provider], limit: 1, timeoutMs: 3000, oidcToken, fetcher: async (...args) => {
      const response = await fetchImpl(...args);
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        retryAfterSeconds = Math.max(retryAfterSeconds, Number.isFinite(Number(header)) ? Math.max(0, Number(header)) : Math.max(0, Math.ceil((Date.parse(header) - now()) / 1000)) || 0);
        await response.body?.cancel();
      }
      return response;
    }});
    const state = result.providers[provider];
    return {observations: [sample(`provider:${provider}`, state?.status === 'ok' ? 'HEALTHY' : state?.status === 'not_configured' ? 'UNKNOWN' : 'DEGRADED', state?.status === 'ok' ? null : state?.status === 'rate_limited' ? 'provider_429' : state?.reason === 'AUTH_REQUIRED' ? 'provider_authentication' : state?.status === 'not_configured' ? 'provider_not_configured' : state?.reason?.includes('TIMEOUT') ? 'provider_timeout' : 'provider_catalog')], retryAfterSeconds, failureClass: state?.reason === 'AUTH_REQUIRED' ? 'authentication' : null};
  }
  if (job.jobType === 'gateway_probe') {
    const observations = [sample('bundled_catalog', bundledReady ? 'HEALTHY' : 'UNHEALTHY', bundledReady ? null : 'bundled_integrity')];
    let origin;
    try { origin = new URL(env.SOREN_GATEWAY_ORIGIN); } catch { return {observations: [...observations, sample('gateway', 'UNKNOWN', 'gateway_not_configured')]}; }
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return {observations: [...observations, sample('gateway', 'UNKNOWN', 'gateway_not_configured')]};
    try {
      const response = await fetchImpl(`${origin.origin}/api/health/live`, {signal: AbortSignal.timeout(3000), redirect: 'error', cache: 'no-store'});
      const value = JSON.parse(await readBoundedText(response, 4096));
      const healthy = response.ok && value.status === 'live';
      observations.push(sample('gateway', healthy ? 'HEALTHY' : 'UNHEALTHY', healthy ? null : 'gateway_availability'));
    } catch { observations.push(sample('gateway', 'UNKNOWN', 'gateway_network_unknown')); }
    return {observations};
  }
  const state = await store.getOperationsProbeState(env.SOREN_UPDATE_PROJECT_ID || null, env.SOREN_UPDATE_ENVIRONMENT || 'production');
  if (job.jobType === 'release_probe') {
    if (!state.policy) return {observations: [sample('release_controller', 'UNKNOWN', 'release_not_configured')]};
    const policy = state.policy;
    const expired = policy.mode === 'armed' && (!Number.isFinite(Date.parse(policy.arming?.expiresAt)) || Date.parse(policy.arming.expiresAt) <= at);
    const pendingStale = state.oldestPendingOperationAt && !fresh(state.oldestPendingOperationAt, profile.cadence_seconds);
    return {observations: [sample('release_controller', !['paused', 'observe', 'armed'].includes(policy.mode) || expired ? 'UNHEALTHY' : pendingStale ? 'DEGRADED' : 'HEALTHY', expired ? 'arming_expired' : pendingStale ? 'release_outcome_unknown' : ['paused', 'observe', 'armed'].includes(policy.mode) ? null : 'release_policy_invalid')], detail: {mode: policy.mode, lastControllerEventAt: state.lastControllerEventAt || null}};
  }
  if (job.jobType !== 'private_probe') throw new Error('job_policy_denied');
  const observations = [sample('private_database', state.databaseAvailable ? 'HEALTHY' : 'UNHEALTHY', state.databaseAvailable ? null : 'private_workspace_unavailable')];
  try {
    const origin = new URL(env.SUPABASE_URL);
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password) throw new Error();
    const response = await fetchImpl(`${origin.origin}/auth/v1/health`, {headers: {apikey: env.SUPABASE_ANON_KEY || ''}, signal: AbortSignal.timeout(3000), redirect: 'error', cache: 'no-store'});
    await response.body?.cancel();
    observations.push(sample('private_auth_service', response.ok ? 'HEALTHY' : 'UNHEALTHY', response.ok ? null : 'private_auth_unavailable'));
  } catch { observations.push(sample('private_auth_service', 'UNKNOWN', 'private_auth_unavailable')); }
  if (!env.SOREN_AUTH_PROBE_TOKEN) observations.push(sample('private_auth', 'UNKNOWN', 'private_auth_unverified'));
  else {
    try {
      await authenticateRequest(new Request(env.SOREN_AUTH_RESOURCE, {headers: {Authorization: `Bearer ${env.SOREN_AUTH_PROBE_TOKEN}`}}), {env, store, fetchImpl, permission: 'health:read', now: at});
      observations.push(sample('private_auth', 'HEALTHY'));
    } catch { observations.push(sample('private_auth', 'UNHEALTHY', 'authentication')); }
  }
  return {observations};
}
