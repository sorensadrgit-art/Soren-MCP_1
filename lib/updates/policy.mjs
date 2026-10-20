import { createHash } from 'node:crypto';

export const UPDATE_LANES = Object.freeze(['catalog_metadata', 'skill_content', 'application', 'desktop_metadata']);
export const LIMITS = Object.freeze({ armingDays: 30, fullEvidenceMinutes: 60, smokeMinutes: 5, stageMinutes: 15, probationMinutes: 30, probeSeconds: 60, cooldownMinutes: 60, maxPromotionsPerDay: 1, maxArtifactBytes: 134_217_728, maxArtifactFiles: 20_000 });
export const REQUIRED_CHECKS = Object.freeze(['contracts', 'installer', 'security', 'operations', 'updates', 'protocol', 'browser']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const digestJson = value => sha256(JSON.stringify(value));
export const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;

export class UpdateDenied extends Error {
  constructor(reason) { super(reason); this.name = 'UpdateDenied'; this.code = reason; }
}
export function requireGate(condition, reason) { if (!condition) throw new UpdateDenied(reason); }

export function initialPolicy({ projectId, environment = 'production', policySha256 }) {
  return { projectId, environment, policySha256, generation: 0, mode: 'observe', arming: null, cooldownUntil: null };
}

export function effectiveMode(policy, now = Date.now()) {
  if (policy?.mode === 'paused') return 'paused';
  if (policy?.mode !== 'armed' || !policy.arming || time(policy.arming.expiresAt) <= now || !Number.isFinite(time(policy.arming.expiresAt))) return 'observe';
  return 'armed';
}

function owner(actor) { requireGate(actor?.isHuman === true && actor.role === 'owner' && actor.subjectId, 'human_owner_required'); }
export function pausePolicy(policy, actor, now = Date.now()) {
  owner(actor);
  return { ...policy, generation: policy.generation + 1, mode: 'paused', arming: null, changedBy: actor.subjectId, changedAt: new Date(now).toISOString() };
}

export function armPolicy(policy, request, actor, rehearsals, now = Date.now()) {
  owner(actor);
  requireGate(request.expectedGeneration === policy.generation && request.policySha256 === policy.policySha256, 'policy_changed');
  requireGate(request.projectId === policy.projectId && request.environment === policy.environment, 'scope_changed');
  requireGate(request.channel === 'stable' && request.lane === 'application', 'arming_scope_denied');
  requireGate(time(request.expiresAt) > now && time(request.expiresAt) <= now + LIMITS.armingDays * 86_400_000, 'arming_expiry_invalid');
  for (const kind of ['pause', 'unknown_outcome', 'rollback']) {
    requireGate(rehearsals.some(row => row.kind === kind && row.status === 'PASS' && row.policySha256 === policy.policySha256 && row.projectId === policy.projectId && row.environment === policy.environment && row.evidenceRef && time(row.verifiedAt) <= now && time(row.verifiedAt) > now - 30 * 86_400_000), `rehearsal_missing:${kind}`);
  }
  requireGate(request.entitlementEvidenceId && request.trustEvidenceId && request.watcherEvidenceId && request.providerCapabilityEvidenceId, 'activation_evidence_required');
  return { ...policy, generation: policy.generation + 1, mode: 'armed', arming: { ownerId: actor.subjectId, channel: 'stable', lane: 'application', projectId: policy.projectId, environment: policy.environment, policySha256: policy.policySha256, grantedAt: new Date(now).toISOString(), expiresAt: request.expiresAt, rehearsalIds: rehearsals.map(row => row.id), entitlementEvidenceId: request.entitlementEvidenceId, trustEvidenceId: request.trustEvidenceId, watcherEvidenceId: request.watcherEvidenceId, providerCapabilityEvidenceId: request.providerCapabilityEvidenceId }, changedBy: actor.subjectId, changedAt: new Date(now).toISOString() };
}

const PROTECTED = [/^lib\/(security|updates)\//, /^lib\/client-contract\.mjs$/, /^\.github\//, /^installer\//, /^supabase\//, /^config\//, /^release\//, /^scripts\//, /^tests\//, /(^|\/)AGENTS\.md$/i, /(^|\/)SKILL\.md$/i, /(^|\/)(vercel\.json|\.env(?:\..*)?)$/];
function safePath(path) { return typeof path === 'string' && path.length > 0 && !path.includes('\\') && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..'); }
export function classifyUpdate(candidate, policy = { mode: 'observe' }, now = Date.now()) {
  requireGate(UPDATE_LANES.includes(candidate?.lane), 'unknown_update_lane');
  if (effectiveMode(policy, now) === 'paused') return { state: 'PAUSED', automatic: false, reasons: ['owner_pause'] };
  if (candidate.lane === 'catalog_metadata') return { state: 'CLASSIFIED', automatic: true, reasons: ['metadata_grants_no_approval'] };
  if (candidate.lane === 'skill_content') return { state: 'REVIEW_REQUIRED', automatic: false, reasons: ['exact_new_instruction_and_asset_review_required'] };
  if (candidate.lane === 'desktop_metadata') return { state: 'REVIEW_REQUIRED', automatic: false, reasons: ['explicit_local_or_verified_native_invocation_required'] };
  const reasons = [];
  if (candidate.channel !== 'stable' || candidate.sourceReviewed !== true || !candidate.reviewedManifestSha256) reasons.push('exact_source_review_required');
  if (!Array.isArray(candidate.changedPaths) || candidate.changedPaths.length === 0 || candidate.changedPaths.some(path => !safePath(path) || PROTECTED.some(pattern => pattern.test(path)))) reasons.push('protected_or_unknown_paths');
  for (const name of ['newPackages', 'newPublishers', 'newSources', 'newInstallScripts', 'permissionChanges', 'protocolChanges', 'databaseMigrations', 'runtimeMajorUpgrade', 'frameworkMajorUpgrade', 'scriptChanges', 'resourceIncrease', 'billingIncrease', 'environmentChanges', 'targetChanges', 'scheduleChanges', 'trustChanges', 'testThresholdChanges', 'allowlistChanges']) {
    if (candidate[name] !== false) reasons.push(`review_required:${name}`);
  }
  return { state: reasons.length ? 'REVIEW_REQUIRED' : 'ELIGIBLE', automatic: reasons.length === 0 && effectiveMode(policy, now) === 'armed', reasons };
}

export function assertPromotionAuthority(policy, binding, lease, now = Date.now()) {
  requireGate(effectiveMode(policy, now) === 'armed', 'updates_not_armed');
  requireGate(policy.generation === binding.policyGeneration && policy.policySha256 === binding.policySha256, 'policy_generation_changed');
  requireGate(policy.projectId === binding.projectId && policy.environment === binding.environment, 'scope_changed');
  requireGate(policy.arming.policySha256 === binding.policySha256 && policy.arming.projectId === binding.projectId && policy.arming.environment === binding.environment && policy.arming.lane === 'application' && policy.arming.channel === 'stable', 'arming_scope_changed');
  requireGate(!policy.cooldownUntil || time(policy.cooldownUntil) <= now, 'update_cooldown');
  requireGate(lease?.key === `release:${binding.projectId}:${binding.environment}` && typeof lease.owner === 'string' && Number.isSafeInteger(lease.fence) && lease.fence > 0 && time(lease.expiresAt) > now, 'lease_expired_or_wrong_scope');
}
