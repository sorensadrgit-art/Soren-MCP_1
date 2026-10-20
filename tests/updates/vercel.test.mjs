import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVercelProvider, packageBuildOutput, parseBuildOutput } from '../../lib/updates/vercel.mjs';
import { sha256, LIMITS } from '../../lib/updates/policy.mjs';
import { argumentsFor, runUpdateCommand } from '../../lib/updates/cli.mjs';

test('prebuilt package preserves exact bytes/modes and rejects traversal, changed bytes and source scope', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'soren-package-test-'));
  try {
    const binding = { projectId: 'project', teamId: 'team', sourceCommit: 'a'.repeat(40) };
    await writeFile(join(directory, 'config.json'), '{"version":3}');
    const artifact = await packageBuildOutput(directory, binding);
    assert.equal(parseBuildOutput(artifact, binding).files.length, 1);
    const pack = JSON.parse(artifact); pack.files[0].path = '../escape';
    assert.throws(() => parseBuildOutput(Buffer.from(JSON.stringify(pack)), binding), /file_invalid/);
    const changed = JSON.parse(artifact); changed.files[0].data = Buffer.from('changed').toString('base64');
    assert.throws(() => parseBuildOutput(Buffer.from(JSON.stringify(changed)), binding), /digest_mismatch/);
    assert.throws(() => parseBuildOutput(artifact, { ...binding, projectId: 'other' }), /binding_invalid/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real Vercel adapter verifies remote prebuilt bytes and aliases; stages with skip-domain; manual mutation only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'soren-vercel-test-'));
  try {
    await mkdir(join(directory, 'output')); const config = Buffer.from('{"version":3}');
    await writeFile(join(directory, 'output', 'config.json'), config);
    const cli = join(directory, 'vercel.mjs'); await writeFile(cli, '// isolated fake CLI never executed');
    const binding = { projectId: 'project', teamId: 'team', sourceCommit: 'a'.repeat(40) };
    const artifact = await packageBuildOutput(join(directory, 'output'), binding);
    const manifest = { ...binding, environment: 'production', artifactSha256: sha256(artifact) };
    const env = { SOREN_RELEASE_PROJECT_ID: 'project', SOREN_RELEASE_TEAM_ID: 'team', SOREN_PRODUCTION_DOMAINS: 'example.test', VERCEL_TOKEN: 'test-secret-never-output', SOREN_VERCEL_CLI_PATH: cli, SOREN_VERCEL_CLI_SHA256: sha256(await readFile(cli)), SUPABASE_SERVICE_ROLE_KEY: 'private-db-fixture', SOREN_MANAGEMENT_ACCESS_TOKEN: 'private-owner-fixture', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'private-signing-fixture', NODE_OPTIONS: '--invalid-fixture-option' };
    let active = 'previous', mutations = 0, cliCalls = 0, tamper = false, extra = false, duplicate = false;
    const provider = createVercelProvider({ env, artifact, manifest, run: async (_node, args, options) => {
      cliCalls++; assert.ok(args.includes('--prebuilt') && args.includes('--prod') && args.includes('--skip-domain')); assert.ok(!args.some(arg => arg.includes(env.VERCEL_TOKEN)));
      assert.deepEqual(await readFile(join(options.cwd, '.vercel', 'output', 'config.json')), config);
      assert.equal(JSON.parse(await readFile(join(options.cwd, '.vercel', 'project.json'))).orgId, 'team');
      assert.equal(options.env.VERCEL_TOKEN, env.VERCEL_TOKEN);
      assert.equal(options.env.HOME, options.cwd);
      for (const key of ['SUPABASE_SERVICE_ROLE_KEY','SOREN_MANAGEMENT_ACCESS_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','NODE_OPTIONS']) assert.equal(options.env[key], undefined);
    }, fetchImpl: async (url, options) => {
      assert.equal(url.origin, 'https://api.vercel.com'); assert.equal(url.searchParams.get('teamId'), 'team');
      assert.equal(options.headers.Authorization, `Bearer ${env.VERCEL_TOKEN}`);
      const path = url.pathname;
      if (options.method === 'POST') { mutations++; active = 'candidate'; return Response.json({}); }
      if (path.startsWith('/v9/projects/')) return Response.json({ id: 'project', accountId: 'team', targets: { production: { id: active } } });
      if (path.startsWith('/v13/')) return Response.json({ id: 'candidate', projectId: 'project', target: 'production', readyState: 'READY', meta: { sorenArtifactSha256: sha256(artifact), sorenSourceCommit: binding.sourceCommit, sorenOperationId: 'operation' } });
      if (path === '/v4/aliases') return Response.json({ aliases: [{ alias: 'example.test', deploymentId: active }] });
      if (path.endsWith('/files')) return Response.json([{ name: '.vercel', type: 'directory', children: [{ name: 'output', type: 'directory', children: [{ name: 'config.json', type: 'file', uid: 'file' }, ...(extra ? [{ name: 'unreviewed-backdoor.func', type: 'file', uid: 'extra' }] : []), ...(duplicate ? [{ name: 'config.json', type: 'file', uid: 'duplicate' }] : [])] }] }]);
      if (path.startsWith('/v8/')) return new Response(tamper ? 'tampered' : config, { headers: { 'content-type': 'application/octet-stream' } });
      if (path === '/v6/deployments') return Response.json({ deployments: [{ uid: 'candidate' }] });
      throw new Error(`unexpected_test_endpoint:${path}`);
    } });
    assert.equal(provider.capabilities.atomicCompareAndSwap, false);
    assert.equal((await provider.inspectDeployment('candidate')).productionDomainsAssigned, false);
    const intent = { kind: 'stage', operationId: 'operation', expectedParentDeploymentId: 'previous', authorizationMode: 'manual' };
    await provider.stage(intent); assert.equal(cliCalls, 1);
    assert.equal((await provider.inspectOperation(intent)).outcome, 'applied');
    await assert.rejects(provider.promote({ ...intent, kind: 'promote', authorizationMode: 'automatic', targetDeploymentId: 'candidate' }), /atomic_parent_cas/); assert.equal(mutations, 0);
    await provider.promote({ ...intent, kind: 'promote', targetDeploymentId: 'candidate' }); assert.equal(mutations, 1);
    assert.equal((await provider.inspectOperation({ ...intent, kind: 'promote', targetDeploymentId: 'candidate' })).aliasVerified, true);
    extra = true; await assert.rejects(provider.inspectDeployment('candidate'), /remote_build_output_file_set_mismatch/); extra = false;
    duplicate = true; await assert.rejects(provider.inspectDeployment('candidate'), /vercel_file_tree_duplicate_or_unsafe/); duplicate = false;
    tamper = true; await assert.rejects(provider.inspectDeployment('candidate'), /remote_build_output_digest_mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('operator command preflight is truthful and never enables production; argument parser rejects unknown or missing values', async () => {
  for (const command of ['release', 'rollback', 'reconcile-release']) {
    const result = await runUpdateCommand(command, ['--check-readiness'], {});
    assert.equal(result.status, 'BLOCKED'); assert.equal(result.productionMutationEnabled, false); assert.equal(result.automaticPromotionSupported, false);
  }
  assert.throws(() => argumentsFor(['--exec', 'echo-secret']), /invalid_argument/);
  assert.throws(() => argumentsFor(['--input']), /missing_argument/);
  const rehearsal = await runUpdateCommand('release', ['--rehearse'], {});
  assert.equal(rehearsal.status, 'PASS'); assert.equal(rehearsal.scope, 'local_fake_adapters'); assert.equal(rehearsal.productionModified, false); assert.equal(rehearsal.authenticSignatureVerified, false);
  await assert.rejects(runUpdateCommand('release', ['--rehearse', '--manual'], {}), /rehearsal_must_be_separate/);
});

test('application artifact limits match reviewed policy and keep skill package ceiling separate', async () => {
  const policy = JSON.parse(await readFile(new URL('../../config/operating-policy.json', import.meta.url)));
  assert.equal(LIMITS.maxArtifactBytes, policy.updates.applicationArtifactMaxBytes);
  assert.equal(LIMITS.maxArtifactFiles, policy.updates.applicationArtifactMaxFiles);
  assert.equal(policy.discovery.stagedPackageMaxBytes, 2_097_152);
});
