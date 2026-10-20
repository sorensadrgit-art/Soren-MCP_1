import {HttpError, requireConfiguration, readBoundedText} from '../security/auth.mjs';
import {isDigest, isUuid, verifyPrivateFile, sha256, canonicalJson} from '../registry/identity.mjs';
import {validateObservation} from './health.mjs';

export function createSupabaseStore({env = process.env, fetchImpl = fetch, credentialName = 'SUPABASE_SERVICE_ROLE_KEY', apiKeyName = credentialName, gatewayOnly = false} = {}) {
  requireConfiguration(env, ['SUPABASE_URL', credentialName, apiKeyName, 'SOREN_WORKSPACE_ID']);
  let origin;
  try { origin = new URL(env.SUPABASE_URL); } catch { throw new HttpError(503, 'private_configuration_unavailable'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || !isUuid(env.SOREN_WORKSPACE_ID)) throw new HttpError(503, 'private_configuration_unavailable');
  const workspaceId = env.SOREN_WORKSPACE_ID;
  const rpc = async (name, args = {}) => {
    if (!/^[a-z][a-z0-9_]{0,80}$/.test(name)) throw new Error('invalid_rpc_name');
    if (gatewayOnly && !['get_principal_context', 'read_private_version', 'claim_federation_budget', 'get_federation_cache', 'put_federation_cache'].includes(name)) throw new HttpError(403, 'operation_denied');
    let response;
    try {
      response = await fetchImpl(`${origin.origin}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: {'Content-Type': 'application/json', apikey: env[apiKeyName], Authorization: `Bearer ${env[credentialName]}`},
        body: JSON.stringify(args), signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
      });
      const raw = await readBoundedText(response, (name === 'get_review_details' ? 6 : 3) * 1024 * 1024, 'private_store_response_invalid');
      const result = raw ? JSON.parse(raw) : null;
      if (!response.ok) {
        if (result?.code === '42501') throw new HttpError(403, 'operation_denied');
        if (['23514', '40001', '23505'].includes(result?.code)) throw new HttpError(409, 'state_conflict');
        throw new HttpError(503, 'private_store_unavailable');
      }
      return result;
    } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, 'private_store_unavailable'); }
  };
  const workspaceArgs = args => ({p_workspace_id: workspaceId, ...args});
  return {
    workspaceId, rpc,
    getPrincipalContext: ({issuer, subject, clientId, workspaceId: requestedWorkspace}) => {
      if (requestedWorkspace !== workspaceId) throw new HttpError(403, 'workspace_access_denied');
      return rpc('get_principal_context', workspaceArgs({p_issuer: issuer, p_subject: subject, p_client_id: clientId}));
    },
    acquireLease: (key, owner, ttlSeconds = 120) => rpc('acquire_lease', workspaceArgs({p_key: key, p_owner: owner, p_ttl_seconds: ttlSeconds})),
    renewLease: (lease, ttlSeconds = 120) => rpc('renew_lease', workspaceArgs({p_key: lease.key, p_owner: lease.owner, p_fence: lease.fence, p_ttl_seconds: ttlSeconds})),
    assertLease: lease => rpc('assert_lease', workspaceArgs({p_key: lease.key, p_owner: lease.owner, p_fence: lease.fence})),
    claimJob: ({intentKey, payloadSha256, jobType, scheduledSlot, targetIdentity, owner, environment = env.SOREN_ENVIRONMENT || 'development'}) => {
      if (!isDigest(payloadSha256)) throw new HttpError(400, 'invalid_job');
      return rpc('claim_job', workspaceArgs({p_intent_key: intentKey, p_payload_sha256: payloadSha256, p_job_type: jobType, p_scheduled_slot: scheduledSlot, p_target_identity: targetIdentity, p_owner: owner, p_environment: environment}));
    },
    finishJob: (claim, {success, resultIdentity, failureClass = null, retryAfterSeconds = 0}) => rpc('finish_job', workspaceArgs({p_job_id: claim.jobId, p_owner: claim.lease.owner, p_fence: claim.lease.fence, p_success: success, p_result_identity: resultIdentity, p_failure_class: failureClass, p_retry_after_seconds: retryAfterSeconds})),
    recordObservation: (observation, lease) => rpc('record_health_observation', workspaceArgs({p_observation: validateObservation(observation), p_lease_key: lease.key, p_owner: lease.owner, p_fence: lease.fence})),
    getHealthSnapshot: () => rpc('get_health_snapshot', workspaceArgs({})),
    getWorkspaceStatus: actorId => rpc('get_workspace_status', workspaceArgs({p_actor_id: actorId})),
    getReviewDetails: async (context, versionId) => {
      const details = await rpc('get_review_details', workspaceArgs({p_actor_id: context.subjectId, p_version_id: versionId}));
      const verified = record => record == null ? null : ({...record, files: record.manifest.files.map(file => ({...verifyPrivateFile(record, file.path, record.manifestSha256), byteCount: file.byteCount}))});
      return {candidate: verified(details.candidate), previous: verified(details.previous)};
    },
    getSchedulerProfile: () => rpc('get_scheduler_profile', workspaceArgs({})),
    getOperationsProbeState: (projectId, environment) => rpc('get_operations_probe_state', workspaceArgs({p_project_id: projectId, p_environment: environment})),
    recordWatcherReceipt: (context, receipt) => rpc('record_watcher_receipt', workspaceArgs({p_actor_id: context.subjectId, p_client_id: context.clientId, p_receipt: receipt, p_payload_sha256: sha256(canonicalJson(receipt))})),
    listDueJobs: (limit = 4, environment = env.SOREN_ENVIRONMENT || 'development') => rpc('list_due_jobs', workspaceArgs({p_limit: limit, p_environment: environment})),
    recordDispatcherHeartbeat: lease => rpc('record_dispatcher_heartbeat', workspaceArgs({p_key: lease.key, p_owner: lease.owner, p_fence: lease.fence})),
    safeHousekeeping: lease => rpc('safe_housekeeping', workspaceArgs({p_key: lease.key, p_owner: lease.owner, p_fence: lease.fence})),
    stageVersion: (context, version) => rpc('stage_skill_version', workspaceArgs({p_actor_id: context.subjectId, p_manifest: version.manifest, p_manifest_sha256: version.manifestSha256, p_files: version.files})),
    reviewVersion: (context, review) => rpc('review_skill_version', workspaceArgs({p_actor_id: context.subjectId, p_version_id: review.versionId, p_manifest_sha256: review.manifestSha256, p_decision: review.decision, p_expected_revision: review.expectedReviewRevision, p_policy_sha256: review.policySha256, p_evidence_ref: review.evidenceRef})),
    revokeVersion: (context, {versionId, reason}) => rpc('revoke_skill_version', workspaceArgs({p_actor_id: context.subjectId, p_version_id: versionId, p_reason: reason})),
    publishCatalog: (context, {versionIds, expectedGeneration}) => rpc('publish_catalog', workspaceArgs({p_actor_id: context.subjectId, p_version_ids: versionIds, p_expected_generation: expectedGeneration})),
    readPrivateVersion: async (context, {versionId, manifestSha256, path = 'SKILL.md'}) => {
      if (context.workspaceId !== workspaceId || !isUuid(versionId) || !isDigest(manifestSha256)) throw new HttpError(403, 'version_not_available');
      // Deliberately no private cache: every retrieval rechecks grants, approvals, generation and monotonic revocations.
      const record = await rpc('read_private_version', workspaceArgs({p_principal_id: context.subjectId, p_version_id: versionId, p_manifest_sha256: manifestSha256}));
      return verifyPrivateFile(record, path, manifestSha256);
    },
    setGrant: (context, grant) => rpc('set_grant', workspaceArgs({p_actor_id: context.subjectId, p_principal_id: grant.principalId, p_operations: grant.operations, p_expires_at: grant.expiresAt})),
    revokeGrant: (context, grant) => rpc('revoke_grant', workspaceArgs({p_actor_id: context.subjectId, p_grant_id: grant.grantId, p_expected_revision: grant.expectedRevision})),
  };
}

export const getOperationsStore = (env = process.env) => createSupabaseStore({env});
export function createGatewayStore({env = process.env, fetchImpl = fetch} = {}) {
  const store = createSupabaseStore({env, fetchImpl, credentialName: 'SOREN_GATEWAY_DB_KEY', apiKeyName: 'SUPABASE_ANON_KEY', gatewayOnly: true});
  return {workspaceId: store.workspaceId, rpc: store.rpc, getPrincipalContext: store.getPrincipalContext, readPrivateVersion: store.readPrivateVersion};
}
export const getGatewayStore = (env = process.env) => createGatewayStore({env});
