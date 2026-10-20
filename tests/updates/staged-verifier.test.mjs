import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { verifyStagedRelease, assertSnapshot, stagedOrigin, STAGED_WORKFLOW } from '../../scripts/verify-staged-release.mjs';
import { BUILD_REPOSITORY, BUILD_REF, BUILD_WORKFLOW } from '../../scripts/produce-release.mjs';
import { sha256 } from '../../lib/updates/policy.mjs';
import { verifyRelease } from '../../lib/updates/verification.mjs';
import { createReleaseRead } from '../../lib/updates/ingress.mjs';

async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'soren-staged-test-'));
  t.after(() => fs.rm(temporary, { force: true, recursive: true }));
  const root = path.join(temporary, 'source'); const input = path.join(temporary, 'input');
  await fs.mkdir(path.join(root, 'config'), { recursive: true }); await fs.mkdir(input);
  const source = 'a'.repeat(40);
  const lockfileBytes = Buffer.from('{"name":"fixture","lockfileVersion":3,"packages":{}}\n');
  const policyBytes = Buffer.from('{"mode":"observe"}\n');
  const artifact = Buffer.from(JSON.stringify({ format: 'soren-vercel-output-v1', projectId: 'project', teamId: 'team', sourceCommit: source, environment: 'production', files: [{ path: 'config.json', mode: 420, sha256: sha256('{"version":3}'), data: Buffer.from('{"version":3}').toString('base64') }] }));
  const sbom = Buffer.from('{"bomFormat":"CycloneDX","specVersion":"1.6","version":1}\n');
  const identity = workflow => `https://github.com/${BUILD_REPOSITORY}/${workflow}@${BUILD_REF}`;
  const trust = { enabled: true, identities: [BUILD_WORKFLOW, STAGED_WORKFLOW].map(workflow => ({ certificateIssuer: 'https://token.actions.githubusercontent.com', certificateIdentityURI: identity(workflow), repository: `https://github.com/${BUILD_REPOSITORY}`, workflow, ref: BUILD_REF })) };
  const trustBytes = Buffer.from(JSON.stringify(trust));
  const trustFile = path.join(temporary, 'owner-trust.json'); await fs.writeFile(trustFile, trustBytes);
  let clock = Date.now() - 1_800_000;
  const statement = { _type: 'https://in-toto.io/Statement/v1', subject: [{ name: 'artifact.tar', digest: { sha256: sha256(artifact) } }, { name: 'sbom.cdx.json', digest: { sha256: sha256(sbom) } }], predicateType: 'https://slsa.dev/provenance/v1', predicate: { buildDefinition: { externalParameters: { workflow: { repository: `https://github.com/${BUILD_REPOSITORY}`, path: BUILD_WORKFLOW, ref: BUILD_REF } }, resolvedDependencies: [{ uri: `git+https://github.com/${BUILD_REPOSITORY}@${BUILD_REF}`, digest: { gitCommit: source } }, { uri: 'file:package-lock.json', digest: { sha256: sha256(lockfileBytes) } }, { uri: 'file:config/operating-policy.json', digest: { sha256: sha256(policyBytes) } }] } } };
  const bundleBytes = Buffer.from(JSON.stringify({ dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from(JSON.stringify(statement)).toString('base64'), signatures: [{ sig: 'unsigned-fixture-only' }] } }));
  const manifest = { schemaVersion: 1, releaseId: 'gha-123-1', sourceCommit: source, lockfileSha256: sha256(lockfileBytes), artifactSha256: sha256(artifact), policySha256: sha256(policyBytes), environment: 'production', projectId: 'project', expectedParentDeploymentId: 'parent', catalogGeneration: 1, schemaCompatibility: { minimum: 1, maximum: 2, destructiveMigration: false }, approvalIds: ['old-reservation'], provenance: { method: 'verified_ci_attestation', verificationReference: `sha256:${sha256(bundleBytes)}`, trustedIdentity: identity(BUILD_WORKFLOW) }, createdAt: new Date(clock - 1000).toISOString(), expiresAt: new Date(clock + 3_600_000).toISOString() };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  for (const [name, bytes] of [['manifest.json', manifestBytes], ['artifact.tar', artifact], ['provenance.sigstore.json', bundleBytes], ['evidence.json', Buffer.from('[]')], ['package-lock.json', lockfileBytes], ['sbom.cdx.json', sbom]]) await fs.writeFile(path.join(input, name), bytes);
  await fs.writeFile(path.join(root, 'package-lock.json'), lockfileBytes); await fs.writeFile(path.join(root, 'config', 'operating-policy.json'), policyBytes);
  const env = { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: BUILD_REPOSITORY, GITHUB_REF: BUILD_REF, GITHUB_WORKFLOW_REF: `${BUILD_REPOSITORY}/${STAGED_WORKFLOW}@${BUILD_REF}`, GITHUB_SHA: source, GITHUB_RUN_ID: '456', GITHUB_RUN_ATTEMPT: '1', SOREN_STAGED_ENVIRONMENT: 'production-staged-verification', SOREN_PRODUCTION_ARTIFACT_TRUST_APPROVED: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://fixture.invalid', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-oidc', VERCEL_TOKEN: 'synthetic-vercel', SOREN_RELEASE_OBSERVER_ACCESS_TOKEN: 'synthetic-observer', SOREN_PRIVATE_READ_ACCESS_TOKEN: 'synthetic-private-read', SOREN_PRIVATE_PROBE_VERSION_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', SOREN_PRIVATE_PROBE_MANIFEST_SHA256: 'b'.repeat(64), SOREN_PRIVATE_PROBE_CONTENT_SHA256: 'c'.repeat(64), SOREN_RELEASE_TRUST_FILE: trustFile, SOREN_RELEASE_TRUST_SHA256: sha256(trustBytes), SOREN_PRODUCTION_DOMAINS: 'production.vercel.app', SOREN_ADMIN_ORIGIN: 'https://production.vercel.app' };
  const options = { sourceSha: source, projectId: 'project', teamId: 'team', deploymentId: 'staged', expectedParentDeploymentId: 'parent', catalogGeneration: 1, schemaMinimum: 1, schemaMaximum: 2, approvalIds: ['new-reservation'], candidateDirectory: input, outputDirectory: path.join(temporary, 'output') };
  const state = { signs: 0, commands: [], inspections: 0, probes: [], watcherStale: false, parentChanged: false, remoteMismatch: false, dirty: false, failBrowser: false, failPrivate: false, failedSecurity: false, driftWait: false };
  // Match update_release_snapshot: release.deploymentId is the active parent;
  // stagedDeploymentId is retained at top level from the durable stage outcome.
  const snapshot = () => ({ manifestSha256: sha256(manifestBytes), artifactSha256: manifest.artifactSha256, sourceCommit: source, policy: { projectId: 'project', environment: 'production', policySha256: manifest.policySha256, mode: 'observe', generation: 0 }, release: { releaseId: manifest.releaseId, state: 'STAGED', projectId: 'project', environment: 'production', deploymentId: 'parent' }, stagedDeploymentId: 'staged', activeDeploymentId: state.parentChanged ? 'new-parent' : 'parent', catalogGeneration: 1, schemaVersion: 1, dependenciesReady: true, budgetAvailable: true, securityIncident: false, revokedDigests: [], readinessObservedAt: new Date(clock).toISOString(), watcher: { status: 'PASS', independent: true, observedAt: new Date(clock - (state.watcherStale ? 61_000 : 0)).toISOString(), maxProbeIntervalSeconds: 60 } });
  const dependencies = {
    env, root, now: () => clock, wait: async milliseconds => { clock += state.driftWait ? milliseconds + 60_001 : milliseconds; },
    run: async (program, args, settings) => { state.commands.push({ program, args, env: settings.env }); return { stdout: program === 'git' ? args[0] === 'status' ? state.dirty ? ' M file' : '' : source + '\n' : '' }; },
    fetchImpl: async url => { assert.equal(new URL(url).origin, env.SOREN_ADMIN_ORIGIN); return Response.json(snapshot()); },
    provider: { inspectDeployment: async () => { state.inspections++; return { deploymentId: 'staged', projectId: 'project', environment: 'production', artifactSha256: manifest.artifactSha256, artifactBytesVerified: !state.remoteMismatch, productionConfiguration: true, productionDomainsAssigned: false }; }, activeDeployment: async () => state.parentChanged ? 'different' : 'parent', getDeployment: async () => ({ url: 'staged.vercel.app' }) },
    verifyBundle: async () => {},
    attest: async (payload, payloadType) => { state.signs++; return { dsseEnvelope: { payloadType, payload: payload.toString('base64'), signatures: [{ sig: 'unsigned-fixture-only' }] } }; },
    protocolProbe: async (_context, mode = {}) => { state.probes.push(mode); if (mode.privateRead) return { authenticatedPrivateRead: !state.failPrivate, contentSha256: env.SOREN_PRIVATE_PROBE_CONTENT_SHA256 }; return { localDiscoveryOnly: true, ...(mode.full ? { anonymousPrivateReadDenied: true } : {}) }; },
    securityProbe: async () => ({ invalidBearer: state.failedSecurity ? 200 : 401, crossOrigin: 403, oversizedBody: 413, readonlyAgentAdmin: 403 }),
    readinessProbe: async () => ({ ready: true, mode: 'private_enabled', status: 'HEALTHY', freshness: 'fresh' }),
    browserProbe: async () => ({ publicFlows: ['fixture-not-live'], routeFixturesUsed: state.failBrowser, screenshot: Buffer.from('fixture-only-not-a-real-screenshot') }),
  };
  return { root, env, options, state, dependencies, manifest, manifestBytes, artifact, lockfileBytes, policyBytes, trust, snapshot, now: () => clock };
}

test('fixture orchestration binds same artifact and new exact staged evidence without claiming a live run', async t => {
  const f = await fixture(t);
  const result = await verifyStagedRelease(f.options, f.dependencies);
  assert.equal(result.status, 'SIGNED_STAGED_VERIFICATION'); assert.equal(result.productionModified, false); assert.equal(result.humanApprovalGranted, false);
  assert.equal(result.releaseId, 'staged-456-1'); assert.equal(result.originalReleaseId, f.manifest.releaseId);
  assert.equal(result.observationSeconds, 900); assert.ok(result.observations >= 20); assert.equal(f.state.signs, 1); assert.equal(f.state.inspections, 2);
  const load = name => fs.readFile(path.join(f.options.outputDirectory, name));
  assert.deepEqual(await load('artifact.tar'), f.artifact); assert.deepEqual(await load('package-lock.json'), f.lockfileBytes);
  const evidenceBytes = await load('evidence.json'); const evidence = JSON.parse(evidenceBytes);
  assert.equal(evidence.length, 9);
  assert.ok(evidence.filter(row => row.observed.sourceSuite).every(row => row.observed.sourceSuite.environment === 'isolated_ci' && row.observed.remoteArtifactBytesVerified === true));
  assert.ok(f.state.commands.every(command => !command.args.some(arg => ['build', 'deploy', 'promote', 'rollback'].includes(arg))));
  for (const command of f.state.commands) for (const name of ['VERCEL_TOKEN', 'SOREN_PRIVATE_READ_ACCESS_TOKEN', 'SOREN_RELEASE_OBSERVER_ACCESS_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) assert.equal(command.env[name], undefined);
  const verified = await verifyRelease({ manifestBytes: await load('manifest.json'), artifact: f.artifact, lockfileBytes: f.lockfileBytes, policyBytes: f.policyBytes, bundleBytes: await load('provenance.sigstore.json'), evidenceBytes, trust: f.trust, verifier: async () => {}, now: f.now() });
  assert.equal(verified.identity.trustedIdentity, `https://github.com/${BUILD_REPOSITORY}/${STAGED_WORKFLOW}@${BUILD_REF}`);
});

test('missing credentials, PR source, candidate lock drift and dirty source block without signing', async t => {
  for (const change of [f => delete f.env.SOREN_RELEASE_OBSERVER_ACCESS_TOKEN, f => f.env.GITHUB_EVENT_NAME = 'pull_request', f => f.state.dirty = true, async f => fs.writeFile(path.join(f.options.candidateDirectory, 'package-lock.json'), 'changed')]) {
    const f = await fixture(t); await change(f);
    await assert.rejects(verifyStagedRelease(f.options, f.dependencies)); assert.equal(f.state.signs, 0);
    await assert.rejects(fs.access(f.options.outputDirectory));
  }
});

test('remote mismatch, stale watcher, changed parent and observation gaps fail closed', async t => {
  for (const property of ['remoteMismatch', 'watcherStale', 'parentChanged', 'driftWait']) {
    const f = await fixture(t); f.state[property] = true;
    await assert.rejects(verifyStagedRelease(f.options, f.dependencies)); assert.equal(f.state.signs, 0);
    await assert.rejects(fs.access(f.options.outputDirectory));
  }
});

test('failed real browser gate, private read or security gate never attests PASS', async t => {
  for (const property of ['failBrowser', 'failPrivate', 'failedSecurity']) {
    const f = await fixture(t); f.state[property] = true;
    await assert.rejects(verifyStagedRelease(f.options, f.dependencies)); assert.equal(f.state.signs, 0);
  }
});

test('unapproved staged signer and tampered artifact fail before source suites', async t => {
  for (const change of [async f => { const bytes = Buffer.from(JSON.stringify({ enabled: true, ...f.trust.identities[0] })); await fs.writeFile(f.env.SOREN_RELEASE_TRUST_FILE, bytes); f.env.SOREN_RELEASE_TRUST_SHA256 = sha256(bytes); }, async f => fs.appendFile(path.join(f.options.candidateDirectory, 'artifact.tar'), 'tamper')]) {
    const f = await fixture(t); await change(f);
    await assert.rejects(verifyStagedRelease(f.options, f.dependencies)); assert.equal(f.state.signs, 0); assert.equal(f.state.commands.length, 0);
  }
});

test('snapshot rejects revoked identity and SSRF-shaped deployment URL', async t => {
  const f = await fixture(t);
  for (const digest of [f.manifest.artifactSha256, sha256(f.manifestBytes)]) {
    const snapshot = f.snapshot(); snapshot.revokedDigests.push(digest);
    assert.throws(() => assertSnapshot(snapshot, { manifest: f.manifest, manifestSha256: sha256(f.manifestBytes), deploymentId: 'staged' }, f.now()), /revocation/);
  }
  for (const url of ['evil.invalid', 'user:password@staged.vercel.app', 'staged.vercel.app/path', 'staged.vercel.app:443', 'staged.vercel.app?query=1']) assert.throws(() => stagedOrigin({ url }));
  assert.equal(stagedOrigin({ url: 'staged.vercel.app' }), 'https://staged.vercel.app');
});

test('real readonly endpoint preserves the SQL snapshot staged target and PASS watcher contract', async t => {
  const f = await fixture(t);
  const env = { SOREN_RELEASE_PROJECT_ID: 'project', SOREN_RELEASE_ENVIRONMENT: 'production', SOREN_RELEASE_OBSERVER_CLIENT_ID: 'observer-client' };
  const read = createReleaseRead({ env, authenticate: async () => ({ kind: 'observer', clientId: 'observer-client', workspaceId: 'workspace' }), operations: { rpc: async (name, args) => { assert.equal(name, 'update_release_snapshot'); assert.equal(args.p_release_id, f.manifest.releaseId); return f.snapshot(); } } });
  const response = await read(new Request(`https://production.vercel.app/api/admin/updates/releases?releaseId=${f.manifest.releaseId}&manifestSha256=${sha256(f.manifestBytes)}&projectId=project&environment=production`));
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.release.deploymentId, 'parent'); assert.equal(snapshot.stagedDeploymentId, 'staged'); assert.equal(snapshot.watcher.status, 'PASS');
  assert.doesNotThrow(() => assertSnapshot(snapshot, { manifest: f.manifest, manifestSha256: sha256(f.manifestBytes), deploymentId: 'staged' }, f.now()));
});
