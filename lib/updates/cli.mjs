import { readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyUpdate, effectiveMode, initialPolicy, requireGate, sha256, UpdateDenied } from './policy.mjs';
import { verifyRelease } from './verification.mjs';
import { createReleaseController } from './controller.mjs';
import { createVercelProvider, packageBuildOutput } from './vercel.mjs';
import { getOperationsStore } from '../operations/store.mjs';
import { createUpdateStore } from './store.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function argumentsFor(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    requireGate(['--input', '--candidates', '--deployment', '--intent', '--check-readiness', '--rehearse', '--stage', '--finish-probation', '--manual', '--register', '--authorize', '--record-evidence', '--request', '--release', '--policy-generation', '--build-output', '--package-output', '--source'].includes(key) && !(key in args), 'invalid_argument');
    if (['--check-readiness', '--rehearse', '--stage', '--finish-probation', '--manual', '--register', '--authorize', '--record-evidence'].includes(key)) args[key] = true;
    else { requireGate(argv[index + 1] && !argv[index + 1].startsWith('--'), 'missing_argument'); args[key] = argv[++index]; }
  }
  return args;
}
async function boundedFile(path, maximum) {
  requireGate((await stat(path)).size <= maximum, 'input_too_large');
  const bytes = await readFile(path); requireGate(bytes.length <= maximum, 'input_too_large'); return bytes;
}
export async function loadCandidate(directory, env = process.env, { candidateLockfile = false } = {}) {
  requireGate(directory && env.SOREN_RELEASE_TRUST_FILE, 'candidate_and_owner_trust_file_required');
  const dir = resolve(directory);
  const [manifestBytes, artifact, bundleBytes, evidenceBytes, lockfileBytes, policyBytes, trustBytes] = await Promise.all([
    boundedFile(join(dir, 'manifest.json'), 65_536), boundedFile(join(dir, 'artifact.tar'), 134_217_728), boundedFile(join(dir, 'provenance.sigstore.json'), 262_144), boundedFile(join(dir, 'evidence.json'), 262_144),
    boundedFile(candidateLockfile ? join(dir, 'package-lock.json') : join(root, 'package-lock.json'), candidateLockfile ? 1_048_576 : 5_242_880), boundedFile(join(root, 'config', 'operating-policy.json'), 65_536), boundedFile(resolve(env.SOREN_RELEASE_TRUST_FILE), 65_536),
  ]);
  requireGate(!resolve(env.SOREN_RELEASE_TRUST_FILE).startsWith(`${dir}\\`) && !resolve(env.SOREN_RELEASE_TRUST_FILE).startsWith(`${dir}/`), 'candidate_cannot_supply_trust_root');
  return { manifestBytes, artifact, bundleBytes, lockfileBytes, policyBytes, evidenceBytes, evidence: JSON.parse(evidenceBytes), trust: JSON.parse(trustBytes) };
}

export function readiness(env = process.env) {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SOREN_WORKSPACE_ID', 'SOREN_RELEASE_PROJECT_ID', 'SOREN_RELEASE_TEAM_ID', 'SOREN_RELEASE_ENVIRONMENT', 'SOREN_RELEASE_TRUST_FILE', 'SOREN_PRODUCTION_DOMAINS', 'VERCEL_TOKEN'].filter(key => !env[key]);
  return { status: 'BLOCKED', mode: 'observe', productionMutationEnabled: false, automaticPromotionSupported: false, manualExactArtifactFlowImplemented: true, blockedReasons: [...missing.map(key => `missing:${key}`), 'owner_protected_environment_entitlement_and_trust_not_verified', 'vercel_atomic_parent_cas_unavailable'], scope: 'local_preflight_only' };
}

export async function runUpdateCommand(command, argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  const args = argumentsFor(argv);
  if (args['--finish-probation']) requireGate(command === 'release' && args['--input'] && Object.keys(args).every(key => ['--finish-probation', '--input', '--policy-generation'].includes(key)), 'probation_command_must_be_separate');
  if (args['--rehearse']) { requireGate(command === 'release' && Object.keys(args).length === 1, 'rehearsal_must_be_separate'); return (await import('./rehearsal.mjs')).rehearseRelease(); }
  const ingress = ['--register', '--authorize', '--record-evidence'].filter(key => args[key]);
  if (ingress.length) {
    requireGate(command === 'release' && ingress.length === 1 && args['--request'], 'ingress_request_required');
    const body = JSON.parse(await boundedFile(resolve(args['--request']), 262_144));
    const runner = ingress[0] === '--record-evidence';
    const token = runner ? env.SOREN_EVIDENCE_ACCESS_TOKEN : env.SOREN_MANAGEMENT_ACCESS_TOKEN;
    const origin = new URL(env.SOREN_ADMIN_ORIGIN ?? 'invalid:');
    requireGate(origin.protocol === 'https:' && origin.pathname === '/' && !origin.username && !origin.password && token, 'authenticated_ingress_configuration_required');
    if (ingress[0] === '--register' || runner && body.kind === 'verification') {
      const input = await (dependencies.loadCandidate ?? loadCandidate)(args['--input'], env, { candidateLockfile: true });
      body.candidate = { manifest: input.manifestBytes.toString('base64'), bundle: input.bundleBytes.toString('base64'), lockfile: input.lockfileBytes.toString('base64'), evidence: (input.evidenceBytes ?? Buffer.from(JSON.stringify(input.evidence))).toString('base64') };
    }
    const path = runner ? '/api/admin/updates/evidence' : ingress[0] === '--register' ? '/api/admin/updates/releases' : '/api/admin/updates/releases/authorize';
    const response = await (dependencies.fetchImpl ?? fetch)(new URL(path, origin), { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: origin.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30_000) });
    requireGate(response.ok, `ingress_denied:${response.status}`);
    const text = await response.text(); requireGate(Buffer.byteLength(text) <= 262_144, 'ingress_response_limit');
    return JSON.parse(text);
  }
  if (command === 'updates-check') {
    const policyBytes = await boundedFile(join(root, 'config', 'operating-policy.json'), 65_536);
    const operating = JSON.parse(policyBytes);
    const policy = initialPolicy({ projectId: env.SOREN_RELEASE_PROJECT_ID ?? 'unconfigured', policySha256: sha256(policyBytes) });
    requireGate(operating.updates.defaultMode === 'observe' && operating.activation.updaterArmedByThisPackage === false, 'unsafe_default_policy');
    const candidates = args['--candidates'] ? JSON.parse(await boundedFile(resolve(args['--candidates']), 262_144)) : [];
    requireGate(Array.isArray(candidates) && candidates.length <= 50, 'candidate_batch_limit');
    return { status: 'OBSERVE', mode: effectiveMode(policy), productionMutationEnabled: false, candidates: candidates.map(candidate => ({ lane: candidate.lane, ...classifyUpdate(candidate, policy) })) };
  }
  if (command === 'verify-release') {
    const result = await verifyRelease(await loadCandidate(args['--input'], env));
    return { status: 'IDENTITY_AND_EVIDENCE_VALIDATED', releaseId: result.manifest.releaseId, manifestSha256: result.manifestSha256, artifactSha256: result.artifactSha256, verifiedAt: result.verifiedAt, productionModified: false };
  }
  if (command === 'release' && args['--build-output']) {
    requireGate(args['--package-output'] && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(args['--source'] ?? '') && env.SOREN_RELEASE_PROJECT_ID && env.SOREN_RELEASE_TEAM_ID, 'package_binding_required');
    const artifact = await packageBuildOutput(resolve(args['--build-output']), { projectId: env.SOREN_RELEASE_PROJECT_ID, teamId: env.SOREN_RELEASE_TEAM_ID, sourceCommit: args['--source'] });
    await writeFile(resolve(args['--package-output']), artifact, { flag: 'wx', mode: 0o600 });
    return { status: 'PACKAGED', artifactSha256: sha256(artifact), bytes: artifact.length, productionModified: false };
  }
  if (args['--check-readiness'] || !args['--input']) return { ...readiness(env), command };
  requireGate(['release', 'rollback', 'reconcile-release'].includes(command), 'unknown_command');
  const input = await (dependencies.loadCandidate ?? loadCandidate)(args['--input'], env);
  const verify = dependencies.verify ?? verifyRelease;
  const verified = await verify({ ...input, evidenceRequired: false, reconciliationOnly: ['reconcile-release', 'rollback'].includes(command) || args['--finish-probation'] === true, metadataOnly: false });
  const operations = dependencies.operations ?? getOperationsStore(env);
  const store = dependencies.store ?? createUpdateStore(operations, env.SOREN_WORKSPACE_ID);
  if (command === 'reconcile-release') {
    const intent = args['--intent'] && await store.getIntent(args['--intent']);
    requireGate(intent && intent.manifestSha256 === verified.manifestSha256 && intent.artifactSha256 === verified.artifactSha256 && intent.projectId === verified.manifest.projectId && intent.environment === verified.manifest.environment, 'reconciliation_candidate_not_bound_to_intent');
  }
  const provider = dependencies.provider ?? createVercelProvider({ env, artifact: input.artifact, manifest: verified.manifest });
  const controller = createReleaseController({ store, provider, verify, ...(dependencies.clock ? { clock: dependencies.clock } : {}) });
  const lease = await operations.acquireLease(`release:${verified.manifest.projectId}:${verified.manifest.environment}`, `release-runner:${randomUUID()}`, 120);
  requireGate(lease, 'release_lease_busy');
  let renewalFailure = false;
  const renewal = setInterval(async () => {
    try { const renewed = await operations.renewLease(lease, 120); requireGate(renewed && renewed.fence === lease.fence && renewed.owner === lease.owner, 'lease_lost'); Object.assign(lease, renewed); }
    catch { renewalFailure = true; }
  }, 30_000);
  try {
    let result;
    if (command === 'reconcile-release') { requireGate(args['--intent'], 'intent_required'); result = await controller.reconcile(args['--intent'], lease); }
    else if (command === 'rollback') {
      requireGate(args['--release'], 'current_release_id_required');
      const manifest = { ...verified.manifest, releaseId: args['--release'] };
      const snapshot = await store.snapshot(manifest);
      requireGate(snapshot?.release && snapshot.previous && snapshot.rollbackProbes, 'durable_rollback_evidence_missing');
      result = await controller.rollback({ manifest, release: snapshot.release, previous: snapshot.previous, probes: snapshot.rollbackProbes, previousVerification: input, authorizationMode: args['--manual'] ? 'manual' : 'automatic' }, lease);
    } else {
      requireGate(/^\d+$/.test(args['--policy-generation'] ?? ''), 'explicit_policy_generation_required');
      const request = { ...input, policyGeneration: Number(args['--policy-generation']), targetDeploymentId: args['--deployment'], authorizationMode: args['--manual'] ? 'manual' : 'automatic' };
      result = args['--finish-probation'] ? await controller.finishProbation(request, lease) : args['--stage'] ? await controller.stage(request, lease) : await controller.promote(request, lease);
    }
    requireGate(!renewalFailure, 'lease_renewal_failed_reconciliation_required');
    return { status: result.status, ...(result.releaseId ? { releaseId: result.releaseId, productionModified: result.productionModified } : {}), intentKey: result.intentKey, operationId: result.operationId, observed: result.observed ?? null, scope: 'configured_release_provider' };
  } finally { clearInterval(renewal); }
}

export async function main(command) {
  try { const result = await runUpdateCommand(command); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status === 'BLOCKED') process.exitCode = 2; }
  catch (error) { process.stderr.write(`${JSON.stringify({ status: 'BLOCKED', reason: error instanceof UpdateDenied ? error.code : 'verification_or_configuration_failed', productionModified: false })}\n`); process.exitCode = 2; }
}
