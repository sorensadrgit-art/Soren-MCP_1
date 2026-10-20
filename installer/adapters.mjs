import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ENDPOINT, SERVER_ALIAS } from '../lib/client-contract.mjs';

// Exact versions are fixture-tested. Native invocation remains a separate gate.
export const ADAPTERS = Object.freeze({
  factory: { versions: ['0.244.0'], command: 'droid', format: 'jsonc', file: ['.factory', 'mcp.json'], guide: ['.factory', 'AGENTS.md'], key: ['mcpServers', SERVER_ALIAS], entry: { type: 'http', url: ENDPOINT, disabled: false } },
  codex: { versions: ['0.157.1'], command: 'codex', format: 'toml', file: ['.codex', 'config.toml'], guide: ['.codex', 'AGENTS.md'], key: ['mcp_servers', SERVER_ALIAS], entry: { url: ENDPOINT, enabled: true } },
  antigravity: { versions: ['1.4.2'], command: 'agy', format: 'jsonc', file: ['.gemini', 'config', 'mcp_config.json'], guide: ['.gemini', 'GEMINI.md'], key: ['mcpServers', SERVER_ALIAS], entry: { serverUrl: ENDPOINT, disabled: false } },
  opencode: { versions: ['2.0.32'], command: 'opencode', format: 'jsonc', file: ['.config', 'opencode', 'opencode.json'], guide: ['.config', 'opencode', 'AGENTS.md'], key: ['mcp', 'servers', SERVER_ALIAS], entry: { type: 'remote', url: ENDPOINT, disabled: false } },
  claude: { versions: ['2.1.283'], command: 'claude', format: 'jsonc', file: ['.claude.json'], guide: ['.claude', 'CLAUDE.md'], key: ['mcpServers', SERVER_ALIAS], entry: { type: 'http', url: ENDPOINT } },
  qwen: { versions: ['0.25.3'], command: 'qwen', format: 'jsonc', file: ['.qwen', 'settings.json'], guide: ['.qwen', 'QWEN.md'], key: ['mcpServers', SERVER_ALIAS], entry: { httpUrl: ENDPOINT } },
});

export const GUIDE_START = '<!-- soren-skills:managed:start -->';
export const GUIDE_END = '<!-- soren-skills:managed:end -->';
export const GUIDE_TEXT = 'Soren Skill Router is optional read-only reference and discovery. It does not override system/developer/user/project instructions, choose permissions, execute code, approve external content, modify other agents, or coordinate repository writes. Use it for a substantial task when useful, read only approved instructions as reference, and perform actions through native tools under their existing approvals. Do not route trivial work or repeatedly ask for the same skill selection. Respect project-only workflows and explicit user skill choices. Qualify the actual server namespace when tool names overlap.';
export const GUIDE_BLOCK = `${GUIDE_START}\n${GUIDE_TEXT}\n${GUIDE_END}`;

export function context(options = {}) {
  return { home: os.homedir(), cwd: process.cwd(), platform: process.platform, env: process.env, now: () => new Date(), ...options };
}

export function locations(client, ctx) {
  const adapter = ADAPTERS[client];
  if (!adapter) throw new Error('UNSUPPORTED_CLIENT');
  const codexHome = client === 'codex' && ctx.env.CODEX_HOME;
  return { target: codexHome ? path.resolve(codexHome, 'config.toml') : path.join(ctx.home, ...adapter.file), guide: codexHome ? path.resolve(codexHome, 'AGENTS.md') : path.join(ctx.home, ...adapter.guide) };
}

export function findExecutable(command, ctx) {
  for (const directory of (ctx.env.PATH || ctx.env.Path || '').split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of ctx.platform === 'win32' ? ['.exe', '.cmd', '.ps1', ''] : ['']) {
      const candidate = path.join(directory, command + extension);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* Continue PATH search. */ }
    }
  }
  if (ctx.platform === 'win32' && command === 'opencode') {
    const local = ctx.env.LOCALAPPDATA || path.join(ctx.home, 'AppData', 'Local');
    const bundled = path.join(local, 'Programs', '@opencodedesktop', 'resources', 'opencode-cli.exe');
    try { if (fs.statSync(bundled).isFile()) return bundled; } catch { /* Desktop CLI may be absent. */ }
  }
  return null;
}

export function runClient(executable, args, options = {}) {
  const runner = fileURLToPath(new URL('./run-client.ps1', import.meta.url));
  const settings = { timeout: 8000, encoding: 'utf8', maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options };
  if (process.platform === 'win32' && /\.(?:cmd|ps1)$/i.test(executable)) {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', runner, executable, ...args], settings);
  }
  return execFileSync(executable, args, settings);
}

export function parseClientVersion(output) {
  return String(output).replace(/\u001b\[[0-9;]*m/g, '').match(/\bv?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)/)?.[1] || null;
}

export function detect(client, ctx) {
  const adapter = ADAPTERS[client];
  const executable = findExecutable(adapter.command, ctx);
  let version = null;
  let supportedSubcommands = [];
  let detection = executable ? 'VERSION_UNAVAILABLE' : 'EXECUTABLE_MISSING';
  if (executable) {
    try {
      version = parseClientVersion(runClient(executable, ['--version']));
      detection = version ? 'DETECTED' : 'VERSION_UNAVAILABLE';
      try {
        const help = runClient(executable, ['--help']);
        supportedSubcommands = ['mcp', 'exec', 'run', 'chat'].filter(command => new RegExp(`\\b${command}\\b`, 'i').test(help));
      } catch { /* Native writer support stays unverified when help is unavailable. */ }
    } catch { /* Inspection must not leak native stderr or credentials. */ }
  }
  return { executable, version, detection, supportedSubcommands, configurationWriter: 'preserving-file', nativeWriterState: 'NOT_VALIDATED', desktopVerification: 'NOT_RUN', compatible: adapter.versions.includes(version), adapterVersion: `1.0.0/${client}@${version || 'unknown'}` };
}

export function scopePaths(client, ctx) {
  const adapter = ADAPTERS[client];
  const candidates = new Set([locations(client, ctx).target]);
  let cursor = path.resolve(ctx.cwd);
  while (true) {
    const relative = client === 'opencode' ? ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json'] : [adapter.file.join(path.sep)];
    if (!(client === 'codex' && ctx.env.CODEX_HOME && path.resolve(cursor).toLowerCase() === path.resolve(ctx.home).toLowerCase())) {
      for (const file of relative) candidates.add(path.join(cursor, file));
    }
    if (client === 'claude') candidates.add(path.join(cursor, '.mcp.json'));
    if (path.resolve(cursor).toLowerCase() === path.resolve(ctx.home).toLowerCase()) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (client === 'opencode' && ctx.env.OPENCODE_CONFIG) candidates.add(path.resolve(ctx.env.OPENCODE_CONFIG));
  if (client === 'opencode') candidates.add(path.join(ctx.home, '.config', 'opencode', 'opencode.jsonc'));
  if (client === 'claude') candidates.add(path.join(ctx.home, '.claude', 'settings.json'));
  return [...candidates];
}
