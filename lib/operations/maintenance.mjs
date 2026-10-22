import {randomUUID} from 'node:crypto';
import {SKILLS, readSkill, routeTask} from '../catalog.mjs';
import {sha256} from '../registry/identity.mjs';
import {HttpError} from '../security/auth.mjs';
import {HEALTH_PROVIDERS, SAFE_PROBE_JOBS, probeComponents} from './probes.mjs';

const ORIGINAL_SKILLS = ['accessibility', 'motion-systems', 'mcp-integration', 'skill-orchestration'];

/** Integrity of the bundled catalog: the original skills are present, names are unique and every SKILL.md is readable. */
export function bundledReadiness() {
  const names = SKILLS.map(skill => skill.name);
  return ORIGINAL_SKILLS.every(name => names.includes(name)) && new Set(names).size === names.length
    && SKILLS.every(skill => skill.uri === `skill://${skill.name}/SKILL.md` && typeof readSkill(skill.name) === 'string')
    && routeTask('accessibility keyboard screen reader').primary?.name === 'accessibility';
}

export async function runMaintenance({store, env = process.env, now = () => Date.now(), owner = randomUUID(), fetchImpl = fetch, oidcToken = ''}) {
  const started = now();
  const step = callback => {
    if (now() - started >= 35000) throw new HttpError(503, 'maintenance_budget_exhausted');
    return callback();
  };
  const profile = await step(() => store.getSchedulerProfile());
  if (!profile || !['frequent', 'budget'].includes(profile.profile) || !Number.isInteger(profile.cadence_seconds)
    || profile.cadence_seconds < 300 || !profile.entitlement_evidence_ref || !profile.consent_at) throw new HttpError(503, 'schedule_not_authorized');
  const lease = await step(() => store.acquireLease('dispatcher', owner, 120));
  if (!lease) return {status: 'overlap', completed: 0};
  const slot = new Date(Math.floor(started / (profile.cadence_seconds * 1000)) * profile.cadence_seconds * 1000).toISOString();
  const environment = env.SOREN_ENVIRONMENT || 'development';
  if (!/^[\w.-]{1,80}$/.test(environment)) throw new HttpError(503, 'environment_configuration_invalid');
  let completed = 0; const results = [];
  const due = await step(() => store.listDueJobs(4, environment));
  const work = due.map(job => ({jobType: job.job_type, environment: job.environment, scheduledSlot: job.scheduled_slot, targetIdentity: job.target_identity, intentKey: job.intent_key, payloadSha256: job.payload_sha256}));
  for (const jobType of SAFE_PROBE_JOBS) {
    const cadence = jobType === 'provider_probe' ? Math.max(1800, profile.cadence_seconds) : jobType === 'watcher_probe' ? Math.max(profile.watcher_cadence_seconds || profile.cadence_seconds, profile.cadence_seconds) : profile.cadence_seconds;
    const scheduledSlot = new Date(Math.floor(started / (cadence * 1000)) * cadence * 1000).toISOString();
    const targetIdentity = jobType === 'provider_probe' ? `provider:${HEALTH_PROVIDERS[Math.floor(started / (cadence * 1000)) % HEALTH_PROVIDERS.length]}` : 'local_control_plane';
    const payload = {jobType, environment, slot: scheduledSlot, targetIdentity};
    const intentKey = `${jobType}:${environment}:${scheduledSlot}:${targetIdentity}`;
    if (!work.some(item => item.intentKey === intentKey)) work.push({jobType, environment, scheduledSlot, targetIdentity, intentKey, payloadSha256: sha256(JSON.stringify(payload))});
  }
  // Only built-in, read-only probes and expiration of bounded public metadata are dispatchable.
  for (const job of work) {
    if (now() - started >= 35000) break;
    const {jobType} = job;
    if (!SAFE_PROBE_JOBS.includes(jobType) || job.environment !== environment || (jobType === 'provider_probe' ? !HEALTH_PROVIDERS.some(provider => job.targetIdentity === `provider:${provider}`) : job.targetIdentity !== 'local_control_plane')) throw new HttpError(503, 'job_policy_denied');
    await step(() => store.assertLease(lease));
    const claim = await step(() => store.claimJob({...job, owner}));
    if (!claim.claimed) { results.push({jobType, status: claim.state}); continue; }
    try {
      await step(() => store.assertLease(claim.lease));
      const cadence = jobType === 'provider_probe' ? Math.max(1800, profile.cadence_seconds) : jobType === 'watcher_probe' ? Math.max(profile.watcher_cadence_seconds || profile.cadence_seconds, profile.cadence_seconds) : profile.cadence_seconds;
      if (started - Date.parse(job.scheduledSlot) > cadence * 3000) {
        await step(() => store.finishJob(claim, {success: false, resultIdentity: null, failureClass: 'invalid_payload'}));
        results.push({jobType, status: 'stale_slot'}); continue;
      }
      const probeStarted = now();
      const result = await step(() => probeComponents({...job, lease: claim.lease}, {store, env, profile, now, fetchImpl, oidcToken, bundledReady: bundledReadiness()}));
      for (const observation of result.observations) await step(() => store.recordObservation({...observation, environment, observedAt: new Date(now()).toISOString(), scheduledSlot: job.scheduledSlot, latencyMs: Math.min(45000, Math.max(0, now() - probeStarted)), probeIdentity: owner, sourceRevision: /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA || '') ? env.VERCEL_GIT_COMMIT_SHA : null, evidenceRefs: [`job:${claim.jobId}`]}, claim.lease));
      await step(() => store.assertLease(claim.lease));
      const success = result.observations.every(item => !['UNHEALTHY', 'DEGRADED'].includes(item.status));
      await step(() => store.finishJob(claim, {success, resultIdentity: sha256(JSON.stringify(result)), failureClass: success ? null : result.failureClass || result.observations.find(item => ['UNHEALTHY', 'DEGRADED'].includes(item.status))?.failureClass || 'probe_failure', retryAfterSeconds: result.retryAfterSeconds || 0}));
      results.push({jobType, status: success ? 'succeeded' : 'failed'}); completed++;
    } catch (error) {
      // A stale lease or uncertain persistence result is reconciled by the next claim; never fabricate completion.
      if (error instanceof HttpError && (error.status === 409 || error.code === 'maintenance_budget_exhausted')) throw error;
      await step(() => store.finishJob(claim, {success: false, resultIdentity: null, failureClass: 'private_database'}));
      throw new HttpError(503, 'maintenance_incomplete');
    }
  }
  await step(() => store.assertLease(lease));
  await step(() => store.recordDispatcherHeartbeat(lease));
  return {status: 'completed', completed, scheduledSlot: slot, results};
}
