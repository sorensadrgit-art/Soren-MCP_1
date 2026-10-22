import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectActivationConfiguration, CONFIGURATION_FIELDS} from '../../lib/operations/activation-preflight.mjs';

const complete = {
  SOREN_CAPABILITY_MODE: 'private_enabled', SOREN_ENVIRONMENT: 'production',
  SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-auth-key',
  SUPABASE_SERVICE_ROLE_KEY: 'TEST_ADMIN_DO_NOT_PRINT', SOREN_GATEWAY_DB_KEY: 'TEST_GATEWAY_DO_NOT_PRINT',
  SOREN_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
  SOREN_AUTH_AUDIENCE: 'authenticated', SOREN_AUTH_RESOURCE: 'https://router.example/api/mcp',
  SOREN_AUTH_CLIENT_ID: 'agent-one,management-one,observer-one', SOREN_MANAGEMENT_CLIENT_ID: 'management-one',
  SOREN_ADMIN_ORIGIN: 'https://router.example', SOREN_OAUTH_AUTHORIZATION_URL: 'https://project.supabase.co/auth/v1/oauth/authorize',
  SOREN_OAUTH_TOKEN_URL: 'https://project.supabase.co/auth/v1/oauth/token',
  SOREN_SESSION_SECRET: 's'.repeat(43), SOREN_RATE_KEY: 'r'.repeat(43), SOREN_REVIEW_POLICY_SHA256: 'a'.repeat(64),
  CRON_SECRET: 'c'.repeat(43), SOREN_GATEWAY_ORIGIN: 'https://router.example', SOREN_AUTH_PROBE_TOKEN: 'TEST_PROBE_DO_NOT_PRINT',
  SOREN_UPDATE_PROJECT_ID: 'project-one', SOREN_UPDATE_ENVIRONMENT: 'production',
  SOREN_WATCH_GATEWAY_URL: 'https://router.example', SOREN_WATCHER_ACCESS_TOKEN: 'TEST_WATCHER_DO_NOT_PRINT',
  SOREN_WATCHER_DELIVERY_ENABLED: 'true', SOREN_WATCHER_CADENCE_SECONDS: '60', SOREN_WATCHER_CLIENT_ID: 'observer-one',
  SOREN_GATEWAY_FAILURE_DOMAIN: 'vercel-project-one', SOREN_WATCHER_FAILURE_DOMAIN: 'independent-observer',
  SOREN_RELEASE_PROJECT_ID: 'project-one', SOREN_RELEASE_TEAM_ID: 'team-one', SOREN_RELEASE_ENVIRONMENT: 'production',
  SOREN_PRODUCTION_DOMAINS: 'router.example', SOREN_RELEASE_TRUST_FILE: '/owner/trust.json',
  SOREN_VERCEL_CLI_PATH: '/tools/vercel.js', SOREN_VERCEL_CLI_SHA256: 'b'.repeat(64), VERCEL_TOKEN: 'TEST_DEPLOY_DO_NOT_PRINT',
  SOREN_RELEASE_RUNNER_CLIENT_ID: 'runner-one', SOREN_RELEASE_OBSERVER_CLIENT_ID: 'observer-one',
  SOREN_MANAGEMENT_ACCESS_TOKEN: 'TEST_OWNER_DO_NOT_PRINT', SOREN_EVIDENCE_ACCESS_TOKEN: 'TEST_EVIDENCE_DO_NOT_PRINT',
};

test('missing private infrastructure never makes the public baseline appear verified or mutates activation', () => {
  const result = inspectActivationConfiguration({});
  assert.equal(result.scope, 'configuration_only');
  assert.equal(result.capabilityMode, 'public_only');
  assert.equal(result.productionModified, false);
  assert.equal(result.updaterArmed, false);
  assert.equal(result.hostedVerification, 'NOT_RUN');
  assert.equal(result.components.privateIdentity.configuration, 'INCOMPLETE');
  assert.ok(result.components.privateIdentity.missing.includes('SUPABASE_URL'));
  assert.equal(result.applicationAvailability, 'NOT_PROBED');
});

test('complete configuration means ready to probe, not authenticated, scheduled or approved', () => {
  const result = inspectActivationConfiguration(complete);
  for (const id of ['privateIdentity', 'management', 'gatewayStore', 'maintenance', 'watcher', 'releaseRunner']) {
    assert.equal(result.components[id].configuration, 'READY_FOR_PROBE', id);
    assert.equal(result.components[id].verified, false, id);
  }
  assert.equal(result.promotionAuthorized, false);
  assert.ok(result.externalGates.includes('hosted_identity_and_database_evidence'));
  assert.ok(result.externalGates.includes('owner_exact_artifact_release_authorization'));
  assert.ok(result.externalGates.includes('deployment_secret_confinement'));
  assert.equal(result.automaticPromotionSupported, false);
});

test('configuration reports never return credential values, local paths or arbitrary env data', () => {
  const report = JSON.stringify(inspectActivationConfiguration({...complete, UNRELATED_SECRET: 'PRIVATE_EXTRA_SENTINEL'}));
  for (const marker of ['TEST_ADMIN_DO_NOT_PRINT', 'TEST_DEPLOY_DO_NOT_PRINT', 'TEST_OWNER_DO_NOT_PRINT', 'PRIVATE_EXTRA_SENTINEL', '/owner/trust.json', '/tools/vercel.js']) {
    assert.equal(report.includes(marker), false, marker);
  }
  assert.ok(report.includes('SOREN_RELEASE_TRUST_FILE'));
});

test('gateway and management key reuse is rejected rather than weakening role separation', () => {
  const result = inspectActivationConfiguration({...complete, SOREN_GATEWAY_DB_KEY: complete.SUPABASE_SERVICE_ROLE_KEY});
  assert.equal(result.components.gatewayStore.configuration, 'INVALID');
  assert.ok(result.components.gatewayStore.issues.includes('elevated_key_reused_for_public_gateway'));
});

test('weak scheduler secrets and wrong URL shapes fail configuration checks', () => {
  const result = inspectActivationConfiguration({...complete, CRON_SECRET: 'weak', SUPABASE_URL: 'https://project.supabase.co/unexpected'});
  assert.equal(result.components.maintenance.configuration, 'INVALID');
  assert.ok(result.components.maintenance.issues.includes('cron_secret_below_minimum_length'));
  assert.equal(result.components.privateIdentity.configuration, 'INVALID');
});

test('watcher independence and cadence do not inherit a false release-readiness state', () => {
  const same = inspectActivationConfiguration({...complete, SOREN_WATCHER_FAILURE_DOMAIN: complete.SOREN_GATEWAY_FAILURE_DOMAIN});
  assert.equal(same.components.watcher.configuration, 'INVALID');
  const slow = inspectActivationConfiguration({...complete, SOREN_WATCHER_CADENCE_SECONDS: '900'});
  assert.equal(slow.components.watcher.configuration, 'READY_FOR_PROBE');
  assert.equal(slow.probationCadenceConfigured, false);
  assert.equal(slow.promotionAuthorized, false);
  assert.ok(slow.externalGates.includes('independent_probation_cadence_at_most_60_seconds'));
});

test('server trust JSON cannot silently satisfy the separate runner trust-file contract', () => {
  const env = {...complete, SOREN_RELEASE_TRUST_JSON: 'DO_NOT_USE_CANDIDATE_TRUST'};
  delete env.SOREN_RELEASE_TRUST_FILE;
  const result = inspectActivationConfiguration(env);
  assert.equal(result.components.releaseRunner.configuration, 'INCOMPLETE');
  assert.ok(result.components.releaseRunner.missing.includes('SOREN_RELEASE_TRUST_FILE'));
  assert.ok(result.warnings.includes('server_trust_json_does_not_replace_runner_trust_file'));
});

test('private mode and management-client mismatches are reported without changing runtime settings', () => {
  const env = {...complete, SOREN_CAPABILITY_MODE: 'auto', SOREN_MANAGEMENT_CLIENT_ID: 'not-allowlisted'};
  const before = {...env};
  const report = inspectActivationConfiguration(env);
  assert.ok(report.issues.includes('unsupported_capability_mode'));
  assert.equal(report.components.management.configuration, 'INVALID');
  assert.deepEqual(env, before);
});

test('template documents every supported activation field once, with no credential defaults', async () => {
  const text = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  const entries = text.split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line));
  const names = entries.map(line => line.split('=', 1)[0]);
  for (const name of CONFIGURATION_FIELDS) assert.equal(names.filter(item => item === name).length, 1, name);
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SOREN_GATEWAY_DB_KEY', 'VERCEL_TOKEN', 'CRON_SECRET', 'SOREN_SESSION_SECRET', 'SOREN_MANAGEMENT_ACCESS_TOKEN']) {
    assert.ok(entries.includes(`${name}=`), name);
  }
});

test('invalid enum values do not reflect arbitrary environment content into a report', () => {
  const report = inspectActivationConfiguration({...complete, SOREN_CAPABILITY_MODE: 'PRIVATE_MODE_SENTINEL'});
  assert.equal(report.capabilityMode, 'INVALID');
  assert.equal(JSON.stringify(report).includes('PRIVATE_MODE_SENTINEL'), false);
});

test('watcher cadence diagnostics match the existing runtime boundaries', () => {
  for (const value of ['1', '59', '172801']) {
    const report = inspectActivationConfiguration({...complete, SOREN_WATCHER_CADENCE_SECONDS: value});
    assert.equal(report.components.watcher.configuration, 'INVALID', value);
    assert.equal(report.probationCadenceConfigured, false, value);
  }
  for (const value of ['60', '900', '86401', '172800']) {
    const report = inspectActivationConfiguration({...complete, SOREN_WATCHER_CADENCE_SECONDS: value});
    assert.equal(report.components.watcher.configuration, 'READY_FOR_PROBE', value);
    assert.equal(report.probationCadenceConfigured, value === '60', value);
  }
});

test('maintenance-only inspection includes the private authentication probe dependencies', () => {
  for (const key of ['SUPABASE_ANON_KEY', 'SOREN_AUTH_AUDIENCE', 'SOREN_AUTH_RESOURCE', 'SOREN_AUTH_CLIENT_ID']) {
    const env = {...complete}; delete env[key];
    const report = inspectActivationConfiguration(env);
    assert.equal(report.components.maintenance.configuration, 'INCOMPLETE', key);
    assert.ok(report.components.maintenance.missing.includes(key), key);
  }
});
