/**
 * Read-only activation diagnostics. This module does not access the network,
 * read credential files, mutate process.env, authorize releases or declare health.
 * Required fields belong to separate deployment/runner identities, not one global
 * environment. A complete set of strings is never proof of secret confinement.
 */
const COMPONENT_FIELDS = Object.freeze({
  privateIdentity: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SOREN_WORKSPACE_ID', 'SOREN_AUTH_AUDIENCE', 'SOREN_AUTH_RESOURCE', 'SOREN_AUTH_CLIENT_ID'],
  management: ['SOREN_MANAGEMENT_CLIENT_ID', 'SOREN_ADMIN_ORIGIN', 'SOREN_OAUTH_AUTHORIZATION_URL', 'SOREN_OAUTH_TOKEN_URL', 'SOREN_SESSION_SECRET', 'SOREN_REVIEW_POLICY_SHA256', 'SUPABASE_SERVICE_ROLE_KEY'],
  gatewayStore: ['SUPABASE_URL', 'SOREN_GATEWAY_DB_KEY', 'SOREN_WORKSPACE_ID', 'SOREN_RATE_KEY'],
  maintenance: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SOREN_WORKSPACE_ID', 'SUPABASE_ANON_KEY', 'SOREN_AUTH_AUDIENCE', 'SOREN_AUTH_RESOURCE', 'SOREN_AUTH_CLIENT_ID', 'CRON_SECRET', 'SOREN_GATEWAY_ORIGIN', 'SOREN_AUTH_PROBE_TOKEN', 'SOREN_UPDATE_PROJECT_ID', 'SOREN_UPDATE_ENVIRONMENT'],
  watcher: ['SOREN_WATCH_GATEWAY_URL', 'SOREN_WATCHER_ACCESS_TOKEN', 'SOREN_WATCHER_CLIENT_ID', 'SOREN_GATEWAY_FAILURE_DOMAIN', 'SOREN_WATCHER_FAILURE_DOMAIN'],
  releaseRunner: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SOREN_WORKSPACE_ID', 'SOREN_RELEASE_PROJECT_ID', 'SOREN_RELEASE_TEAM_ID', 'SOREN_RELEASE_ENVIRONMENT', 'SOREN_RELEASE_TRUST_FILE', 'SOREN_PRODUCTION_DOMAINS', 'SOREN_VERCEL_CLI_PATH', 'SOREN_VERCEL_CLI_SHA256', 'VERCEL_TOKEN', 'SOREN_RELEASE_RUNNER_CLIENT_ID', 'SOREN_RELEASE_OBSERVER_CLIENT_ID'],
});

export const CONFIGURATION_FIELDS = Object.freeze([...new Set([
  'SOREN_CAPABILITY_MODE', 'SOREN_ENVIRONMENT', ...Object.values(COMPONENT_FIELDS).flat(),
  'SOREN_WATCHER_DELIVERY_ENABLED', 'SOREN_WATCHER_CADENCE_SECONDS',
  'SOREN_MANAGEMENT_ACCESS_TOKEN', 'SOREN_EVIDENCE_ACCESS_TOKEN',
])]);
export const ACTIVATION_COMPONENTS = Object.freeze(Object.keys(COMPONENT_FIELDS));

const present = value => typeof value === 'string' && value.trim().length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function safeHttps(value, originOnly = false) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && (!originOnly || url.pathname === '/');
  } catch { return false; }
}

/** Configuration shape only: callers must still prove every live activation gate. */
export function inspectActivationConfiguration(env = process.env) {
  const components = {};
  for (const [name, fields] of Object.entries(COMPONENT_FIELDS)) {
    components[name] = {requiredFields: [...fields], missing: fields.filter(key => !present(env[key])), issues: [], configuration: 'INCOMPLETE', verified: false};
  }
  const note = (name, condition, code) => { if (condition) components[name].issues.push(code); };
  const invalidIfPresent = (name, key, check, code) => note(name, present(env[key]) && !check(env[key]), code);
  const issues = [], warnings = [];
  const requestedMode = present(env.SOREN_CAPABILITY_MODE) ? env.SOREN_CAPABILITY_MODE : 'public_only';
  const capabilityMode = ['public_only', 'private_enabled'].includes(requestedMode) ? requestedMode : 'INVALID';
  if (capabilityMode === 'INVALID') issues.push('unsupported_capability_mode');

  for (const name of ['privateIdentity', 'gatewayStore', 'maintenance', 'releaseRunner']) {
    invalidIfPresent(name, 'SUPABASE_URL', value => safeHttps(value, true), 'supabase_origin_invalid');
    invalidIfPresent(name, 'SOREN_WORKSPACE_ID', value => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value), 'workspace_id_invalid');
  }
  for (const name of ['privateIdentity', 'maintenance']) {
    invalidIfPresent(name, 'SOREN_AUTH_RESOURCE', value => safeHttps(value) && new URL(value).pathname === '/api/mcp', 'mcp_resource_invalid');
  }
  invalidIfPresent('management', 'SOREN_ADMIN_ORIGIN', value => safeHttps(value, true), 'management_origin_invalid');
  for (const key of ['SOREN_OAUTH_AUTHORIZATION_URL', 'SOREN_OAUTH_TOKEN_URL']) {
    invalidIfPresent('management', key, value => safeHttps(value), 'oauth_endpoint_invalid');
  }
  invalidIfPresent('management', 'SOREN_REVIEW_POLICY_SHA256', digest, 'review_policy_digest_invalid');
  invalidIfPresent('management', 'SOREN_SESSION_SECRET', value => Buffer.byteLength(value) >= 32, 'session_secret_below_minimum_length');
  if (present(env.SOREN_MANAGEMENT_CLIENT_ID) && present(env.SOREN_AUTH_CLIENT_ID)) {
    const allowed = env.SOREN_AUTH_CLIENT_ID.split(',').map(value => value.trim());
    note('management', !allowed.includes(env.SOREN_MANAGEMENT_CLIENT_ID), 'management_client_not_allowlisted');
  }

  note('gatewayStore', present(env.SOREN_GATEWAY_DB_KEY) && env.SOREN_GATEWAY_DB_KEY === env.SUPABASE_SERVICE_ROLE_KEY, 'elevated_key_reused_for_public_gateway');
  invalidIfPresent('gatewayStore', 'SOREN_RATE_KEY', value => Buffer.byteLength(value) >= 32, 'rate_key_below_minimum_length');
  invalidIfPresent('maintenance', 'CRON_SECRET', value => Buffer.byteLength(value) >= 32, 'cron_secret_below_minimum_length');
  invalidIfPresent('maintenance', 'SOREN_GATEWAY_ORIGIN', value => safeHttps(value, true), 'gateway_origin_invalid');
  invalidIfPresent('watcher', 'SOREN_WATCH_GATEWAY_URL', value => safeHttps(value, true), 'watcher_gateway_origin_invalid');
  note('watcher', present(env.SOREN_GATEWAY_FAILURE_DOMAIN) && env.SOREN_GATEWAY_FAILURE_DOMAIN === env.SOREN_WATCHER_FAILURE_DOMAIN, 'watcher_not_independent');

  const cadenceText = present(env.SOREN_WATCHER_CADENCE_SECONDS) ? env.SOREN_WATCHER_CADENCE_SECONDS : '900';
  const cadence = Number(cadenceText);
  const validCadence = /^\d+$/.test(cadenceText) && Number.isSafeInteger(cadence) && cadence >= 60 && cadence <= 172800;
  note('watcher', !validCadence, 'watcher_cadence_invalid');
  const delivery = present(env.SOREN_WATCHER_DELIVERY_ENABLED) ? env.SOREN_WATCHER_DELIVERY_ENABLED : 'false';
  note('watcher', !['true', 'false'].includes(delivery), 'watcher_delivery_flag_invalid');
  if (delivery !== 'true') warnings.push('watcher_receipt_delivery_not_enabled');

  invalidIfPresent('releaseRunner', 'SOREN_VERCEL_CLI_SHA256', digest, 'vercel_cli_digest_invalid');
  if (present(env.SOREN_PRODUCTION_DOMAINS)) {
    const domains = env.SOREN_PRODUCTION_DOMAINS.split(',').map(value => value.trim());
    note('releaseRunner', domains.some(value => !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value)), 'production_domain_list_invalid');
  }
  if (present(env.SOREN_RELEASE_TRUST_JSON)) warnings.push('server_trust_json_does_not_replace_runner_trust_file');

  for (const component of Object.values(components)) {
    component.issues = [...new Set(component.issues)];
    component.configuration = component.issues.length ? 'INVALID' : component.missing.length ? 'INCOMPLETE' : 'READY_FOR_PROBE';
  }
  const probationCadenceConfigured = components.watcher.configuration === 'READY_FOR_PROBE' && validCadence && cadence === 60 && delivery === 'true';
  const externalGates = [
    'hosted_identity_and_database_evidence', 'deployment_secret_confinement',
    'owner_scheduler_profile_and_actual_delivery', 'independent_watcher_receipt_and_failure_domain_evidence',
    'owner_managed_signing_identity_and_authentic_verification', 'exact_staged_artifact_and_fresh_verification_evidence',
    'owner_exact_artifact_release_authorization', 'six_native_client_invocations_on_target_release',
    'vercel_atomic_parent_cas_unavailable',
  ];
  if (!probationCadenceConfigured) externalGates.push('independent_probation_cadence_at_most_60_seconds');
  return {
    scope: 'configuration_only', status: 'BLOCKED', capabilityMode,
    applicationAvailability: 'NOT_PROBED', hostedVerification: 'NOT_RUN',
    productionModified: false, promotionAuthorized: false, updaterArmed: false,
    automaticPromotionSupported: false, probationCadenceConfigured,
    components, issues, warnings, externalGates,
    note: 'Inspect each component in its own authorized runtime. Never copy all credentials into a public gateway or treat configured values as live verification.',
  };
}
