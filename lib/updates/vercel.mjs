import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, lstat, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { LIMITS, requireGate, sha256 } from './policy.mjs';

const execFileAsync = promisify(execFile);
const safeFile = path => typeof path === 'string' && path && !path.includes('\\') && !path.includes(':') && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..');

export async function packageBuildOutput(directory, binding) {
  const files = []; let total = 0;
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      requireGate(safeFile(path) && !entry.isSymbolicLink(), 'unsafe_build_output');
      if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      else {
        requireGate(entry.isFile(), 'unsupported_build_output_entry');
        const bytes = await readFile(join(dir, entry.name)); total += bytes.length;
        requireGate(total <= LIMITS.maxArtifactBytes && files.length < LIMITS.maxArtifactFiles, 'build_output_limit');
        const stat = await lstat(join(dir, entry.name));
        files.push({ path, sha256: sha256(bytes), mode: stat.mode & 0o111 ? 0o755 : 0o644, data: bytes.toString('base64') });
      }
    }
  }
  await walk(directory);
  const artifact = Buffer.from(JSON.stringify({ format: 'soren-vercel-output-v1', ...binding, environment: 'production', files: files.sort((a, b) => a.path.localeCompare(b.path, 'en')) }));
  requireGate(artifact.length <= LIMITS.maxArtifactBytes, 'packaged_artifact_limit');
  return artifact;
}

export function parseBuildOutput(artifact, binding) {
  requireGate(Buffer.isBuffer(artifact) && artifact.length <= LIMITS.maxArtifactBytes, 'artifact_size_invalid');
  let pack; try { pack = JSON.parse(artifact); } catch { requireGate(false, 'build_output_package_invalid'); }
  requireGate(pack.format === 'soren-vercel-output-v1' && pack.environment === 'production' && pack.projectId === binding.projectId && pack.teamId === binding.teamId && pack.sourceCommit === binding.sourceCommit && Array.isArray(pack.files) && pack.files.length > 0 && pack.files.length <= LIMITS.maxArtifactFiles, 'build_output_binding_invalid');
  const names = new Set();
  for (const file of pack.files) {
    requireGate(safeFile(file.path) && !names.has(file.path) && [0o644, 0o755].includes(file.mode) && typeof file.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(file.data), 'build_output_file_invalid');
    const bytes = Buffer.from(file.data, 'base64');
    requireGate(bytes.toString('base64') === file.data && sha256(bytes) === file.sha256, 'build_output_file_digest_mismatch'); names.add(file.path);
  }
  requireGate(names.has('config.json'), 'build_output_config_missing');
  return pack;
}

/** Vercel's promote API has no expected-parent CAS field. Unattended promotion stays denied. */
export function createVercelProvider({ env = process.env, fetchImpl = fetch, run = execFileAsync, artifact, manifest }) {
  const projectId = env.SOREN_RELEASE_PROJECT_ID;
  const teamId = env.SOREN_RELEASE_TEAM_ID;
  const domains = (env.SOREN_PRODUCTION_DOMAINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  requireGate(projectId && teamId && env.VERCEL_TOKEN && domains.length > 0 && domains.every(domain => /^[a-z0-9.-]+$/.test(domain)), 'vercel_scope_or_credentials_missing');
  requireGate(manifest.projectId === projectId && manifest.environment === 'production', 'vercel_scope_changed');
  const pack = artifact ? parseBuildOutput(artifact, { projectId, teamId, sourceCommit: manifest.sourceCommit }) : null;
  const artifactSha256 = artifact ? sha256(artifact) : manifest.artifactSha256;
  requireGate(artifactSha256 === manifest.artifactSha256, 'vercel_artifact_digest_mismatch');
  async function request(path, { method = 'GET', body, raw = false, maximumBytes = 3 * 1024 * 1024 } = {}) {
    const url = new URL(path, 'https://api.vercel.com'); url.searchParams.set('teamId', teamId);
    const response = await fetchImpl(url, { method, redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    requireGate(response.ok, `vercel_api_status:${response.status}`);
    const reader = response.body?.getReader(); const chunks = []; let length = 0;
    if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > maximumBytes) { await reader.cancel(); requireGate(false, 'vercel_response_limit'); } chunks.push(value); }
    const bytes = Buffer.concat(chunks);
    if (raw && !/application\/json/.test(response.headers.get('content-type') ?? '')) return bytes;
    let result; try { result = JSON.parse(bytes); } catch { requireGate(false, 'vercel_response_invalid'); }
    if (raw) { const data = result.data ?? result.content; requireGate(typeof data === 'string' && (!result.encoding || result.encoding === 'base64'), 'vercel_file_response_invalid'); return Buffer.from(data, 'base64'); }
    return result;
  }
  const getDeployment = id => { requireGate(typeof id === 'string' && /^[a-zA-Z0-9._-]+$/.test(id), 'deployment_id_invalid'); return request(`/v13/deployments/${encodeURIComponent(id)}`); };
  const getProject = () => request(`/v9/projects/${encodeURIComponent(projectId)}`);
  const listAliases = () => request(`/v4/aliases?projectId=${encodeURIComponent(projectId)}&limit=100`);
  async function verifyFiles(id) {
    requireGate(pack, 'exact_artifact_bytes_required');
    const tree = await request(`/v6/deployments/${encodeURIComponent(id)}/files`);
    const flattened = new Map(); const seen = new Set();
    function visit(entries, prefix = '') {
      requireGate(Array.isArray(entries), 'vercel_file_tree_invalid');
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        requireGate(safeFile(path) && path.length <= 1024 && path.split('/').length <= 32 && !seen.has(path) && seen.size < LIMITS.maxArtifactFiles * 2, 'vercel_file_tree_duplicate_or_unsafe'); seen.add(path);
        if (entry.type === 'directory') visit(entry.children ?? [], path);
        else { requireGate(entry.type === 'file', 'vercel_file_tree_type_invalid'); flattened.set(path, entry.uid ?? entry.id); }
      }
    }
    visit(Array.isArray(tree) ? tree : tree.files);
    const expected = new Set(pack.files.map(file => `.vercel/output/${file.path}`));
    // The generated owner-bound project link is the only optional file outside the signed output tree.
    requireGate([...flattened.keys()].every(path => expected.has(path) || path === '.vercel/project.json') && [...expected].every(path => flattened.has(path)), 'remote_build_output_file_set_mismatch');
    for (const file of pack.files) {
      const idForFile = flattened.get(`.vercel/output/${file.path}`);
      requireGate(typeof idForFile === 'string', 'remote_prebuilt_file_not_exposed');
      const bytes = await request(`/v8/deployments/${encodeURIComponent(id)}/files/${encodeURIComponent(idForFile)}`, { raw: true, maximumBytes: Math.min(LIMITS.maxArtifactBytes + 4096, file.data.length + 4096) });
      requireGate(sha256(bytes) === file.sha256, 'remote_build_output_digest_mismatch');
    }
    if (flattened.has('.vercel/project.json')) {
      const bytes = await request(`/v8/deployments/${encodeURIComponent(id)}/files/${encodeURIComponent(flattened.get('.vercel/project.json'))}`, { raw: true });
      requireGate(sha256(bytes) === sha256(JSON.stringify({ projectId, orgId: teamId })), 'remote_project_link_mismatch');
    }
    return true;
  }
  async function inspectDeploymentMetadata(id) {
    const deployment = await getDeployment(id);
    requireGate((deployment.projectId ?? deployment.project?.id) === projectId && deployment.target === 'production' && deployment.readyState === 'READY' && deployment.meta?.sorenArtifactSha256 === artifactSha256 && deployment.meta?.sorenSourceCommit === manifest.sourceCommit, 'vercel_deployment_binding_invalid');
    const aliases = await listAliases();
    requireGate(!aliases.pagination?.next, 'alias_page_not_complete');
    const assigned = (aliases.aliases ?? []).filter(alias => domains.includes(alias.alias) && (alias.deploymentId ?? alias.deployment?.id) === (deployment.id ?? id));
    return { deploymentId: deployment.id ?? id, projectId, environment: 'production', artifactSha256, productionConfiguration: true, productionDomainsAssigned: assigned.length > 0, aliasVerified: assigned.length === domains.length };
  }
  async function inspectDeployment(id) { const metadata = await inspectDeploymentMetadata(id); await verifyFiles(metadata.deploymentId); return { ...metadata, artifactBytesVerified: true }; }
  const activeDeployment = async () => { const project = await getProject(); requireGate(project.id === projectId && project.accountId === teamId, 'vercel_project_scope_changed'); return project.targets?.production?.id ?? project.targets?.production?.deploymentId ?? null; };
  async function inspectOperation(intent) {
    let target = intent.targetDeploymentId;
    if (!target && intent.kind === 'stage') {
      const listing = await request(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=20`);
      const matches = [];
      for (const row of listing.deployments ?? []) { const deployment = await getDeployment(row.uid ?? row.id); if (deployment.meta?.sorenOperationId === intent.operationId) matches.push(deployment.id); }
      if (matches.length !== 1) return { outcome: 'unknown' };
      [target] = matches;
    }
    if (!target) return { outcome: 'unknown' };
    try {
      const observed = await inspectDeployment(target); const activeDeploymentId = await activeDeployment();
      if (intent.kind === 'stage' ? observed.productionDomainsAssigned === false : activeDeploymentId === target && observed.aliasVerified) return { ...observed, activeDeploymentId, outcome: 'applied' };
      return { outcome: 'unknown' };
    } catch { return { outcome: 'unknown' }; }
  }
  async function promoteOrRollback(intent) {
    requireGate(intent.authorizationMode === 'manual', 'vercel_atomic_parent_cas_unavailable');
    requireGate(await activeDeployment() === intent.expectedParentDeploymentId, 'vercel_parent_changed');
    await inspectDeployment(intent.targetDeploymentId);
    const path = intent.kind === 'rollback' ? `/v1/projects/${encodeURIComponent(projectId)}/rollback/${encodeURIComponent(intent.targetDeploymentId)}` : `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(intent.targetDeploymentId)}`;
    return request(path, { method: 'POST', body: {} });
  }
  return {
    capabilities: { atomicCompareAndSwap: false, exactArtifactVerification: 'remote_prebuilt_file_bytes_required', source: 'Vercel documented production prebuilt stage and promotion APIs' },
    getDeployment, getProject, listAliases, listDeploymentFiles: id => request(`/v6/deployments/${encodeURIComponent(id)}/files`),
    getDeploymentFile: (id, fileId) => request(`/v8/deployments/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, { raw: true }),
    inspectDeployment, inspectDeploymentMetadata, inspectOperation, activeDeployment,
    async stage(intent) {
      requireGate(pack, 'exact_artifact_bytes_required');
      requireGate(intent.authorizationMode === 'manual' && await activeDeployment() === intent.expectedParentDeploymentId, 'owner_stage_parent_changed');
      const cli = env.SOREN_VERCEL_CLI_PATH;
      requireGate(cli && isAbsolute(cli) && sha256(await readFile(cli)) === env.SOREN_VERCEL_CLI_SHA256, 'reviewed_vercel_cli_required');
      const directory = await mkdtemp(join(tmpdir(), 'soren-release-'));
      try {
        for (const file of pack.files) { const path = join(directory, '.vercel', 'output', ...file.path.split('/')); await mkdir(dirname(path), { recursive: true }); await writeFile(path, Buffer.from(file.data, 'base64'), { flag: 'wx', mode: file.mode }); }
        await writeFile(join(directory, '.vercel', 'project.json'), JSON.stringify({ projectId, orgId: teamId }), { flag: 'wx', mode: 0o600 });
        const runtimeNames = ['PATH', 'Path', 'TMP', 'TEMP', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL'];
        const runtimeEnvironment = Object.fromEntries(runtimeNames.filter(name => env[name]).map(name => [name, env[name]]));
        await run(process.execPath, [cli, 'deploy', '--prebuilt', '--prod', '--skip-domain', '--yes', '--scope', teamId, '--meta', `sorenOperationId=${intent.operationId}`, '--meta', `sorenArtifactSha256=${artifactSha256}`, '--meta', `sorenSourceCommit=${manifest.sourceCommit}`], { cwd: directory, env: { ...runtimeEnvironment, HOME: directory, USERPROFILE: directory, APPDATA: directory, LOCALAPPDATA: directory, VERCEL_TOKEN: env.VERCEL_TOKEN, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: teamId }, timeout: 120_000, maxBuffer: 262_144, windowsHide: true });
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
    promote: promoteOrRollback, rollback: promoteOrRollback,
    inspectSchedules: async () => { const project = await getProject(); return project.crons ?? null; },
  };
}
