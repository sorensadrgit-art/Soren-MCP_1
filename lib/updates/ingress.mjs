import { readFile } from 'node:fs/promises';
import { authenticateRequest, errorResponse, HttpError, readJsonBody } from '../security/auth.mjs';
import { getOperationsStore } from '../operations/store.mjs';
import { initialPolicy, requireGate, sha256, time, UpdateDenied } from './policy.mjs';
import { verifyRelease } from './verification.mjs';
import { createUpdateStore } from './store.mjs';
import { createVercelProvider } from './vercel.mjs';

function fields(body, allowed) { requireGate(Object.keys(body).every(key => allowed.includes(key)), 'unknown_ingress_field'); }
const decode = (value, maximum) => { requireGate(typeof value === 'string' && value.length <= Math.ceil(maximum / 3) * 4 && /^[A-Za-z0-9+/]*={0,2}$/.test(value), 'invalid_base64_field'); const bytes = Buffer.from(value, 'base64'); requireGate(bytes.length <= maximum && bytes.toString('base64') === value, 'invalid_base64_field'); return bytes; };
const finiteInteger = value => Number.isSafeInteger(value) && value >= 0;

export function createReleaseRead({ env = process.env, operations, authenticate = authenticateRequest } = {}) {
  return async function readRelease(request) {
    try {
      const backend = operations ?? getOperationsStore(env);
      const actor = await authenticate(request, { env, store: backend, permission: 'updates:read' });
      requireGate(actor.kind === 'human' && ['owner', 'reviewer'].includes(actor.role) || actor.kind === 'observer' && env.SOREN_RELEASE_OBSERVER_CLIENT_ID && actor.clientId === env.SOREN_RELEASE_OBSERVER_CLIENT_ID, 'release_observer_identity_required');
      const query = new URL(request.url).searchParams;
      requireGate([...query.keys()].every(key => ['releaseId', 'manifestSha256', 'projectId', 'environment'].includes(key)) && /^[a-f0-9]{64}$/.test(query.get('manifestSha256') ?? '') && (query.get('releaseId') ?? '').length > 0 && query.get('releaseId').length <= 128 && query.get('projectId') === env.SOREN_RELEASE_PROJECT_ID && query.get('environment') === env.SOREN_RELEASE_ENVIRONMENT, 'release_query_scope_invalid');
      const snapshot = await createUpdateStore(backend, actor.workspaceId).snapshot({ projectId: env.SOREN_RELEASE_PROJECT_ID, environment: env.SOREN_RELEASE_ENVIRONMENT, releaseId: query.get('releaseId') });
      requireGate(snapshot && snapshot.manifestSha256 === query.get('manifestSha256'), 'release_not_available');
      const { policy, manifestSha256, artifactSha256, sourceCommit, readinessObservedAt, dependenciesReady, budgetAvailable, securityIncident, watcher, activeDeploymentId, stagedDeploymentId, schemaVersion, minimumSecureSequence, catalogGeneration, release, revokedDigests } = snapshot;
      return Response.json({ policy: { mode: policy.mode, generation: policy.generation, policySha256: policy.policySha256, projectId: policy.projectId, environment: policy.environment }, manifestSha256, artifactSha256, sourceCommit, readinessObservedAt, dependenciesReady, budgetAvailable, securityIncident, watcher, activeDeploymentId, stagedDeploymentId, schemaVersion, minimumSecureSequence, catalogGeneration, release, revokedDigests }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return errorResponse(error instanceof UpdateDenied ? new HttpError(403, error.code) : error); }
  };
}

export function createReleaseIngress({ env = process.env, operations, authenticate = authenticateRequest, verify = verifyRelease, providerFactory = createVercelProvider, read = readFile, now = Date.now } = {}) {
  async function verifyCandidate(candidate, full = false) {
    fields(candidate, ['manifest', 'bundle', 'evidence', 'lockfile']);
    const manifestBytes = decode(candidate.manifest, 65_536), bundleBytes = decode(candidate.bundle, 262_144), evidenceBytes = decode(candidate.evidence ?? 'W10=', 262_144);
    const lockfileBytes = decode(candidate.lockfile, 1_048_576);
    const policyBytes = await read(new URL('../../config/operating-policy.json', import.meta.url));
    requireGate(env.SOREN_RELEASE_TRUST_JSON, 'server_signing_trust_unconfigured');
    const trust = JSON.parse(env.SOREN_RELEASE_TRUST_JSON);
    const input = { manifestBytes, bundleBytes, evidenceBytes, evidence: JSON.parse(evidenceBytes), lockfileBytes, policyBytes, trust, evidenceRequired: full, metadataOnly: true, now: now() };
    const verified = await verify(input);
    requireGate(verified.manifest.projectId === env.SOREN_RELEASE_PROJECT_ID && verified.manifest.environment === env.SOREN_RELEASE_ENVIRONMENT && verified.manifest.environment === 'production', 'release_scope_changed');
    return { verified, input, policyBytes };
  }
  return async function handle(request, action = 'register') {
    try {
      const backend = operations ?? getOperationsStore(env);
      const runner = action === 'evidence';
      const actor = await authenticate(request, { env, store: backend, permission: runner ? 'updates:evidence' : 'updates:promote', human: !runner, owner: !runner });
      const body = await readJsonBody(request, 3_000_000);
      const store = createUpdateStore(backend, actor.workspaceId);
      let result;
      if (action === 'register') {
        fields(body, ['candidate', 'analysis', 'confirmSourceReview', 'expectedGeneration', 'releaseSequence', 'schemaVersion', 'minimumSecureSequence', 'stageExpiresAt', 'stagedDeploymentId']);
        requireGate(body.confirmSourceReview === true && body.analysis && typeof body.analysis === 'object' && !Array.isArray(body.analysis) && [body.expectedGeneration, body.releaseSequence, body.schemaVersion, body.minimumSecureSequence].every(finiteInteger), 'exact_owner_review_required');
        requireGate(time(body.stageExpiresAt) > now() && time(body.stageExpiresAt) <= now() + 15 * 60_000, 'authorization_expiry_invalid');
        const { verified, input, policyBytes } = await verifyCandidate(body.candidate);
        const { manifest, manifestSha256 } = verified;
        const provider = providerFactory({ env, manifest });
        requireGate(await provider.activeDeployment() === manifest.expectedParentDeploymentId, 'parent_deployment_changed');
        if (body.stagedDeploymentId) {
          const staged = await provider.inspectDeploymentMetadata(body.stagedDeploymentId);
          requireGate(staged.artifactSha256 === manifest.artifactSha256 && staged.productionConfiguration === true && staged.productionDomainsAssigned === false, 'staged_artifact_binding_invalid');
        }
        const policy = await store.readPolicy(manifest) ?? initialPolicy({ ...manifest, policySha256: sha256(policyBytes) });
        requireGate(policy.generation === body.expectedGeneration && policy.policySha256 === manifest.policySha256, 'policy_changed');
        const snapshot = {
          candidate: { ...body.analysis, lane: 'application', sourceReviewed: true, reviewedManifestSha256: manifestSha256 },
          approvals: manifest.approvalIds.map(id => ({ id, decision: 'approved', isHuman: true, ownerId: actor.subjectId, manifestSha256, sourceCommit: manifest.sourceCommit, artifactSha256: manifest.artifactSha256, policySha256: manifest.policySha256 })),
          stageAuthorization: { ownerId: actor.subjectId, isHuman: true, manifestSha256, expiresAt: body.stageExpiresAt },
          activeDeploymentId: manifest.expectedParentDeploymentId, stagedDeploymentId: body.stagedDeploymentId ?? null,
          releaseSequence: body.releaseSequence, schemaVersion: body.schemaVersion, minimumSecureSequence: body.minimumSecureSequence,
          catalogGeneration: manifest.catalogGeneration, dependenciesReady: false, budgetAvailable: false, securityIncident: true, watcher: { status: 'UNKNOWN' },
          identity: { ...verified.identity, verifiedAt: verified.verifiedAt },
        };
        result = await store.registerRelease({ manifest, manifestSha256, snapshot, state: body.stagedDeploymentId ? 'STAGED' : 'BUILT' }, policy, actor, body.expectedGeneration);
      } else if (action === 'authorize') {
        fields(body, ['releaseId', 'manifestSha256', 'projectId', 'environment', 'expectedGeneration', 'phase', 'expiresAt', 'capabilityEvidenceRef']);
        requireGate(body.projectId === env.SOREN_RELEASE_PROJECT_ID && body.environment === env.SOREN_RELEASE_ENVIRONMENT && ['stage', 'manual_promotion', 'manual_rollback'].includes(body.phase) && time(body.expiresAt) > now() && time(body.expiresAt) <= now() + 15 * 60_000 && finiteInteger(body.expectedGeneration), 'authorization_scope_or_expiry_invalid');
        requireGate(body.phase === 'stage' || typeof body.capabilityEvidenceRef === 'string' && body.capabilityEvidenceRef, 'capability_review_required');
        result = await store.authorizeRelease(body, actor);
      } else if (action === 'evidence') {
        fields(body, ['releaseId', 'manifestSha256', 'artifactSha256', 'projectId', 'environment', 'kind', 'observation', 'candidate']);
        const originalPayloadSha256 = sha256(JSON.stringify(body));
        requireGate(body.projectId === env.SOREN_RELEASE_PROJECT_ID && body.environment === env.SOREN_RELEASE_ENVIRONMENT && /^[a-f0-9]{64}$/.test(body.manifestSha256 ?? '') && /^[a-f0-9]{64}$/.test(body.artifactSha256 ?? '') && body.observation && typeof body.observation === 'object' && !Array.isArray(body.observation), 'evidence_scope_invalid');
        const independent = body.kind === 'independent_probe' || body.kind === 'activation' && body.observation.kind === 'watcher';
        const expectedClient = independent ? env.SOREN_WATCHER_CLIENT_ID : env.SOREN_RELEASE_RUNNER_CLIENT_ID;
        const expectedKind = independent ? 'observer' : 'release_controller';
        requireGate(expectedClient && actor.clientId === expectedClient && actor.kind === expectedKind, 'fixed_runner_identity_required');
        requireGate(time(body.observation.observedAt) <= now() && time(body.observation.observedAt) >= now() - 60_000 && typeof body.observation.evidenceRef === 'string' && body.observation.evidenceRef.length > 0 && body.observation.evidenceRef.length <= 512, 'fresh_probe_evidence_required');
        requireGate(['readiness', 'verification', 'candidate_probe', 'control_probe', 'independent_probe', 'activation'].includes(body.kind), 'unsupported_evidence_kind');
        if (body.kind === 'verification') {
          const { verified } = await verifyCandidate(body.candidate, true);
          requireGate(verified.manifestSha256 === body.manifestSha256 && verified.artifactSha256 === body.artifactSha256 && verified.manifest.releaseId === body.releaseId, 'verification_receipt_identity_mismatch');
          body.observation = { observedAt: new Date(now()).toISOString(), evidenceRef: body.observation.evidenceRef, status: 'PASS', artifactSha256: verified.artifactSha256, manifestSha256: verified.manifestSha256, fullEvidenceFinishedAt: verified.evidence.filter(row => row.testId !== 'final-smoke').map(row => row.finishedAt).sort()[0], finalSmokeAt: verified.evidence.find(row => row.testId === 'final-smoke').finishedAt };
        } else if (body.kind === 'activation') {
          requireGate(['pause', 'unknown_outcome', 'rollback', 'entitlement', 'trust', 'watcher', 'provider_atomic_cas'].includes(body.observation.kind) && ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(body.observation.status), 'activation_kind_invalid');
          requireGate(body.observation.kind !== 'provider_atomic_cas' || body.observation.status !== 'PASS', 'vercel_atomic_parent_cas_unavailable');
        } else if (body.kind === 'readiness') {
          requireGate(['dependenciesReady', 'budgetAvailable', 'securityIncident'].every(key => typeof body.observation[key] === 'boolean'), 'readiness_observation_invalid');
        } else {
          requireGate(['PASS', 'FAIL'].includes(body.observation.status) && typeof body.observation.deploymentId === 'string' && body.observation.deploymentId && (body.observation.status === 'PASS' || ['core_contract', 'integrity', 'local_functionality', 'provider_timeout', 'provider_rate_limit'].includes(body.observation.failureClass)), 'probe_observation_invalid');
        }
        const receipt = { ...body, candidate: undefined, payloadSha256: originalPayloadSha256, observation: { ...body.observation, id: originalPayloadSha256, independent }, actorId: actor.subjectId, clientId: actor.clientId };
        result = await store.ingestEvidence(receipt, actor, expectedClient, expectedKind);
      } else throw new HttpError(404, 'unknown_release_action');
      return Response.json({ status: 'RECORDED', result, productionModified: false }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return errorResponse(error instanceof UpdateDenied ? new HttpError(409, error.code) : error); }
  };
}
