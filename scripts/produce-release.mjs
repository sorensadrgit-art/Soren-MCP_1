#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packageBuildOutput, parseBuildOutput } from '../lib/updates/vercel.mjs';
import { sha256, requireGate } from '../lib/updates/policy.mjs';

export const BUILD_REPOSITORY = 'sorensadrgit-art/Soren-MCP_1';
export const BUILD_WORKFLOW = '.github/workflows/release-build.yml';
export const BUILD_REF = 'refs/heads/stable';
const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);

function number(value, name) {
  requireGate(/^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)), `invalid_${name}`);
  return Number(value);
}

export function producerOptions(env = process.env) {
  let approvalIds;
  try { approvalIds = JSON.parse(env.SOREN_RELEASE_APPROVAL_IDS); } catch { requireGate(false, 'approval_reservations_required'); }
  requireGate(Array.isArray(approvalIds) && approvalIds.length > 0 && approvalIds.length <= 10 && new Set(approvalIds).size === approvalIds.length && approvalIds.every(id => typeof id === 'string' && /^[\w:.-]{1,128}$/.test(id)), 'approval_reservations_invalid');
  return {
    sourceSha: env.SOREN_REVIEWED_SOURCE_SHA,
    projectId: env.SOREN_RELEASE_PROJECT_ID,
    teamId: env.SOREN_RELEASE_TEAM_ID,
    expectedParentDeploymentId: env.SOREN_EXPECTED_PARENT_DEPLOYMENT_ID,
    catalogGeneration: number(env.SOREN_CATALOG_GENERATION, 'catalog_generation'),
    schemaMinimum: number(env.SOREN_SCHEMA_MINIMUM, 'schema_minimum'),
    schemaMaximum: number(env.SOREN_SCHEMA_MAXIMUM, 'schema_maximum'),
    approvalIds,
    outputDirectory: env.SOREN_CANDIDATE_OUTPUT,
  };
}

function checkEnvironment(env, options) {
  requireGate(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REPOSITORY === BUILD_REPOSITORY && env.GITHUB_REF === BUILD_REF && env.GITHUB_WORKFLOW_REF === `${BUILD_REPOSITORY}/${BUILD_WORKFLOW}@${BUILD_REF}`, 'trusted_manual_workflow_required');
  requireGate(/^[a-f0-9]{40}$/.test(options.sourceSha || '') && options.sourceSha === env.GITHUB_SHA, 'exact_reviewed_source_required');
  requireGate(/^\d+$/.test(env.GITHUB_RUN_ID || '') && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT || ''), 'trusted_run_identity_required');
  requireGate(env.SOREN_BUILD_TOOLCHAIN_APPROVED === 'true' && env.SOREN_BUILD_TOOLCHAIN_REVIEW_REF && env.SOREN_BUILD_ENVIRONMENT === 'production-release-build', 'reviewed_toolchain_and_build_environment_required');
  requireGate(env.VERCEL_TOKEN && env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'build_or_oidc_credentials_unavailable');
  for (const value of [options.projectId, options.teamId, options.expectedParentDeploymentId]) requireGate(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value), 'release_scope_invalid');
  requireGate(Number.isSafeInteger(options.catalogGeneration) && options.catalogGeneration >= 0 && Number.isSafeInteger(options.schemaMinimum) && options.schemaMinimum >= 0 && Number.isSafeInteger(options.schemaMaximum) && options.schemaMaximum >= options.schemaMinimum, 'release_schema_scope_invalid');
  requireGate(Array.isArray(options.approvalIds) && options.approvalIds.length > 0 && options.outputDirectory, 'release_inputs_required');
}

async function verifyToolchain(env, sourceRoot) {
  const root = env.SOREN_BUILD_TOOLCHAIN_ROOT;
  const manifestPath = env.SOREN_BUILD_TOOLCHAIN_MANIFEST;
  requireGate(root && manifestPath && path.isAbsolute(root) && path.isAbsolute(manifestPath) && /^[a-f0-9]{64}$/.test(env.SOREN_BUILD_TOOLCHAIN_SHA256 || ''), 'immutable_toolchain_manifest_required');
  const relative = path.relative(sourceRoot, root);
  requireGate(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'toolchain_must_be_outside_source');
  const bytes = await fs.readFile(manifestPath);
  requireGate(bytes.length <= 32 * 1024 * 1024 && sha256(bytes) === env.SOREN_BUILD_TOOLCHAIN_SHA256, 'toolchain_manifest_digest_mismatch');
  const manifest = JSON.parse(bytes);
  requireGate(manifest.schemaVersion === 1 && Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 100000 && ['PASS', 'OWNER_EXCEPTION'].includes(manifest.audit?.status) && manifest.audit.evidenceRef && Date.parse(manifest.audit.expiresAt) > Date.now() && (manifest.audit.status !== 'OWNER_EXCEPTION' || manifest.audit.exceptionReason), 'toolchain_audit_or_exception_required');
  const files = new Map();
  for (const file of manifest.files) {
    requireGate(typeof file.path === 'string' && /^[^\\:\0]+$/.test(file.path) && !file.path.startsWith('/') && file.path.split('/').every(part => part && part !== '.' && part !== '..') && /^[a-f0-9]{64}$/.test(file.sha256 || '') && !files.has(file.path), 'toolchain_manifest_path_invalid');
    files.set(file.path, file.sha256);
  }
  let visited = 0;
  async function walk(directory, prefix = '') {
    requireGate(!(await fs.lstat(directory)).isSymbolicLink(), 'toolchain_symlink_refused');
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      requireGate(!entry.isSymbolicLink(), 'toolchain_symlink_refused');
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else {
        requireGate(entry.isFile() && ++visited <= 100000 && files.has(name) && sha256(await fs.readFile(path.join(directory, entry.name))) === files.get(name), 'toolchain_tree_mismatch');
      }
    }
  }
  await walk(root);
  requireGate(typeof manifest.entrypoint === 'string' && visited === files.size && path.resolve(root, ...manifest.entrypoint.split('/')) === path.resolve(env.SOREN_VERCEL_CLI_PATH || '') && files.get(manifest.entrypoint) === env.SOREN_VERCEL_CLI_SHA256, 'toolchain_entrypoint_mismatch');
  return { sha256: sha256(bytes), auditStatus: manifest.audit.status };
}

export async function produceRelease(options, dependencies = {}) {
  const env = dependencies.env || process.env;
  const root = dependencies.root || rootDirectory;
  const now = dependencies.now || (() => new Date());
  const run = dependencies.run || execute;
  checkEnvironment(env, options);
  const output = path.resolve(options.outputDirectory);
  const relative = path.relative(root, output);
  requireGate(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'candidate_output_must_be_outside_source');
  try { await fs.lstat(output); requireGate(false, 'candidate_output_exists'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const safeNames = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TMP', 'TEMP', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'npm_config_cache', 'NPM_CONFIG_CACHE'];
  const sourceEnvironment = Object.fromEntries(safeNames.filter(name => env[name]).map(name => [name, env[name]]));
  const commandOptions = { cwd: root, env: { ...sourceEnvironment, CI: 'true', NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, maxBuffer: 1024 * 1024, timeout: 15 * 60_000 };
  const cli = env.SOREN_VERCEL_CLI_PATH;
  requireGate(cli && path.isAbsolute(cli) && /^[a-f0-9]{64}$/.test(env.SOREN_VERCEL_CLI_SHA256 || ''), 'reviewed_isolated_vercel_cli_required');
  const cliRelative = path.relative(root, path.resolve(cli));
  requireGate(cliRelative.startsWith('..' + path.sep) || path.isAbsolute(cliRelative), 'build_cli_must_be_outside_source');
  requireGate(!(await fs.lstat(cli)).isSymbolicLink() && sha256(await fs.readFile(cli)) === env.SOREN_VERCEL_CLI_SHA256, 'reviewed_vercel_cli_required');
  const toolchain = await verifyToolchain(env, root);
  async function command(program, args, label) {
    try { return await run(program, args, commandOptions); }
    catch { requireGate(false, `${label}_failed`); }
  }
  async function cleanSource() {
    const head = await command('git', ['rev-parse', 'HEAD'], 'source_identity');
    const stable = await command('git', ['rev-parse', 'origin/stable'], 'stable_identity');
    const dirty = await command('git', ['status', '--porcelain', '--untracked-files=all'], 'source_status');
    requireGate(head.stdout.trim() === options.sourceSha && stable.stdout.trim() === options.sourceSha && !dirty.stdout.trim(), 'dirty_or_unreviewed_source');
  }
  await cleanSource();
  const lockfileBytes = await fs.readFile(path.join(root, 'package-lock.json'));
  const policyBytes = await fs.readFile(path.join(root, 'config', 'operating-policy.json'));
  const sourceLockSha256 = sha256(lockfileBytes);
  const policySha256 = sha256(policyBytes);
  const bundledNpm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCli = await fs.access(bundledNpm).then(() => bundledNpm, () => env.npm_execpath);
  requireGate(npmCli && path.isAbsolute(npmCli), 'npm_runtime_unavailable');
  await command(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], 'locked_dependency_install');

  const checks = [];
  const invocation = `https://github.com/${BUILD_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`;
  const fullSuiteStarted = now().toISOString();
  await command(process.execPath, [npmCli, 'test'], 'full_source_suite');
  const fullSuiteFinished = now().toISOString();
  for (const name of ['contracts', 'installer', 'security', 'operations', 'updates']) {
    checks.push({ testId: name, status: 'PASS', scope: 'unit', sourceRevision: options.sourceSha, lockfileSha256: sourceLockSha256, method: 'npm test (complete source suite, including catalog, federation and routing)', environment: 'isolated_ci', startedAt: fullSuiteStarted, finishedAt: fullSuiteFinished, evidenceRefs: [invocation], observed: { sourceTestsOnly: true, includedSuite: name, sharedFullSuiteExecution: true } });
  }
  await command(process.execPath, [npmCli, 'run', 'build'], 'source_build');
  await command(process.execPath, [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'install', '--with-deps', 'chromium'], 'browser_runtime');
  const browserStarted = now().toISOString();
  await command(process.execPath, [npmCli, 'run', 'test:browser'], 'browser_suite');
  checks.push({ testId: 'browser', status: 'PASS', scope: 'browser', sourceRevision: options.sourceSha, lockfileSha256: sourceLockSha256, method: 'npm run test:browser against credential-free local source build', environment: 'isolated_ci', startedAt: browserStarted, finishedAt: now().toISOString(), evidenceRefs: [invocation], observed: { sourceTestsOnly: true } });

  const buildEnvironment = { ...commandOptions.env, VERCEL_TOKEN: env.VERCEL_TOKEN, VERCEL_PROJECT_ID: options.projectId, VERCEL_ORG_ID: options.teamId };
  const savedEnvironment = commandOptions.env;
  await verifyToolchain(env, root);
  commandOptions.env = buildEnvironment;
  try {
    await command(process.execPath, [cli, 'pull', '--yes', '--environment=production', '--scope', options.teamId], 'production_configuration_pull');
    const link = JSON.parse(await fs.readFile(path.join(root, '.vercel', 'project.json'), 'utf8'));
    requireGate(link.projectId === options.projectId && link.orgId === options.teamId, 'production_project_link_mismatch');
    await command(process.execPath, [cli, 'build', '--prod', '--yes', '--scope', options.teamId], 'production_prebuilt_build');
  } finally { commandOptions.env = savedEnvironment; }
  await cleanSource();
  requireGate(sha256(await fs.readFile(path.join(root, 'package-lock.json'))) === sourceLockSha256 && sha256(await fs.readFile(path.join(root, 'config', 'operating-policy.json'))) === policySha256, 'source_inputs_changed_during_build');
  const artifact = await packageBuildOutput(path.join(root, '.vercel', 'output'), { projectId: options.projectId, teamId: options.teamId, sourceCommit: options.sourceSha });
  parseBuildOutput(artifact, { projectId: options.projectId, teamId: options.teamId, sourceCommit: options.sourceSha });
  const artifactSha256 = sha256(artifact);
  for (const check of checks) Object.assign(check.observed, { artifactSha256, policySha256 });
  for (const testId of ['protocol', 'final-smoke', 'staged-observation']) checks.push({ testId, status: 'NOT_RUN', scope: testId === 'protocol' ? 'protocol' : 'release', sourceRevision: options.sourceSha, lockfileSha256: sourceLockSha256, method: 'Requires this exact artifact on a real staged production deployment', environment: 'staged_production', startedAt: null, finishedAt: null, evidenceRefs: [], observed: { artifactSha256, policySha256 }, reason: 'Producer builds and signs only; no deployment or production mutation is authorized here.' });
  const evidenceBytes = Buffer.from(JSON.stringify(checks, null, 2) + '\n');
  const lock = JSON.parse(lockfileBytes);
  const sbom = { bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, metadata: { timestamp: now().toISOString(), component: { type: 'application', name: lock.name || 'Soren-MCP_1', version: lock.version || options.sourceSha } }, components: Object.entries(lock.packages || {}).filter(([name, component]) => name && component.version).map(([name, component]) => ({ type: 'library', name: component.name || name.split('node_modules/').at(-1), version: component.version, properties: [{ name: 'npm:lockfile:path', value: name }, ...(component.integrity ? [{ name: 'npm:integrity', value: component.integrity }] : [])] })) };
  const sbomBytes = Buffer.from(JSON.stringify(sbom, null, 2) + '\n');
  const finishedAt = now();
  const identity = `https://github.com/${BUILD_REPOSITORY}/${BUILD_WORKFLOW}@${BUILD_REF}`;
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      { name: 'artifact.tar', digest: { sha256: artifactSha256 } },
      { name: 'verification-evidence.json', digest: { sha256: sha256(evidenceBytes) } },
    ],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://github.com/sorensadrgit-art/Soren-MCP_1/production-prebuilt/v1',
        externalParameters: {
          workflow: { repository: `https://github.com/${BUILD_REPOSITORY}`, path: BUILD_WORKFLOW, ref: BUILD_REF },
          target: { projectId: options.projectId, teamId: options.teamId, environment: 'production' },
          toolchainReviewRef: env.SOREN_BUILD_TOOLCHAIN_REVIEW_REF,
          ownerInputs: {
            expectedParentDeploymentId: options.expectedParentDeploymentId,
            catalogGeneration: options.catalogGeneration,
            schemaMinimum: options.schemaMinimum,
            schemaMaximum: options.schemaMaximum,
            approvalIdReservations: options.approvalIds,
          },
        },
        resolvedDependencies: [
          { uri: `git+https://github.com/${BUILD_REPOSITORY}@${BUILD_REF}`, digest: { gitCommit: options.sourceSha } },
          { uri: 'file:package-lock.json', digest: { sha256: sourceLockSha256 } },
          { uri: 'file:config/operating-policy.json', digest: { sha256: policySha256 } },
          { uri: 'file:reviewed-vercel-cli', digest: { sha256: env.SOREN_VERCEL_CLI_SHA256 } },
        ],
      },
      runDetails: { builder: { id: identity }, metadata: { invocationId: invocation, finishedOn: finishedAt.toISOString() } },
    },
  };
  statement.subject.push({ name: 'sbom.cdx.json', digest: { sha256: sha256(sbomBytes) } });
  statement.predicate.buildDefinition.resolvedDependencies.push({ uri: 'file:owner-reviewed-toolchain-manifest', digest: { sha256: toolchain.sha256 } });
  statement.predicate.buildDefinition.externalParameters.toolchainAuditStatus = toolchain.auditStatus;
  const sigstore = dependencies.attest && dependencies.verifyBundle ? null : await import('sigstore');
  const bundle = await (dependencies.attest || sigstore.attest)(Buffer.from(JSON.stringify(statement)), 'application/vnd.in-toto+json', { tlogUpload: true, timeout: 10000, retry: 0 });
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await (dependencies.verifyBundle || sigstore.verify)(bundle, { certificateIssuer: 'https://token.actions.githubusercontent.com', certificateIdentityURI: `^${escaped}$`, tlogThreshold: 1, ctLogThreshold: 1, timeout: 10000, retry: 0 });
  requireGate(bundle.dsseEnvelope?.payloadType === 'application/vnd.in-toto+json' && Buffer.from(bundle.dsseEnvelope.payload, 'base64').equals(Buffer.from(JSON.stringify(statement))), 'signed_statement_mismatch');
  const bundleBytes = Buffer.from(JSON.stringify(bundle, null, 2) + '\n');
  const manifest = {
    schemaVersion: 1,
    releaseId: `gha-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
    sourceCommit: options.sourceSha,
    lockfileSha256: sourceLockSha256,
    artifactSha256,
    policySha256,
    environment: 'production',
    projectId: options.projectId,
    expectedParentDeploymentId: options.expectedParentDeploymentId,
    catalogGeneration: options.catalogGeneration,
    schemaCompatibility: { minimum: options.schemaMinimum, maximum: options.schemaMaximum, destructiveMigration: false },
    approvalIds: options.approvalIds,
    provenance: { method: 'verified_ci_attestation', verificationReference: `sha256:${sha256(bundleBytes)}`, trustedIdentity: identity },
    createdAt: finishedAt.toISOString(),
    expiresAt: new Date(+finishedAt + 60 * 60_000).toISOString(),
  };
  const { parseManifest } = await import('../lib/updates/verification.mjs');
  parseManifest(Buffer.from(JSON.stringify(manifest)), +finishedAt);
  await fs.mkdir(output, { recursive: false, mode: 0o700 });
  for (const [name, bytes] of [['artifact.tar', artifact], ['package-lock.json', lockfileBytes], ['evidence.json', evidenceBytes], ['verification-evidence.json', evidenceBytes], ['sbom.cdx.json', sbomBytes], ['provenance.sigstore.json', bundleBytes], ['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')]]) await fs.writeFile(path.join(output, name), bytes, { flag: 'wx', mode: 0o600 });
  return { status: 'SIGNED_STAGE_CANDIDATE', releaseId: manifest.releaseId, artifactSha256, manifestSha256: sha256(await fs.readFile(path.join(output, 'manifest.json'))), outputDirectory: output, promotionEligible: false, humanApprovalGranted: false, productionModified: false, blockedChecks: ['protocol', 'final-smoke', 'staged-observation'], stagedEvidenceGate: 'Fresh trusted staged-production verification needs a new attestation, new releaseId and manifest with fresh owner authorization for the same artifact and deployment; this producer supplies no staged verifier.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  produceRelease(producerOptions()).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(cause => {
    process.stderr.write(JSON.stringify({ status: 'BLOCKED', reason: /^[a-z0-9_:.-]+$/.test(cause.code || cause.message) ? (cause.code || cause.message) : 'trusted_release_producer_failed', productionModified: false }) + '\n');
    process.exitCode = 2;
  });
}
