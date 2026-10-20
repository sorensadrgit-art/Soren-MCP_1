import { readFile } from 'node:fs/promises';
import { authenticateRequest, errorResponse, HttpError, readJsonBody } from '../security/auth.mjs';
import { getOperationsStore } from '../operations/store.mjs';
import { armPolicy, effectiveMode, initialPolicy, pausePolicy, sha256, UpdateDenied } from './policy.mjs';
import { createUpdateStore } from './store.mjs';

export function createUpdateAdmin({ env = process.env, operations, authenticate = authenticateRequest, readPolicyBytes = () => readFile(new URL('../../config/operating-policy.json', import.meta.url)), now = Date.now } = {}) {
  return async function handle(request, action = 'status') {
    try {
      const backend = operations ?? getOperationsStore(env);
      const actor = await authenticate(request, { env, store: backend, permission: `updates:${action === 'status' ? 'read' : action}`, human: true, owner: action !== 'status' });
      const projectId = env.SOREN_RELEASE_PROJECT_ID;
      const environment = env.SOREN_RELEASE_ENVIRONMENT;
      if (!projectId || environment !== 'production') throw new HttpError(503, 'release_scope_unconfigured');
      const bytes = await readPolicyBytes();
      const policySha256 = sha256(bytes);
      const store = createUpdateStore(backend, actor.workspaceId);
      const persisted = await store.readPolicy({ projectId, environment });
      const policy = persisted ?? initialPolicy({ projectId, environment, policySha256 });
      if (policy.policySha256 !== policySha256) throw new HttpError(409, 'policy_bytes_changed_owner_review_required');
      let updated = policy;
      if (action === 'pause') {
        const body = await readJsonBody(request);
        if (Object.keys(body).some(key => !['expectedGeneration', 'policySha256', 'projectId', 'environment'].includes(key))) throw new HttpError(400, 'unknown_update_field');
        if (body.projectId !== projectId || body.environment !== environment) throw new HttpError(409, 'scope_changed');
        if (body.expectedGeneration !== policy.generation || body.policySha256 !== policy.policySha256) throw new HttpError(409, 'policy_changed');
        updated = pausePolicy(policy, actor, now());
        await store.changePolicy(policy, updated, actor);
      } else if (action === 'arm') {
        const body = await readJsonBody(request);
        if (Object.keys(body).some(key => !['expectedGeneration', 'policySha256', 'projectId', 'environment', 'channel', 'lane', 'expiresAt', 'rehearsalIds', 'entitlementEvidenceId', 'trustEvidenceId', 'watcherEvidenceId', 'providerCapabilityEvidenceId'].includes(key))) throw new HttpError(400, 'unknown_update_field');
        if (body.projectId !== projectId || body.environment !== environment) throw new HttpError(409, 'scope_changed');
        if (!Array.isArray(body.rehearsalIds) || body.rehearsalIds.length > 10 || body.rehearsalIds.some(id => typeof id !== 'string')) throw new HttpError(400, 'rehearsal_ids_required');
        const ids = [...body.rehearsalIds, body.entitlementEvidenceId, body.trustEvidenceId, body.watcherEvidenceId, body.providerCapabilityEvidenceId];
        if (ids.some(id => typeof id !== 'string' || !id)) throw new HttpError(400, 'activation_evidence_ids_required');
        const evidence = await store.readActivationEvidence(ids);
        for (const [kind, id] of [['entitlement', body.entitlementEvidenceId], ['trust', body.trustEvidenceId], ['watcher', body.watcherEvidenceId], ['provider_atomic_cas', body.providerCapabilityEvidenceId]]) {
          if (!evidence.some(row => row.id === id && row.kind === kind && row.status === 'PASS' && row.policySha256 === policySha256 && row.projectId === projectId && row.environment === environment && row.evidenceRef && Date.parse(row.expiresAt) > now() && Date.parse(row.verifiedAt) <= now() && (kind !== 'provider_atomic_cas' || row.observed?.atomicCompareAndSwap === true))) throw new HttpError(409, `activation_evidence_missing:${kind}`);
        }
        updated = armPolicy(policy, body, actor, evidence.filter(row => body.rehearsalIds.includes(row.id)), now());
        await store.changePolicy(policy, updated, actor);
      } else if (action !== 'status') throw new HttpError(404, 'unknown_update_action');
      return Response.json({ ...updated, effectiveMode: effectiveMode(updated, now()), canArm: false, blockedReasons: ['vercel_atomic_parent_cas_unavailable', ...(updated.arming ? [] : ['owner_arming_and_verified_activation_evidence_required'])] }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof UpdateDenied) return errorResponse(new HttpError(409, error.code));
      return errorResponse(error);
    }
  };
}
