import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SERVER_ALIAS, ENDPOINT } from '../lib/client-contract.mjs';
import { ADAPTERS, context, detect, locations, scopePaths, GUIDE_BLOCK } from './adapters.mjs';
import { parseConfig, editConfig, editGuide, guideSection, getAt, equal, ownedSyntax } from './editors.mjs';
import { verifyProtocol } from './protocol.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const semanticPath = client => '/' + ADAPTERS[client].key.join('/');
const error = code => Object.assign(new Error(code), { code });
const samePath = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
export const hostIdentity = ctx => sha256(`${os.hostname()}\0${os.userInfo().username}\0${path.resolve(ctx.home)}`);

function writeRoot(target, ctx) {
  if (ctx.env.CODEX_HOME) {
    const codex = locations('codex', ctx);
    if (samePath(target, codex.target) || samePath(target, codex.guide)) return path.resolve(ctx.env.CODEX_HOME);
  }
  return ctx.home;
}

export async function safePath(target, root) {
  if (!path.isAbsolute(target) || target.includes('\0') || (process.platform === 'win32' && target.slice(2).includes(':'))) throw error('UNSAFE_PATH');
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw error('PATH_OUTSIDE_HOME');
  let cursor = path.parse(path.resolve(target)).root;
  for (const component of path.resolve(target).slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, component);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw error('SYMLINK_OR_REPARSE_POINT');
      const real = await fs.realpath(cursor);
      if (!samePath(real, cursor)) throw error('SYMLINK_OR_REPARSE_POINT');
      if (samePath(cursor, target) && !stat.isFile()) throw error('TARGET_NOT_REGULAR_FILE');
    } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  }
}

export async function readFile(target, ctx, inspectionOnly = false) {
  await safePath(target, inspectionOnly ? path.parse(target).root : writeRoot(target, ctx));
  try {
    const bytes = await fs.readFile(target);
    if (bytes.length > 2 * 1024 * 1024) throw error('CONFIG_TOO_LARGE');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { bytes, text, hash: sha256(bytes), mode: (await fs.stat(target)).mode & 0o777 };
  } catch (cause) {
    if (cause.code !== 'ENOENT') throw cause;
    return { bytes: null, text: '', hash: null, mode: 0o600 };
  }
}

function registrations(value, output = [], trail = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, entry] of Object.entries(value)) {
    if (entry && typeof entry === 'object') {
      const url = entry.url || entry.serverUrl || entry.httpUrl;
      if (key === SERVER_ALIAS || url === ENDPOINT || ['universal-skill-router', 'skill-registry'].includes(key)) output.push({ key, endpointMatches: url === ENDPOINT, path: [...trail, key].join('.') });
      registrations(entry, output, [...trail, key]);
    }
  }
  return output;
}

async function pluginDuplicates(client, ctx) {
  const roots = client === 'claude' ? [path.join(ctx.home, '.claude', 'plugins', 'cache')] : client === 'codex' ? [path.join(ctx.env.CODEX_HOME || path.join(ctx.home, '.codex'), 'plugins', 'cache')] : [];
  const matches = [];
  let inspected = 0;
  async function walk(directory, depth = 0) {
    if (depth > 4) throw error('PLUGIN_SCAN_LIMIT');
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (cause) { if (cause.code === 'ENOENT') return; throw cause; }
    for (const entry of entries) {
      if (++inspected > 20000) throw error('PLUGIN_SCAN_LIMIT');
      if (entry.isSymbolicLink()) throw error('PLUGIN_SYMLINK_REQUIRES_REVIEW');
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && (depth < 3 || ['.claude-plugin', '.codex-plugin'].includes(entry.name))) await walk(candidate, depth + 1);
      else if (/^(?:\.mcp\.json|mcp\.json|plugin\.json)$/.test(entry.name)) {
        const file = await readFile(candidate, ctx);
        const values = registrations(parseConfig(file.text, 'jsonc'));
        if (values.some(item => item.endpointMatches || item.key === SERVER_ALIAS)) matches.push({ path: candidate, count: values.length, ownershipMode: 'plugin' });
      }
    }
  }
  for (const root of roots) await walk(root);
  return matches;
}

export async function inspectClient(client, ctx = context()) {
  const adapter = ADAPTERS[client];
  if (!adapter) throw error('UNSUPPORTED_CLIENT');
  const detected = ctx.detections?.[client] || detect(client, ctx);
  const paths = locations(client, ctx);
  const scopes = [];
  for (const candidate of scopePaths(client, ctx)) {
    // Explicit scopes outside home need manual review; never silently write them.
    const file = await readFile(candidate, ctx, true);
    if (file.bytes) scopes.push({ path: candidate, hash: file.hash, registrations: registrations(parseConfig(file.text, adapter.format)) });
  }
  const plugins = await pluginDuplicates(client, ctx);
  const primary = await readFile(paths.target, ctx);
  const guide = await readFile(paths.guide, ctx);
  const parsed = parseConfig(primary.text, adapter.format);
  const owned = getAt(parsed, adapter.key);
  const registrationsFound = scopes.flatMap(scope => scope.registrations.map(item => ({ ...item, scope: scope.path })));
  const matches = registrationsFound.filter(item => item.endpointMatches || item.key === SERVER_ALIAS);
  const conflict = plugins.length ? 'PLUGIN_OWNERSHIP_CONFLICT' : matches.length > 1 ? 'DUPLICATE_REGISTRATION' : matches.length === 1 && (!samePath(matches[0].scope, paths.target) || matches[0].path !== adapter.key.join('.')) ? 'SHADOWING_SCOPE' : owned !== undefined && !equal(owned, adapter.entry) ? 'EXISTING_ALIAS_REQUIRES_REVIEW' : null;
  const managed = guideSection(guide.text);
  if (managed && managed.text.replaceAll('\r\n', '\n') !== GUIDE_BLOCK) throw error('MANAGED_GUIDE_EDITED');
  return { client, ...detected, targetPath: paths.target, guidePath: paths.guide, preimageSha256: primary.hash, guidePreimageSha256: guide.hash, scopes, plugins, conflict, configured: equal(owned, adapter.entry), guideConfigured: Boolean(managed), platformSupported: ctx.platform === 'win32', nativeInvocation: 'NOT_RUN' };
}

export async function inspect(clients = Object.keys(ADAPTERS), ctx = context()) {
  const results = [];
  for (const client of clients) {
    const detected = ctx.detections?.[client] || detect(client, ctx);
    try { results.push(await inspectClient(client, { ...ctx, detections: { ...ctx.detections, [client]: detected } })); }
    catch (cause) { results.push({ client, ...detected, status: 'CONFLICT', reason: /^[A-Z_]+$/.test(cause.code || cause.message) ? (cause.code || cause.message) : 'CONFIG_INSPECTION_FAILED' }); }
  }
  return { schemaVersion: 1, inspectedAt: ctx.now().toISOString(), hostIdentity: hostIdentity(ctx), residentService: false, clients: results };
}

export async function plan(clients = Object.keys(ADAPTERS), ctx = context()) {
  const inventory = await inspect(clients, ctx);
  const created = ctx.now();
  return { schemaVersion: 1, planId: randomUUID(), createdAt: created.toISOString(), expiresAt: new Date(+created + 86400000).toISOString(), hostIdentity: inventory.hostIdentity, residentService: false, clients: inventory.clients.map(item => ({
    client: item.client, adapterVersion: item.adapterVersion || '1.0.0/unknown', targetPath: item.targetPath || locations(item.client, ctx).target, ownershipMode: 'manual', expectedPreimageSha256: item.preimageSha256 ?? null, ownedKeys: [semanticPath(item.client)], plannedChanges: [{ operation: item.configured ? 'no_op' : 'add', semanticPath: semanticPath(item.client), guidePath: item.guidePath || locations(item.client, ctx).guide, guidePreimageSha256: item.guidePreimageSha256 ?? null, guideOperation: item.guideConfigured ? 'no_op' : 'add', userConfirmation: 'explicit-apply-required', rollbackScope: 'owned-entry-and-guide-only', blockedReason: item.reason || item.conflict || (!item.compatible ? 'UNKNOWN_CLIENT_VERSION' : !item.platformSupported ? 'PLATFORM_NOT_NATIVE_VERIFIED' : null) }],
  })) };
}

function validatePlan(value, ctx) {
  const exactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  const digest = value => value === null || (typeof value === 'string' && /^[0-9a-f]{64}$/.test(value));
  if (!exactKeys(value, ['schemaVersion', 'planId', 'createdAt', 'expiresAt', 'hostIdentity', 'clients', 'residentService']) || value.schemaVersion !== 1 || value.residentService !== false || !/^[0-9a-f-]{36}$/.test(value.planId) || value.hostIdentity !== hostIdentity(ctx)) throw error('INVALID_PLAN_IDENTITY');
  const now = +ctx.now();
  if (!Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.expiresAt)) || now < Date.parse(value.createdAt) || now >= Date.parse(value.expiresAt) || Date.parse(value.expiresAt) - Date.parse(value.createdAt) > 86400000) throw error('PLAN_EXPIRED');
  if (!Array.isArray(value.clients) || !value.clients.length || new Set(value.clients.map(item => item.client)).size !== value.clients.length) throw error('INVALID_PLAN_CLIENTS');
  for (const item of value.clients) {
    if (!exactKeys(item, ['client', 'adapterVersion', 'targetPath', 'ownershipMode', 'expectedPreimageSha256', 'ownedKeys', 'plannedChanges']) || !ADAPTERS[item.client] || typeof item.adapterVersion !== 'string' || !digest(item.expectedPreimageSha256) || item.ownershipMode !== 'manual' || !samePath(item.targetPath, locations(item.client, ctx).target) || !equal(item.ownedKeys, [semanticPath(item.client)]) || !Array.isArray(item.plannedChanges) || item.plannedChanges.length !== 1) throw error('INVALID_PLAN_SCOPE');
    const change = item.plannedChanges[0];
    if (!samePath(change.guidePath, locations(item.client, ctx).guide) || !digest(change.guidePreimageSha256) || change.semanticPath !== semanticPath(item.client) || !['add', 'no_op'].includes(change.operation) || !['add', 'no_op'].includes(change.guideOperation)) throw error('INVALID_PLAN_SCOPE');
    if (change.blockedReason) throw error(change.blockedReason);
  }
}

async function secureDirectory(directory, ctx) {
  await safePath(path.join(directory, 'check'), ctx.home);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./private-storage.ps1', import.meta.url)), directory], { stdio: 'ignore', windowsHide: true, timeout: 5000 }); }
    catch { throw error('PRIVATE_STORAGE_ACL_FAILED'); }
  } else {
    await fs.chmod(directory, 0o700);
    if (((await fs.stat(directory)).mode & 0o077) !== 0) throw error('PRIVATE_STORAGE_PERMISSIONS_FAILED');
  }
}

export async function atomicWrite(target, text, expectedHash, ctx) {
  const before = await readFile(target, ctx);
  if (before.hash !== expectedHash) throw error('CONFLICT');
  if (before.text === text && before.bytes) return false;
  if (before.bytes && (before.mode & 0o200) === 0) throw error('CONFIG_READ_ONLY');
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await safePath(target, writeRoot(target, ctx));
  const temporary = path.join(path.dirname(target), `.soren-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, text, { flag: 'wx', mode: before.mode });
    if (process.platform === 'win32' && before.bytes) {
      // Copy the existing DACL onto the sibling before atomic replacement.
      const runner = fileURLToPath(new URL('./copy-acl.ps1', import.meta.url));
      try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', runner, target, temporary], { stdio: 'ignore', windowsHide: true, timeout: 5000 }); }
      catch { throw error('CONFIG_ACL_PRESERVATION_FAILED'); }
    }
    const handle = await fs.open(temporary, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    await ctx.beforeRename?.(target);
    await safePath(target, writeRoot(target, ctx));
    if ((await readFile(target, ctx)).hash !== expectedHash) throw error('CONFLICT');
    await fs.rename(temporary, target);
    if ((await readFile(target, ctx)).hash !== sha256(Buffer.from(text))) throw error('POSTIMAGE_MISMATCH');
    return true;
  } finally { await fs.rm(temporary, { force: true }); }
}

async function saveReceipt(receipt, directory, ctx) {
  const target = path.join(directory, 'receipt.json');
  const current = await readFile(target, ctx);
  await atomicWrite(target, JSON.stringify(receipt, null, 2) + '\n', current.hash, ctx);
}

async function withLock(ctx, work) {
  const storage = path.join(ctx.home, '.soren-installer');
  await secureDirectory(storage, ctx);
  const lock = path.join(storage, 'transaction.lock');
  let handle;
  try { handle = await fs.open(lock, 'wx', 0o600); }
  catch (cause) { if (cause.code === 'EEXIST') throw error('TRANSACTION_LOCKED'); throw cause; }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: ctx.now().toISOString() })); return await work(storage); }
  finally { await handle.close(); await fs.rm(lock, { force: true }); }
}

export async function apply(value, ctx = context()) {
  validatePlan(value, ctx);
  return withLock(ctx, async storage => {
    const directory = path.join(storage, value.planId);
    await secureDirectory(directory, ctx);
    const previous = await readFile(path.join(directory, 'receipt.json'), ctx);
    if (previous.bytes) return reconcile(path.join(directory, 'receipt.json'), ctx);
    const receipt = { schemaVersion: 1, planId: value.planId, hostIdentity: value.hostIdentity, createdAt: ctx.now().toISOString(), residentService: false, status: 'APPLYING', clients: [] };
    await saveReceipt(receipt, directory, ctx);
    try {
      for (const item of value.clients) {
        const detected = await inspectClient(item.client, ctx);
        if (detected.conflict || !detected.compatible || !detected.platformSupported || detected.adapterVersion !== item.adapterVersion) throw error(detected.conflict || 'CLIENT_COMPATIBILITY_CHANGED');
        const change = item.plannedChanges[0];
        if (change.operation !== (detected.configured ? 'no_op' : 'add') || change.guideOperation !== (detected.guideConfigured ? 'no_op' : 'add')) throw error('PLAN_SEMANTIC_DELTA_MISMATCH');
        const original = await readFile(item.targetPath, ctx);
        const guide = await readFile(change.guidePath, ctx);
        if (original.hash !== item.expectedPreimageSha256 || guide.hash !== change.guidePreimageSha256) throw error('CONFLICT');
        const configText = editConfig(original.text, item.client, ADAPTERS[item.client].entry);
        const guideText = editGuide(guide.text);
        const entry = { client: item.client, adapterVersion: item.adapterVersion, targetPath: item.targetPath, guidePath: change.guidePath, ownershipMode: 'manual', configOwned: original.text !== configText, guideOwned: guide.text !== guideText, preimageSha256: original.hash, guidePreimageSha256: guide.hash, postimageSha256: sha256(Buffer.from(configText)), guidePostimageSha256: sha256(Buffer.from(guideText)), installedEntrySha256: sha256(JSON.stringify(ADAPTERS[item.client].entry)), ownedSyntaxSha256: sha256(ownedSyntax(configText, item.client)), guideBlockSha256: sha256(GUIDE_BLOCK), state: 'PREPARED' };
        if (original.bytes) await fs.writeFile(path.join(directory, `${item.client}.config.before`), original.bytes, { flag: 'wx', mode: 0o600 });
        if (guide.bytes) await fs.writeFile(path.join(directory, `${item.client}.guide.before`), guide.bytes, { flag: 'wx', mode: 0o600 });
        receipt.clients.push(entry);
        await saveReceipt(receipt, directory, ctx);
        await atomicWrite(item.targetPath, configText, original.hash, ctx);
        entry.state = 'CONFIG_WRITTEN';
        await saveReceipt(receipt, directory, ctx);
        await ctx.afterConfigWrite?.(item.client);
        await atomicWrite(change.guidePath, guideText, guide.hash, ctx);
        entry.state = 'CONFIGURED';
        await saveReceipt(receipt, directory, ctx);
      }
      receipt.status = 'CONFIGURED';
    } catch (cause) {
      receipt.status = 'PARTIAL';
      receipt.failure = /^[A-Z_]+$/.test(cause.code || cause.message) ? (cause.code || cause.message) : 'FILESYSTEM_OPERATION_FAILED';
    }
    await saveReceipt(receipt, directory, ctx);
    return { ...receipt, receiptPath: path.join(directory, 'receipt.json') };
  });
}

async function loadReceipt(receiptPath, ctx) {
  const file = await readFile(receiptPath, ctx);
  let receipt;
  try { receipt = JSON.parse(file.text); } catch { throw error('INVALID_RECEIPT'); }
  if (receipt.schemaVersion !== 1 || receipt.hostIdentity !== hostIdentity(ctx) || !/^[0-9a-f-]{36}$/.test(receipt.planId) || !samePath(receiptPath, path.join(ctx.home, '.soren-installer', receipt.planId, 'receipt.json')) || !Array.isArray(receipt.clients)) throw error('INVALID_RECEIPT');
  for (const item of receipt.clients) {
    const expected = locations(item.client, ctx);
    if (!samePath(item.targetPath, expected.target) || !samePath(item.guidePath, expected.guide) || item.installedEntrySha256 !== sha256(JSON.stringify(ADAPTERS[item.client].entry))) throw error('INVALID_RECEIPT_SCOPE');
  }
  return receipt;
}

export async function reconcile(receiptPath, ctx = context()) {
  const receipt = await loadReceipt(receiptPath, ctx);
  for (const item of receipt.clients) {
    const config = await readFile(item.targetPath, ctx);
    const guide = await readFile(item.guidePath, ctx);
    item.observedState = config.hash === item.postimageSha256 && guide.hash === item.guidePostimageSha256 ? 'CONFIGURED' : config.hash === item.postimageSha256 && guide.hash === item.guidePreimageSha256 ? 'CONFIG_WRITTEN' : config.hash === item.preimageSha256 && guide.hash === item.guidePreimageSha256 ? 'NOT_APPLIED' : 'MANUAL_RECONCILIATION_REQUIRED';
  }
  return { ...receipt, status: receipt.clients.length && receipt.clients.every(item => item.observedState === 'CONFIGURED') ? 'CONFIGURED' : 'PARTIAL', receiptPath };
}

export async function remove(receiptPath, ctx = context()) {
  return withLock(ctx, async () => {
    const receipt = await loadReceipt(receiptPath, ctx);
    for (const item of receipt.clients) {
      try {
        const config = await readFile(item.targetPath, ctx);
        const guide = await readFile(item.guidePath, ctx);
        const owned = getAt(parseConfig(config.text, ADAPTERS[item.client].format), ADAPTERS[item.client].key);
        const section = guideSection(guide.text);
        if (item.configOwned && owned !== undefined && !equal(owned, ADAPTERS[item.client].entry)) throw error('MANUAL_RECONCILIATION_REQUIRED');
        if (item.configOwned && owned !== undefined && sha256(ownedSyntax(config.text, item.client)) !== item.ownedSyntaxSha256) throw error('MANUAL_RECONCILIATION_REQUIRED');
        if (item.guideOwned && section && sha256(section.text.replaceAll('\r\n', '\n')) !== item.guideBlockSha256) throw error('MANUAL_RECONCILIATION_REQUIRED');
        if (item.configOwned && owned !== undefined) await atomicWrite(item.targetPath, editConfig(config.text, item.client, undefined), config.hash, ctx);
        if (item.guideOwned && section) await atomicWrite(item.guidePath, editGuide(guide.text, true), guide.hash, ctx);
        item.state = 'REMOVED';
      } catch (cause) { item.state = 'MANUAL_RECONCILIATION_REQUIRED'; item.failure = /^[A-Z_]+$/.test(cause.code || cause.message) ? (cause.code || cause.message) : 'FILESYSTEM_OPERATION_FAILED'; }
    }
    receipt.status = receipt.clients.every(item => item.state === 'REMOVED') ? 'REMOVED' : 'PARTIAL';
    await saveReceipt(receipt, path.dirname(receiptPath), ctx);
    return { ...receipt, receiptPath };
  });
}

export async function verify(receiptPath, level = 'configured', ctx = context()) {
  if (!['configured', 'protocol', 'native'].includes(level)) throw error('INVALID_VERIFICATION_LEVEL');
  const receipt = await loadReceipt(receiptPath, ctx);
  const clients = [];
  for (const item of receipt.clients) {
    try {
      const observation = await inspectClient(item.client, ctx);
      clients.push({ client: item.client, status: observation.configured && observation.guideConfigured && !observation.conflict ? 'PASS' : 'FAIL', level: 'CONFIGURED', nativeInvocation: 'NOT_RUN' });
    } catch { clients.push({ client: item.client, status: 'FAIL', level: 'CONFIGURED', reason: 'CONFIG_INSPECTION_FAILED' }); }
  }
  const protocol = level === 'protocol' && clients.every(item => item.status === 'PASS') ? await verifyProtocol({ fetch: ctx.fetch }) : undefined;
  return { schemaVersion: 1, verifiedAt: ctx.now().toISOString(), requestedLevel: level, status: clients.some(item => item.status === 'FAIL') ? 'FAIL' : level === 'configured' ? 'PASS' : level === 'protocol' ? protocol.status : 'BLOCKED', clients, ...(protocol && { protocol }), ...(level === 'native' && { reason: 'REAL_CLIENT_TOOL_INVOCATION_REQUIRED' }) };
}
