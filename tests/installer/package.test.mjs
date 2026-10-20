import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('actual npm tarball installs with an empty offline cache and inspects six isolated clients', { timeout: 90000 }, async t => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'soren-package-test-'));
  t.after(() => fs.rm(staging, { recursive: true, force: true }));
  const bundledNpm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const unixNpm = path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCli = await fs.access(bundledNpm).then(() => bundledNpm, () => fs.access(unixNpm).then(() => unixNpm, () => process.env.npm_execpath));
  assert.ok(npmCli, 'npm runtime is required');
  const sourceCache = execFileSync(process.execPath, [npmCli, 'config', 'get', 'cache'], {cwd: root, encoding: 'utf8', windowsHide: true}).trim();
  const producerCache = path.join(staging, 'locked-content-only-cache');
  const sourceLock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const seeded = new Set();
  // Copy verified tarball content only, never packument/index entries from a warm cache.
  for (const entry of Object.values(sourceLock.packages)) {
    const match = /^(sha512|sha256)-([A-Za-z0-9+/]+={0,2})$/.exec(entry.integrity || '');
    if (!match || seeded.has(entry.integrity)) continue;
    const digest = Buffer.from(match[2], 'base64').toString('hex');
    const relative = path.join('_cacache', 'content-v2', match[1], digest.slice(0, 2), digest.slice(2, 4), digest.slice(4));
    const bytes = await fs.readFile(path.join(sourceCache, relative)).catch(error => {if (error.code === 'ENOENT') return null; throw error;});
    if (!bytes) continue; // Other-platform optional tarballs need not have been installed.
    assert.equal(createHash(match[1]).update(bytes).digest('base64'), match[2]);
    await fs.mkdir(path.dirname(path.join(producerCache, relative)), {recursive: true});
    await fs.writeFile(path.join(producerCache, relative), bytes);
    seeded.add(entry.integrity);
  }
  await assert.rejects(fs.access(path.join(producerCache, '_cacache', 'index-v5')));
  const producerEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'npm_config_cache'));
  producerEnv.npm_config_cache = producerCache;
  producerEnv.npm_config_update_notifier = 'false';
  const packed = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts', 'package-installer.mjs'), path.join(staging, 'artifacts')], { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true, env: producerEnv }));
  const manifest = JSON.parse(await fs.readFile(packed.manifestPath, 'utf8'));
  assert.equal(manifest.sha256, createHash('sha256').update(await fs.readFile(packed.artifactPath)).digest('hex'));
  assert.equal(manifest.signed, false);
  assert.ok(manifest.files.includes('npm-shrinkwrap.json'));
  assert.equal(manifest.dependencyDistribution, 'bundled-locked-runtime-closure');
  for (const entry of manifest.bundledDependencies) {
    assert.equal(entry.version, sourceLock.packages[entry.path].version);
    assert.equal(entry.integrity, sourceLock.packages[entry.path].integrity);
    assert.ok(seeded.has(entry.integrity), 'every bundled dependency came from locked tarball content');
    assert.ok(manifest.files.includes(entry.path + '/package.json'));
  }
  assert.ok(!manifest.files.some(file => /(?:\.env|local-inventory|\.before)$/.test(file)));
  const installation = path.join(staging, 'installation');
  const consumerCache = path.join(staging, 'empty-consumer-cache');
  await fs.mkdir(consumerCache);
  assert.deepEqual(await fs.readdir(consumerCache), []);
  execFileSync(process.execPath, [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', '--cache', consumerCache, '--prefix', installation, packed.artifactPath], { encoding: 'utf8', timeout: 60000, windowsHide: true, env: producerEnv });
  for (const entry of manifest.bundledDependencies) {
    const installed = JSON.parse(await fs.readFile(path.join(installation, 'node_modules', 'soren-agents-installer', entry.path, 'package.json'), 'utf8'));
    assert.equal(installed.version, entry.version);
  }
  t.diagnostic(`Archive ${manifest.size} bytes; ${manifest.bundledDependencies.length} locked runtime packages; producer had verified tarball content only, consumer cache was empty.`);
  const fixtureHome = path.join(staging, 'fixture-home');
  await fs.mkdir(fixtureHome);
  const cli = path.join(installation, 'node_modules', 'soren-agents-installer', 'scripts', 'setup-agents.mjs');
  const output = execFileSync(process.execPath, [cli, 'inspect', '--agents', 'all'], { cwd: fixtureHome, encoding: 'utf8', timeout: 30000, windowsHide: true, env: { ...process.env, USERPROFILE: fixtureHome, HOME: fixtureHome, LOCALAPPDATA: path.join(fixtureHome,'AppData','Local'), APPDATA: path.join(fixtureHome,'AppData','Roaming'), CODEX_HOME: '', PATH: '' } });
  const report = JSON.parse(output);
  assert.equal(report.clients.length, 6);
  assert.ok(report.clients.every(client => client.detection === 'EXECUTABLE_MISSING'));
  assert.equal(report.residentService, false);
  await assert.rejects(fs.access(path.join(fixtureHome, '.soren-installer')));
});
