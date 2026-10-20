#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
  const metadata = { name: 'soren-agents-installer', version: source.version, private: true, type: 'module', bin: { 'soren-setup-agents': 'scripts/setup-agents.mjs' }, engines: source.engines, dependencies: Object.fromEntries(['jsonc-parser', '@iarna/toml', '@modelcontextprotocol/client'].map(name => [name, source.dependencies[name]])) };
  if (Object.values(metadata.dependencies).some(version => !/^\d+\.\d+\.\d+$/.test(version))) throw new Error('INSTALLER_DEPENDENCIES_MUST_BE_PINNED');
  await fs.writeFile(path.join(staging, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
  // Use npm bundled with this runtime; a parent npm launcher may rewrite pack JSON.
  const bundledNpm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCli = await fs.access(bundledNpm).then(() => bundledNpm, () => process.env.npm_execpath);
  if (!npmCli) throw new Error('NPM_RUNTIME_UNAVAILABLE');
  const originalLockBytes = await fs.readFile(path.join(root, 'package-lock.json'));
  const originalLock = JSON.parse(originalLockBytes);
  await fs.writeFile(path.join(staging, 'package-lock.json'), originalLockBytes);
  execFileSync(process.execPath, [npmCli, 'install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], { cwd: staging, encoding: 'utf8', timeout: 60000, windowsHide: true });
  const installerLock = JSON.parse(await fs.readFile(path.join(staging, 'package-lock.json'), 'utf8'));
  for (const [name, entry] of Object.entries(installerLock.packages)) {
    if (name && (entry.version !== originalLock.packages[name]?.version || entry.integrity !== originalLock.packages[name]?.integrity)) throw new Error('UNREVIEWED_INSTALLER_DEPENDENCY');
  }
  await fs.rename(path.join(staging, 'package-lock.json'), path.join(staging, 'npm-shrinkwrap.json'));
  const packed = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], { cwd: staging, encoding: 'utf8', timeout: 60000, windowsHide: true }));
  if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0].filename !== 'string') throw new Error('NPM_PACK_RESULT_INVALID');
  const artifactPath = path.join(destination, packed[0].filename);
  const bytes = await fs.readFile(artifactPath);
  let sourceRevision = 'UNCOMMITTED';
  let sourceDirty = true;
  try { sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); } catch { /* Initial checkout can be packaged before the first commit. */ }
  try { sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--', 'installer', 'scripts/setup-agents.mjs', 'scripts/package-installer.mjs', 'lib/client-contract.mjs', 'docs/installer.md', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()); } catch { /* Unknown worktree state remains dirty. */ }
  const manifest = { schemaVersion: 1, file: packed[0].filename, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceRevision, sourceDirty, sourceLockfileSha256: createHash('sha256').update(originalLockBytes).digest('hex'), provenance: 'local-reviewed-source-checkout', signed: false, files: packed[0].files.map(item => item.path) };
  await fs.writeFile(artifactPath + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ artifactPath, manifestPath: artifactPath + '.manifest.json', signed: false }) + '\n');
} finally { await fs.rm(staging, { recursive: true, force: true }); }
