#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADAPTERS, context } from '../installer/adapters.mjs';
import { inspect, plan, apply, verify, remove, reconcile } from '../installer/transaction.mjs';

export async function main(args = process.argv.slice(2)) {
  const [command, ...flags] = args;
  const options = {};
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index];
    if (!['--agents', '--output', '--plan', '--receipt', '--level', '--channel', '--plan-only'].includes(key) || Object.hasOwn(options, key)) throw new Error('INVALID_ARGUMENT');
    if (key === '--plan-only') { options[key] = true; index--; continue; }
    if (!flags[index + 1] || flags[index + 1].startsWith('--') || /[<>\0]/.test(flags[index + 1])) throw new Error('INVALID_ARGUMENT_VALUE');
    options[key] = flags[index + 1];
  }
  const allowed = { inspect: ['--agents', '--output'], plan: ['--agents', '--output'], apply: ['--plan', '--output'], verify: ['--receipt', '--level', '--output'], remove: ['--receipt', '--output'], reconcile: ['--receipt', '--output'], update: ['--channel', '--plan-only', '--output'] }[command];
  if (!allowed || Object.keys(options).some(key => !allowed.includes(key))) throw new Error('INVALID_COMMAND_OR_OPTION');
  const clients = !options['--agents'] || options['--agents'] === 'all' ? Object.keys(ADAPTERS) : options['--agents'].split(',');
  if (!clients.length || new Set(clients).size !== clients.length || clients.some(client => !ADAPTERS[client])) throw new Error('INVALID_AGENTS');
  const ctx = context();
  let result;
  if (command === 'inspect') result = await inspect(clients, ctx);
  else if (command === 'plan') result = await plan(clients, ctx);
  else if (command === 'apply') {
    if (!options['--plan']) throw new Error('PLAN_REQUIRED');
    const bytes = await fs.readFile(path.resolve(options['--plan']));
    if (bytes.length > 1024 * 1024) throw new Error('PLAN_TOO_LARGE');
    result = await apply(JSON.parse(bytes.toString('utf8')), ctx);
  } else if (command === 'update') {
    if (options['--channel'] !== 'stable' || options['--plan-only'] !== true) throw new Error('UPDATE_REQUIRES_STABLE_PLAN_ONLY');
    result = { status: 'BLOCKED', mode: 'observe', channel: 'stable', residentService: false, reason: 'TRUSTED_SIGNED_RELEASE_SOURCE_NOT_CONFIGURED' };
  } else {
    if (!options['--receipt']) throw new Error('RECEIPT_REQUIRED');
    const receipt = path.resolve(options['--receipt']);
    result = command === 'verify' ? await verify(receipt, options['--level'] || 'configured', ctx) : command === 'remove' ? await remove(receipt, ctx) : await reconcile(receipt, ctx);
  }
  const output = JSON.stringify(result, null, 2) + '\n';
  if (options['--output']) await fs.writeFile(path.resolve(options['--output']), output, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(output);
  if (['PARTIAL', 'BLOCKED', 'FAIL'].includes(result.status)) process.exitCode = 2;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(cause => {
    const code = /^[A-Z_]+$/.test(cause.code || cause.message) ? (cause.code || cause.message) : 'INSTALLER_FAILED';
    process.stderr.write(JSON.stringify({ status: 'FAIL', reason: code, action: 'Inspect configuration and recompute the plan; no blind retry.' }) + '\n');
    process.exitCode = 1;
  });
}
