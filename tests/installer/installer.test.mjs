import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADAPTERS, context, locations, GUIDE_BLOCK } from '../../installer/adapters.mjs';
import { parseConfig, editConfig, editGuide, getAt, equal } from '../../installer/editors.mjs';
import { plan, apply, inspect, remove, reconcile, verify, readFile, atomicWrite, sha256 } from '../../installer/transaction.mjs';
const fixtures = JSON.parse(await fs.readFile(new URL('./fixtures/clients.json', import.meta.url), 'utf8'));

async function sandbox(t, clients = Object.keys(ADAPTERS)) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'soren-installer-test-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const detections = Object.fromEntries(clients.map(client => [client, { executable: 'fixture-only', version: fixtures.versions[client], compatible: true, detection: 'DETECTED', adapterVersion: `1.0.0/${client}@${fixtures.versions[client]}` }]));
  const ctx = context({ home, cwd: home, env: { PATH: '' }, platform: 'win32', detections });
  for (const client of clients) {
    const { target, guide } = locations(client, ctx);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.mkdir(path.dirname(guide), { recursive: true });
    await fs.writeFile(target, fixtures[ADAPTERS[client].format === 'toml' ? 'toml' : 'jsonc']);
    await fs.writeFile(guide, 'User instructions: preserve this.\r\n');
  }
  return ctx;
}

for (const client of Object.keys(ADAPTERS)) test(`${client}: BOM, CRLF, Unicode, comments and unrelated values survive install/remove`, async t => {
  const ctx = await sandbox(t, [client]);
  const { target, guide } = locations(client, ctx);
  const before = await fs.readFile(target, 'utf8');
  const changed = editConfig(before, client, ADAPTERS[client].entry);
  assert.ok(changed.startsWith('\uFEFF'));
  assert.ok(changed.includes('夜'));
  assert.ok(changed.includes('Keep Unicode'));
  assert.ok(!changed.replaceAll('\r\n', '').includes('\n'));
  assert.deepEqual(getAt(parseConfig(changed, ADAPTERS[client].format), ADAPTERS[client].key), ADAPTERS[client].entry);
  assert.equal(editConfig(changed, client, ADAPTERS[client].entry), changed);
  const restored = editConfig(changed, client, undefined);
  assert.equal(getAt(parseConfig(restored, ADAPTERS[client].format), ADAPTERS[client].key), undefined);
  assert.equal(parseConfig(restored, ADAPTERS[client].format).credential, 'fixture-secret-never-in-journal');
  assert.equal(await fs.readFile(guide, 'utf8'), 'User instructions: preserve this.\r\n');
});

test('six-client transaction is idempotent, journal is secret-free, and later unrelated user edits survive removal', async t => {
  const ctx = await sandbox(t);
  const installPlan = await plan(Object.keys(ADAPTERS), ctx);
  assert.ok(!JSON.stringify(installPlan).includes('fixture-secret'));
  const receipt = await apply(installPlan, ctx);
  assert.equal(receipt.status, 'CONFIGURED', JSON.stringify(receipt));
  assert.ok(!JSON.stringify(receipt).includes('fixture-secret'));
  assert.equal((await verify(receipt.receiptPath, 'configured', ctx)).status, 'PASS');
  assert.equal((await verify(receipt.receiptPath, 'native', ctx)).status, 'BLOCKED');
  const before = await Promise.all(receipt.clients.map(item => fs.readFile(item.targetPath)));
  const second = await apply(installPlan, ctx);
  assert.equal(second.status, 'CONFIGURED');
  const after = await Promise.all(receipt.clients.map(item => fs.readFile(item.targetPath)));
  assert.deepEqual(after, before);
  for (const item of receipt.clients) {
    if (ADAPTERS[item.client].format === 'toml') await fs.appendFile(item.targetPath, '\r\n[user_added]\r\nkeep = true\r\n');
    else {
      const text = await fs.readFile(item.targetPath, 'utf8');
      await fs.writeFile(item.targetPath, text.replace('"theme": "夜"', '"theme": "later edit"'));
    }
    await fs.appendFile(item.guidePath, 'Later user instruction.\r\n');
  }
  const removed = await remove(receipt.receiptPath, ctx);
  assert.equal(removed.status, 'REMOVED', JSON.stringify(removed));
  assert.equal((await remove(receipt.receiptPath, ctx)).status, 'REMOVED');
  for (const item of receipt.clients) {
    const text = await fs.readFile(item.targetPath, 'utf8');
    assert.ok(text.includes(ADAPTERS[item.client].format === 'toml' ? 'user_added' : 'later edit'));
    assert.ok((await fs.readFile(item.guidePath, 'utf8')).includes('Later user instruction.'));
  }
});

test('unknown version and missing executable produce no-write plans', async t => {
  const ctx = await sandbox(t, ['factory']);
  ctx.detections.factory = { ...ctx.detections.factory, compatible: false, version: '999.0.0', adapterVersion: '1.0.0/factory@999.0.0' };
  const unknown = await plan(['factory'], ctx);
  assert.equal(unknown.clients[0].plannedChanges[0].blockedReason, 'UNKNOWN_CLIENT_VERSION');
  await assert.rejects(apply(unknown, ctx), /UNKNOWN_CLIENT_VERSION/);
  delete ctx.detections.factory;
  assert.equal((await inspect(['factory'], ctx)).clients[0].detection, 'EXECUTABLE_MISSING');
});

test('checksum drift is rejected and preserved; expiry and caller identity refuse writes', async t => {
  const ctx = await sandbox(t, ['qwen']);
  const installPlan = await plan(['qwen'], ctx);
  const target = locations('qwen', ctx).target;
  await fs.appendFile(target, '// concurrent edit\r\n');
  const receipt = await apply(installPlan, ctx);
  assert.equal(receipt.status, 'PARTIAL');
  assert.equal(receipt.failure, 'CONFLICT');
  assert.ok((await fs.readFile(target, 'utf8')).includes('concurrent edit'));
  await assert.rejects(apply({ ...installPlan, hostIdentity: 'wrong' }, ctx), /INVALID_PLAN_IDENTITY/);
  await assert.rejects(apply({ ...installPlan, expiresAt: installPlan.createdAt }, ctx), /PLAN_EXPIRED/);
});

test('duplicates, project overrides, plugin ownership, malformed configs and edited guide refuse plans', async t => {
  const ctx = await sandbox(t, ['claude']);
  const project = path.join(ctx.home, 'project');
  await fs.mkdir(project);
  ctx.cwd = project;
  await fs.writeFile(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { 'soren-skills': ADAPTERS.claude.entry } }));
  assert.equal((await plan(['claude'], ctx)).clients[0].plannedChanges[0].blockedReason, 'SHADOWING_SCOPE');
  await fs.rm(path.join(project, '.mcp.json'));
  const plugin = path.join(ctx.home, '.claude', 'plugins', 'cache', 'test');
  await fs.mkdir(plugin, { recursive: true });
  await fs.writeFile(path.join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { 'soren-skills': ADAPTERS.claude.entry } }));
  assert.equal((await plan(['claude'], ctx)).clients[0].plannedChanges[0].blockedReason, 'PLUGIN_OWNERSHIP_CONFLICT');
  await fs.rm(plugin, { recursive: true });
  await fs.writeFile(locations('claude', ctx).target, '{ invalid');
  assert.equal((await plan(['claude'], ctx)).clients[0].plannedChanges[0].blockedReason, 'INVALID_CONFIG');
  assert.throws(() => editGuide('<!-- soren-skills:managed:start -->'), /INVALID_MANAGED_GUIDE/);
});

test('symlink or junction, outside-home target and read-only config fail safely', async t => {
  const ctx = await sandbox(t, ['factory']);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'soren-installer-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  const link = path.join(ctx.home, 'linked');
  await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readFile(path.join(link, 'file'), ctx), /SYMLINK_OR_REPARSE_POINT/);
  await assert.rejects(readFile(path.join(outside, 'file'), ctx), /PATH_OUTSIDE_HOME/);
  const target = locations('factory', ctx).target;
  const file = await readFile(target, ctx);
  await fs.chmod(target, 0o444);
  t.after(() => fs.chmod(target, 0o600).catch(() => {}));
  await assert.rejects(atomicWrite(target, '{}', file.hash, ctx), /CONFIG_READ_ONLY/);
});

test('atomic writer refuses concurrent edit before rename and leaves no sibling temporary', async t => {
  const ctx = await sandbox(t, ['factory']);
  const target = locations('factory', ctx).target;
  const file = await readFile(target, ctx);
  ctx.beforeRename = async actual => { if (actual === target) await fs.appendFile(target, '// concurrent\n'); };
  await assert.rejects(atomicWrite(target, '{}', file.hash, ctx), /CONFLICT/);
  assert.ok((await fs.readFile(target, 'utf8')).includes('concurrent'));
  assert.ok(!(await fs.readdir(path.dirname(target))).some(name => name.startsWith('.soren-')));
});

test('interrupted two-file install reconciles observed state and can remove only completed owned entry', async t => {
  const ctx = await sandbox(t, ['qwen']);
  ctx.afterConfigWrite = () => { throw new Error('SIMULATED_CRASH'); };
  const receipt = await apply(await plan(['qwen'], ctx), ctx);
  assert.equal(receipt.status, 'PARTIAL');
  assert.equal((await reconcile(receipt.receiptPath, ctx)).clients[0].observedState, 'CONFIG_WRITTEN');
  assert.equal((await remove(receipt.receiptPath, ctx)).status, 'REMOVED');
});

test('edited owned entry or block is preserved and requires manual reconciliation', async t => {
  const ctx = await sandbox(t, ['qwen']);
  const receipt = await apply(await plan(['qwen'], ctx), ctx);
  const target = locations('qwen', ctx).target;
  const bytes = await fs.readFile(target, 'utf8');
  await fs.writeFile(target, bytes.replace('soren-shared-mcp-skills.vercel.app', 'user.example'));
  const edited = await fs.readFile(target);
  const removed = await remove(receipt.receiptPath, ctx);
  assert.equal(removed.status, 'PARTIAL');
  assert.equal(removed.clients[0].state, 'MANUAL_RECONCILIATION_REQUIRED');
  assert.deepEqual(await fs.readFile(target), edited);
});

test('guide update has one exact boundary and preserves outside text', () => {
  const text = 'before\r\n' + GUIDE_BLOCK.replaceAll('\n', '\r\n') + '\r\nafter\r\n';
  assert.equal(editGuide(text), text);
  assert.equal(editGuide(text, true), 'before\r\n\r\nafter\r\n');
  assert.throws(() => editGuide(text + GUIDE_BLOCK), /INVALID_MANAGED_GUIDE/);
});

test('TOML quoted/inline owned tables are refused instead of rewriting unrelated syntax', () => {
  const text = '[mcp_servers."soren-skills"]\nurl="https://wrong.example"\n';
  assert.throws(() => editConfig(text, 'codex', ADAPTERS.codex.entry), /UNSUPPORTED_TOML_OWNERSHIP_SHAPE/);
});

test('existing empty TOML parent table survives owned entry removal', () => {
  const original = '# User parent\r\n[mcp_servers]\r\n';
  const changed = editConfig(original, 'codex', ADAPTERS.codex.entry);
  const removed = editConfig(changed, 'codex', undefined);
  assert.ok(removed.includes('# User parent\r\n[mcp_servers]\r\n'));
});

test('duplicate JSON properties are refused rather than silently adopting the last alias', () => {
  assert.throws(() => parseConfig('{"mcpServers":{"soren-skills":{},"soren-skills":{}}}', 'jsonc'), /INVALID_CONFIG/);
});

test('existing transaction lock is never stolen or deleted', async t => {
  const ctx = await sandbox(t, ['qwen']);
  const directory = path.join(ctx.home, '.soren-installer');
  await fs.mkdir(directory);
  const lock = path.join(directory, 'transaction.lock');
  await fs.writeFile(lock, '{"pid":42}');
  await assert.rejects(apply(await plan(['qwen'], ctx), ctx), /TRANSACTION_LOCKED/);
  assert.equal(await fs.readFile(lock, 'utf8'), '{"pid":42}');
});

test('active Windows file-sharing lock fails without changing bytes', { skip: process.platform !== 'win32' }, async t => {
  const ctx = await sandbox(t, ['factory']);
  const target = locations('factory', ctx).target;
  const original = await fs.readFile(target);
  const ready = path.join(ctx.home, 'lock-ready');
  const release = path.join(ctx.home, 'lock-release');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./fixtures/hold-lock.ps1', import.meta.url)), target, ready, release], { stdio: 'ignore', windowsHide: true });
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { await fs.writeFile(release, 'release').catch(() => {}); await exited; });
  const deadline = Date.now() + 8000;
  while (true) {
    try { await fs.access(ready); break; } catch { if (Date.now() > deadline) { child.kill(); throw new Error('LOCK_FIXTURE_FAILED'); } await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  await assert.rejects(atomicWrite(target, '{}', sha256(original), ctx));
  await fs.writeFile(release, 'release');
  await exited;
  assert.deepEqual(await fs.readFile(target), original);
});

test('denied Windows directory DACL refuses atomic temporary-file creation and preserves original bytes', { skip: process.platform !== 'win32' }, async t => {
  const ctx = await sandbox(t, ['factory']);
  const target = locations('factory', ctx).target;
  const directory = path.dirname(target);
  const permissionProbe = path.join(directory, 'denied-dacl-probe.tmp');
  const original = await fs.readFile(target);
  const helper = fileURLToPath(new URL('./fixtures/denied-dacl.ps1', import.meta.url));
  const permission = (action, originalDacl) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, '-Action', action, '-Target', directory, ...(originalDacl ? ['-OriginalDacl', originalDacl] : [])], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim();
  const originalDacl = permission('Snapshot');
  const denied = error => ['EACCES', 'EPERM'].includes(error.code);
  try {
    permission('Deny');
    assert.notEqual(permission('Snapshot'), originalDacl);
    await assert.rejects(async () => { const handle = await fs.open(permissionProbe, 'wx'); await handle.close(); }, denied);
    await assert.rejects(atomicWrite(target, original.toString('utf8') + '\r\n', sha256(original), ctx), denied);
    assert.deepEqual(await fs.readFile(target), original);
    assert.equal((await fs.readdir(path.dirname(target))).some(name => /^\.soren-.*\.tmp$/.test(name)), false);
  } finally {
    permission('Restore', originalDacl);
  }
  assert.equal(permission('Snapshot'), originalDacl);
  const restored = await fs.open(permissionProbe, 'wx');
  await restored.close();
  await fs.rm(permissionProbe);
  assert.deepEqual(await fs.readFile(target), original);
});

test('actual CODEX_HOME outside the default home is the only additional writable scope', async t => {
  const ctx = await sandbox(t, ['codex']);
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'soren-codex-home-'));
  t.after(() => fs.rm(codexHome, { recursive: true, force: true }));
  ctx.env.CODEX_HOME = codexHome;
  const target = locations('codex', ctx).target;
  await fs.writeFile(target, fixtures.toml);
  const original = await readFile(target, ctx);
  await atomicWrite(target, editConfig(original.text, 'codex', ADAPTERS.codex.entry), original.hash, ctx);
  assert.deepEqual(getAt(parseConfig((await readFile(target, ctx)).text, 'toml'), ADAPTERS.codex.key), ADAPTERS.codex.entry);
  await assert.rejects(atomicWrite(path.join(codexHome, 'unrelated.txt'), 'blocked', null, ctx), /PATH_OUTSIDE_HOME/);
});

test('tampered semantic no-op plan cannot add an entry', async t => {
  const ctx = await sandbox(t, ['qwen']);
  const installPlan = await plan(['qwen'], ctx);
  installPlan.clients[0].plannedChanges[0].operation = 'no_op';
  const target = locations('qwen', ctx).target;
  const before = await fs.readFile(target);
  const result = await apply(installPlan, ctx);
  assert.equal(result.failure, 'PLAN_SEMANTIC_DELTA_MISMATCH');
  assert.deepEqual(await fs.readFile(target), before);
});

test('new comments inside owned JSONC or TOML section survive attempted removal', async t => {
  for (const client of ['qwen', 'codex']) {
    const ctx = await sandbox(t, [client]);
    const receipt = await apply(await plan([client], ctx), ctx);
    const target = locations(client, ctx).target;
    const text = await fs.readFile(target, 'utf8');
    const updated = client === 'codex' ? text + '# Later user comment\r\n' : text.replace('"httpUrl":', '// Later user comment\r\n      "httpUrl":');
    await fs.writeFile(target, updated);
    const removed = await remove(receipt.receiptPath, ctx);
    assert.equal(removed.status, 'PARTIAL');
    assert.equal(await fs.readFile(target, 'utf8'), updated);
  }
});
