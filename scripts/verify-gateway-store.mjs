#!/usr/bin/env node
/**
 * Probes a NON-PRODUCTION gateway store with the gateway credential only. It writes one budget claim
 * and one 30-second negative cache entry; it never reads or prints credential values.
 *
 * Real PostgREST denies a call the role may not make with HTTP 403, or with HTTP 404 when it hides the
 * unprivileged object from that role's schema cache. Both prove denial here: the same request machinery
 * is proven correct by the successful principal lookup, so a 404 is a privilege answer, not a route error.
 */
import {createHmac, randomBytes, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createGatewayStore} from '../lib/operations/store.mjs';

// Well-typed arguments, so a denial proves missing EXECUTE privilege rather than an unmatched signature.
const forbiddenRpcs = workspace => {
  const actor = randomUUID();
  return {
    get_workspace_status: {p_workspace_id: workspace, p_actor_id: actor},
    set_grant: {p_workspace_id: workspace, p_actor_id: actor, p_principal_id: randomUUID(), p_operations: ['skills:read'], p_expires_at: new Date(Date.now() + 60000).toISOString()},
    publish_catalog: {p_workspace_id: workspace, p_actor_id: actor, p_version_ids: [randomUUID()], p_expected_generation: 0},
    get_health_snapshot: {p_workspace_id: workspace},
  };
};
const decodeClaims = token => {
  try { const claims = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); return claims && typeof claims === 'object' ? claims : null; } catch { return null; }
};

export function preconditions(env) {
  const issues = [];
  if (env.SOREN_STORE_TARGET !== 'nonproduction') issues.push('SOREN_STORE_TARGET must be nonproduction');
  if (env.SOREN_ENVIRONMENT === 'production' || env.VERCEL_ENV === 'production') issues.push('production runtime refused');
  // The probe must prove the gateway credential alone is sufficient; an elevated key in scope would hide that.
  if (env.SUPABASE_SERVICE_ROLE_KEY) issues.push('SUPABASE_SERVICE_ROLE_KEY must not be set for this probe');
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SOREN_GATEWAY_DB_KEY', 'SOREN_WORKSPACE_ID', 'SOREN_RATE_KEY', 'SOREN_PROBE_SUBJECT', 'SOREN_PROBE_CLIENT_ID']) if (!env[name]) issues.push(`${name} missing`);
  if (env.SOREN_RATE_KEY && Buffer.byteLength(env.SOREN_RATE_KEY) < 32) issues.push('SOREN_RATE_KEY below 32 bytes');
  for (const ref of (env.SOREN_PRODUCTION_SUPABASE_REFS || '').split(',').map(value => value.trim()).filter(Boolean)) {
    try { if (new URL(env.SUPABASE_URL).hostname.split('.')[0] === ref) issues.push('SUPABASE_URL names a production project'); } catch { issues.push('SUPABASE_URL invalid'); }
  }
  const claims = env.SOREN_GATEWAY_DB_KEY ? decodeClaims(env.SOREN_GATEWAY_DB_KEY) : null;
  if (env.SOREN_GATEWAY_DB_KEY && !claims) issues.push('SOREN_GATEWAY_DB_KEY is not a JWT');
  if (claims && claims.role !== 'soren_gateway') issues.push('SOREN_GATEWAY_DB_KEY role is not soren_gateway');
  if (claims && claims.workspace_id !== env.SOREN_WORKSPACE_ID) issues.push('SOREN_GATEWAY_DB_KEY workspace_id does not match SOREN_WORKSPACE_ID');
  if (claims && !Number.isFinite(claims.exp)) issues.push('SOREN_GATEWAY_DB_KEY has no expiry');
  if (env.SOREN_GATEWAY_DB_KEY && env.SOREN_GATEWAY_DB_KEY === env.SUPABASE_ANON_KEY) issues.push('gateway key equals anon key');
  return {issues, keyExpiresAt: claims && Number.isFinite(claims.exp) ? new Date(claims.exp * 1000).toISOString() : null};
}

export async function verifyGatewayStore({env = process.env, fetchImpl = fetch} = {}) {
  const {issues, keyExpiresAt} = preconditions(env);
  if (issues.length) return {status: 'REFUSED', issues, checks: []};
  const origin = new URL(env.SUPABASE_URL).origin, checks = [];
  const check = async (name, run) => {
    try { const detail = await run(); checks.push({name, pass: true, ...(detail ? {detail} : {})}); }
    catch (error) { checks.push({name, pass: false, error: String(error?.message || error).slice(0, 200)}); }
  };
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const errorCode = async response => { try { return JSON.parse(await response.text())?.code ?? null; } catch { return null; } };
  const raw = (path, {bearer, body, method = 'POST'} = {}) => fetchImpl(`${origin}${path}`, {
    method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: {'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY, ...(bearer ? {Authorization: `Bearer ${bearer}`} : {})},
    ...(method === 'POST' ? {body: JSON.stringify(body ?? {})} : {}),
  });
  const denial = async response => {
    const code = await errorCode(response);
    if (![403, 404].includes(response.status)) throw new Error(`expected 403 permission denial or 404 schema-cache denial, got ${response.status}`);
    return {status: response.status, code};
  };
  const store = createGatewayStore({env, fetchImpl});
  const issuer = env.SOREN_PROBE_ISSUER || `${origin}/auth/v1`;
  const principalArgs = workspace => ({p_workspace_id: workspace, p_issuer: issuer, p_subject: env.SOREN_PROBE_SUBJECT, p_client_id: env.SOREN_PROBE_CLIENT_ID});

  await check('seeded agent principal resolves with skills:read only', async () => {
    const context = await store.getPrincipalContext({issuer, subject: env.SOREN_PROBE_SUBJECT, clientId: env.SOREN_PROBE_CLIENT_ID, workspaceId: env.SOREN_WORKSPACE_ID});
    expect(context?.kind === 'agent', 'principal not found or not an agent');
    expect(JSON.stringify(context.permissions) === JSON.stringify(['skills:read']), 'unexpected permissions');
    return {role: context.role, permissions: context.permissions};
  });
  await check('gateway key cannot resolve principals in another workspace', async () => {
    const response = await raw('/rest/v1/rpc/get_principal_context', {bearer: env.SOREN_GATEWAY_DB_KEY, body: principalArgs(randomUUID())});
    const code = await errorCode(response);
    expect(response.status === 403, `expected 403 workspace binding denial, got ${response.status}`);
    return {status: response.status, code};
  });
  await check('anon key alone cannot call gateway RPCs', async () => {
    const response = await raw('/rest/v1/rpc/get_principal_context', {body: principalArgs(env.SOREN_WORKSPACE_ID)});
    expect([401, 403, 404].includes(response.status), `expected denial, got ${response.status}`);
  });
  for (const [name, body] of Object.entries(forbiddenRpcs(env.SOREN_WORKSPACE_ID))) await check(`gateway key denied ${name}`, async () =>
    denial(await raw(`/rest/v1/rpc/${name}`, {bearer: env.SOREN_GATEWAY_DB_KEY, body})));
  await check('gateway key cannot read tables directly', async () =>
    denial(await raw('/rest/v1/grants?select=id&limit=1', {bearer: env.SOREN_GATEWAY_DB_KEY, method: 'GET'})));
  await check('federation budget claim succeeds for an HMAC subject', async () => {
    const subject = createHmac('sha256', env.SOREN_RATE_KEY).update(`probe:${randomUUID()}`).digest('hex');
    const budget = await store.rpc('claim_federation_budget', {p_subject: subject, p_authenticated: false});
    expect(budget?.allowed === true, 'budget denied');
  });
  await check('federation cache round-trips a negative entry and rejects an over-long negative TTL', async () => {
    const key = randomBytes(32).toString('hex'), value = {probe: true, providers: []};
    await store.rpc('put_federation_cache', {p_key: key, p_value: value, p_negative: true, p_ttl_seconds: 30});
    expect(JSON.stringify(await store.rpc('get_federation_cache', {p_key: key})) === JSON.stringify(value), 'cache value mismatch');
    let rejected = false;
    try { await store.rpc('put_federation_cache', {p_key: randomBytes(32).toString('hex'), p_value: value, p_negative: true, p_ttl_seconds: 31}); } catch { rejected = true; }
    expect(rejected, 'negative TTL above 30 s was accepted');
  });
  return {status: checks.every(c => c.pass) ? 'PASS' : 'FAIL', target: 'nonproduction', supabaseHost: new URL(origin).hostname, gatewayKeyExpiresAt: keyExpiresAt, checks};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await verifyGatewayStore();
  console.log(JSON.stringify({observedAt: new Date().toISOString(), ...report}, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}
