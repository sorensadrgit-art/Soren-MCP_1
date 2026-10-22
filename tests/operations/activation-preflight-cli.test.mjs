import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../../scripts/activation-preflight.mjs', import.meta.url));
const run = args => spawnSync(process.execPath, [script, ...args], {encoding: 'utf8', timeout: 10000, env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot}});

test('activation CLI exits gated with structured read-only output, not a false success', () => {
  const result = run([]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope, 'configuration_only');
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.productionModified, false);
  assert.equal(report.applicationAvailability, 'NOT_PROBED');
});

test('component selection reduces the report without changing external authorization gates', () => {
  const result = run(['--component', 'watcher']);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(report.components), ['watcher']);
  assert.equal(report.promotionAuthorized, false);
  assert.equal(report.updaterArmed, false);
});

test('unknown arguments are rejected without reflecting their values', () => {
  const result = run(['--component', 'SECRET_ARGUMENT_SENTINEL']);
  assert.equal(result.status, 64);
  assert.equal((result.stdout + result.stderr).includes('SECRET_ARGUMENT_SENTINEL'), false);
  assert.equal(JSON.parse(result.stderr).reason, 'invalid_preflight_arguments');
  assert.equal(run(['--help']).status, 0);
});
