import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { produceRelease, producerOptions, BUILD_REPOSITORY, BUILD_REF, BUILD_WORKFLOW } from '../../scripts/produce-release.mjs';
import { sha256 } from '../../lib/updates/policy.mjs';
import { parseBuildOutput } from '../../lib/updates/vercel.mjs';
import { verifyRelease } from '../../lib/updates/verification.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'soren-producer-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'source');
  const tools = path.join(directory, 'tools');
  await fs.mkdir(path.join(root, 'config'), { recursive: true });
  await fs.mkdir(tools);
  const cli = path.join(tools, 'vercel.mjs');
  const cliBytes = Buffer.from('// Fixture only. Never executed.\n');
  await fs.writeFile(cli, cliBytes);
  const toolchain = { schemaVersion: 1, entrypoint: 'vercel.mjs', files: [{ path: 'vercel.mjs', sha256: sha256(cliBytes) }], audit: { status: 'PASS', evidenceRef: 'isolated-test-toolchain-review', expiresAt: new Date(Date.now() + 86400000).toISOString() } };
  const toolchainPath = path.join(directory, 'toolchain-manifest.json');
  const toolchainBytes = Buffer.from(JSON.stringify(toolchain));
  await fs.writeFile(toolchainPath, toolchainBytes);
  const lockfileBytes = Buffer.from(JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture' }, 'node_modules/one': { version: '1.2.3', integrity: 'fixture-integrity' } } }));
  const policyBytes = Buffer.from('{"mode":"observe"}\n');
  await fs.writeFile(path.join(root, 'package-lock.json'), lockfileBytes);
  await fs.writeFile(path.join(root, 'config', 'operating-policy.json'), policyBytes);
  const sourceSha = 'a'.repeat(40);
  const env = {
    ...process.env,
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: BUILD_REPOSITORY,
    GITHUB_REF: BUILD_REF, GITHUB_WORKFLOW_REF: `${BUILD_REPOSITORY}/${BUILD_WORKFLOW}@${BUILD_REF}`,
    GITHUB_SHA: sourceSha, GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://fixture.invalid/oidc', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-oidc-token',
    VERCEL_TOKEN: 'synthetic-vercel-token', SOREN_BUILD_TOOLCHAIN_APPROVED: 'true',
    SOREN_BUILD_TOOLCHAIN_REVIEW_REF: 'isolated-test-owner-review', SOREN_BUILD_ENVIRONMENT: 'production-release-build',
    SOREN_BUILD_TOOLCHAIN_ROOT: tools, SOREN_BUILD_TOOLCHAIN_MANIFEST: toolchainPath,
    SOREN_BUILD_TOOLCHAIN_SHA256: sha256(toolchainBytes), SOREN_VERCEL_CLI_PATH: cli,
    SOREN_VERCEL_CLI_SHA256: sha256(cliBytes),
  };
  const options = { sourceSha, projectId: 'project', teamId: 'team', expectedParentDeploymentId: 'parent', catalogGeneration: 1, schemaMinimum: 1, schemaMaximum: 2, approvalIds: ['reserved-approval'], outputDirectory: path.join(directory, 'candidate') };
  const state = { commands: [], signs: 0, dirty: false, failSuite: false, verified: false, statement: null };
  const run = async (program, args, commandOptions) => {
    state.commands.push({ program, args, env: commandOptions.env });
    assert.ok(!args.some(argument => argument.includes(env.VERCEL_TOKEN) || argument.includes(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)));
    if (program === 'git') return { stdout: args[0] === 'status' ? state.dirty ? ' M changed-file\n' : '' : sourceSha + '\n' };
    if (state.failSuite && args.includes('test')) throw new Error('synthetic stderr with secret must never escape');
    if (args[1] === 'pull') {
      await fs.mkdir(path.join(root, '.vercel'), { recursive: true });
      await fs.writeFile(path.join(root, '.vercel', 'project.json'), JSON.stringify({ projectId: 'project', orgId: 'team' }));
    }
    if (args[1] === 'build') {
      await fs.mkdir(path.join(root, '.vercel', 'output'), { recursive: true });
      await fs.writeFile(path.join(root, '.vercel', 'output', 'config.json'), '{"version":3}');
    }
    return { stdout: '', stderr: '' };
  };
  const attest = async (bytes, payloadType, settings) => {
    state.signs++;
    state.statement = JSON.parse(bytes);
    assert.equal(settings.tlogUpload, true);
    return { dsseEnvelope: { payloadType, payload: bytes.toString('base64'), signatures: [{ keyid: 'fixture-only', sig: 'unsigned-fixture' }] } };
  };
  const verifyBundle = async (_bundle, settings) => {
    state.verified = true;
    assert.equal(settings.certificateIssuer, 'https://token.actions.githubusercontent.com');
    assert.ok(settings.certificateIdentityURI.startsWith('^') && settings.certificateIdentityURI.endsWith('$'));
  };
  let tick = 0;
  const fixtureTime = Date.now() - 1000;
  return { root, tools, env, options, state, lockfileBytes, policyBytes, dependencies: { root, env, run, attest, verifyBundle, now: () => new Date(fixtureTime + tick++) } };
}

test('trusted producer binds exact build, evidence, SBOM and toolchain without fabricating staged checks', async t => {
  const f = await fixture(t);
  const result = await produceRelease(f.options, f.dependencies);
  assert.equal(result.status, 'SIGNED_STAGE_CANDIDATE');
  assert.equal(result.promotionEligible, false);
  assert.equal(result.humanApprovalGranted, false);
  assert.equal(result.productionModified, false);
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.verified, true);
  const artifact = await fs.readFile(path.join(f.options.outputDirectory, 'artifact.tar'));
  const evidenceBytes = await fs.readFile(path.join(f.options.outputDirectory, 'evidence.json'));
  assert.deepEqual(await fs.readFile(path.join(f.options.outputDirectory, 'verification-evidence.json')), evidenceBytes);
  const evidence = JSON.parse(evidenceBytes);
  assert.ok(evidence.filter(row => row.status === 'PASS').every(row => row.environment === 'isolated_ci'));
  for (const name of ['protocol', 'final-smoke', 'staged-observation']) assert.equal(evidence.find(row => row.testId === name).status, 'NOT_RUN');
  assert.equal(f.state.statement.subject.find(subject => subject.name === 'artifact.tar').digest.sha256, sha256(artifact));
  assert.equal(f.state.statement.subject.find(subject => subject.name === 'verification-evidence.json').digest.sha256, sha256(evidenceBytes));
  assert.equal(f.state.statement.subject.find(subject => subject.name === 'sbom.cdx.json').digest.sha256, sha256(await fs.readFile(path.join(f.options.outputDirectory, 'sbom.cdx.json'))));
  assert.equal(f.state.statement.predicate.buildDefinition.externalParameters.target.projectId, 'project');
  assert.ok(f.state.statement.predicate.buildDefinition.resolvedDependencies.some(row => row.uri === 'file:owner-reviewed-toolchain-manifest' && row.digest.sha256 === f.env.SOREN_BUILD_TOOLCHAIN_SHA256));
  assert.equal(parseBuildOutput(artifact, { projectId: 'project', teamId: 'team', sourceCommit: f.options.sourceSha }).environment, 'production');
  assert.ok(!f.state.commands.some(command => command.args.some(argument => ['deploy', 'promote', 'rollback'].includes(argument))));
  for (const command of f.state.commands.filter(command => !['pull', 'build'].includes(command.args[1]) || command.args[0] !== f.env.SOREN_VERCEL_CLI_PATH)) {
    assert.equal(command.env.VERCEL_TOKEN, undefined);
    assert.equal(command.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
  }
  const manifestBytes = await fs.readFile(path.join(f.options.outputDirectory, 'manifest.json'));
  const bundleBytes = await fs.readFile(path.join(f.options.outputDirectory, 'provenance.sigstore.json'));
  const identity = `https://github.com/${BUILD_REPOSITORY}/${BUILD_WORKFLOW}@${BUILD_REF}`;
  const candidate = { manifestBytes, artifact, evidenceBytes, evidence, bundleBytes, lockfileBytes: f.lockfileBytes, policyBytes: f.policyBytes, trust: { enabled: true, certificateIssuer: 'https://token.actions.githubusercontent.com', certificateIdentityURI: identity, repository: `https://github.com/${BUILD_REPOSITORY}`, workflow: BUILD_WORKFLOW, ref: BUILD_REF }, verifier: async () => {} };
  assert.equal((await verifyRelease({ ...candidate, evidenceRequired: false })).artifactSha256, sha256(artifact));
  await assert.rejects(verifyRelease(candidate), /evidence_identity_mismatch|check_not_passed/);
});

test('PR, nonstable, wrong workflow and dirty source fail before tests, credentials or signing', async t => {
  for (const mutate of [f => f.env.GITHUB_EVENT_NAME = 'pull_request', f => f.env.GITHUB_REF = 'refs/heads/feature', f => f.env.GITHUB_WORKFLOW_REF = `${BUILD_REPOSITORY}/evil.yml@${BUILD_REF}`, f => f.options.sourceSha = 'b'.repeat(40), f => f.state.dirty = true]) {
    const f = await fixture(t);
    mutate(f);
    await assert.rejects(produceRelease(f.options, f.dependencies));
    assert.equal(f.state.signs, 0);
    assert.ok(f.state.commands.every(command => command.program === 'git'));
  }
});

test('failed suite, unreviewed toolchain and toolchain drift never sign or output a candidate', async t => {
  for (const mutate of [async f => { f.state.failSuite = true; }, async f => { f.env.SOREN_BUILD_TOOLCHAIN_APPROVED = 'false'; }, async f => { await fs.writeFile(path.join(f.tools, 'extra-module.js'), 'unreviewed'); }]) {
    const f = await fixture(t);
    await mutate(f);
    await assert.rejects(produceRelease(f.options, f.dependencies));
    assert.equal(f.state.signs, 0);
    await assert.rejects(fs.access(f.options.outputDirectory));
  }
});

test('maintained verifier rejection prevents artifact publication', async t => {
  const f = await fixture(t);
  f.dependencies.verifyBundle = async () => { throw new Error('synthetic-signature-rejection'); };
  await assert.rejects(produceRelease(f.options, f.dependencies), /signature-rejection/);
  await assert.rejects(fs.access(f.options.outputDirectory));
});

test('producer input parser refuses placeholders, ambiguous approvals and invalid numeric scope', () => {
  assert.throws(() => producerOptions({}), /approval_reservations/);
  assert.throws(() => producerOptions({ SOREN_RELEASE_APPROVAL_IDS: '["same","same"]' }), /approval_reservations_invalid/);
  assert.throws(() => producerOptions({ SOREN_RELEASE_APPROVAL_IDS: '["reserved"]', SOREN_CATALOG_GENERATION: '-1' }), /invalid_catalog_generation/);
});
