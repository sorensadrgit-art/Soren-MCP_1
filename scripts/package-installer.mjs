#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

function lockedRuntimeClosure(lock, dependencies) {
  const packages = {};
  function resolveDependency(from, name) {
    let parent = from;
    while (true) {
      const location = `${parent ? parent + '/' : ''}node_modules/${name}`;
      if (lock.packages[location]) return location;
      if (!parent) return null;
      const nested = parent.lastIndexOf('/node_modules/');
      parent = nested < 0 ? '' : parent.slice(0, nested);
    }
  }
  const pending = Object.entries(dependencies).map(([name, version]) => {
    const location = resolveDependency('', name);
    if (!location || lock.packages[location].version !== version) throw new Error('UNREVIEWED_INSTALLER_DEPENDENCY');
    return location;
  });
  while (pending.length) {
    const location = pending.pop();
    if (packages[location]) continue;
    const entry = lock.packages[location];
    if (entry.link || !entry.integrity || !entry.resolved?.startsWith('https://')) throw new Error('UNREVIEWED_INSTALLER_DEPENDENCY');
    packages[location] = {...entry};
    delete packages[location].dev;
    delete packages[location].devOptional;
    for (const name of Object.keys({...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies})) {
      const dependency = resolveDependency(location, name);
      if (dependency) pending.push(dependency);
      else if (!Object.hasOwn(entry.optionalDependencies || {}, name) && !entry.peerDependenciesMeta?.[name]?.optional) throw new Error('INSTALLER_DEPENDENCY_CLOSURE_INCOMPLETE');
    }
  }
  return Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b)));
}

// Build a local reviewed-source tarball. This command never publishes to npm.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(process.argv[2] || path.join(root, 'artifacts', 'installer'));
await fs.mkdir(destination, { recursive: true });
const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'soren-installer-package-'));
try {
  await fs.mkdir(path.join(staging, 'scripts'));
  await fs.mkdir(path.join(staging, 'lib'));
  await fs.cp(path.join(root, 'installer'), path.join(staging, 'installer'), { recursive: true });
  await fs.copyFile(path.join(root, 'scripts', 'setup-agents.mjs'), path.join(staging, 'scripts', 'setup-agents.mjs'));
  await fs.copyFile(path.join(root, 'lib', 'client-contract.mjs'), path.join(staging, 'lib', 'client-contract.mjs'));
  await fs.copyFile(path.join(root, 'docs', 'installer.md'), path.join(staging, 'README.md'));
  const source = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const metadata = { name: 'soren-agents-installer', version: source.version, private: true, type: 'module', bin: { 'soren-setup-agents': 'scripts/setup-agents.mjs' }, engines: source.engines, dependencies: Object.fromEntries(['jsonc-parser', '@iarna/toml', '@modelcontextprotocol/client'].map(name => [name, source.dependencies[name]])), bundleDependencies: ['jsonc-parser', '@iarna/toml', '@modelcontextprotocol/client'] };
  if (Object.values(metadata.dependencies).some(version => !/^\d+\.\d+\.\d+$/.test(version))) throw new Error('INSTALLER_DEPENDENCIES_MUST_BE_PINNED');
  await fs.writeFile(path.join(staging, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
  // Use npm bundled with this runtime; a parent npm launcher may rewrite pack JSON.
  const bundledNpm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const unixNpm = path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCli = await fs.access(bundledNpm).then(() => bundledNpm, () => fs.access(unixNpm).then(() => unixNpm, () => process.env.npm_execpath));
  if (!npmCli) throw new Error('NPM_RUNTIME_UNAVAILABLE');
  const originalLockBytes = await fs.readFile(path.join(root, 'package-lock.json'));
  const originalLock = JSON.parse(originalLockBytes);
  const closure = lockedRuntimeClosure(originalLock, metadata.dependencies);
  const installerLock = { name: metadata.name, version: metadata.version, lockfileVersion: 3, requires: true, packages: { '': metadata, ...closure } };
  await fs.writeFile(path.join(staging, 'npm-shrinkwrap.json'), JSON.stringify(installerLock, null, 2) + '\n');
  // ci consumes exact locked tarballs; pack includes their runtime closure.
  execFileSync(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--offline', '--omit=dev', '--no-audit', '--no-fund'], { cwd: staging, encoding: 'utf8', timeout: 60000, windowsHide: true });
  for (const [name, entry] of Object.entries(installerLock.packages)) {
    if (name && (entry.version !== originalLock.packages[name]?.version || entry.integrity !== originalLock.packages[name]?.integrity)) throw new Error('UNREVIEWED_INSTALLER_DEPENDENCY');
  }
  const packed = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--offline', '--pack-destination', destination], { cwd: staging, encoding: 'utf8', timeout: 60000, windowsHide: true }));
  if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0].filename !== 'string') throw new Error('NPM_PACK_RESULT_INVALID');
  const artifactPath = path.join(destination, packed[0].filename);
  const bytes = await fs.readFile(artifactPath);
  let sourceRevision = 'UNCOMMITTED';
  let sourceDirty = true;
  try { sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); } catch { /* Initial checkout can be packaged before the first commit. */ }
  try { sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--', 'installer', 'scripts/setup-agents.mjs', 'scripts/package-installer.mjs', 'lib/client-contract.mjs', 'docs/installer.md', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()); } catch { /* Unknown worktree state remains dirty. */ }
  const manifest = { schemaVersion: 1, file: packed[0].filename, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceRevision, sourceDirty, sourceLockfileSha256: createHash('sha256').update(originalLockBytes).digest('hex'), provenance: 'local-reviewed-source-checkout', signed: false, dependencyDistribution: 'bundled-locked-runtime-closure', bundledDependencies: Object.entries(closure).map(([location, entry]) => ({ path: location, version: entry.version, integrity: entry.integrity })), files: packed[0].files.map(item => item.path) };
  await fs.writeFile(artifactPath + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ artifactPath, manifestPath: artifactPath + '.manifest.json', signed: false }) + '\n');
} finally { await fs.rm(staging, { recursive: true, force: true }); }
