import {timingSafeEqual} from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

const deny = (code = 'unauthorized') => { throw new HttpError(401, code); };
export const errorResponse = error => Response.json(
  {error: error instanceof HttpError ? error.code : 'service_unavailable'},
  {status: error instanceof HttpError ? error.status : 503, headers: {'Cache-Control': 'no-store'}},
);

export function requireConfiguration(env, names) {
  if (names.some(name => typeof env[name] !== 'string' || !env[name].trim())) throw new HttpError(503, 'private_configuration_unavailable');
}

export async function readBoundedText(response, maximumBytes, errorCode = 'response_too_large') {
  const reader = response.body?.getReader(); const chunks = []; let length = 0;
  if (!reader) return '';
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) { await reader.cancel(); throw new HttpError(503, errorCode); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function authorizeCron(request, env = process.env) {
  requireConfiguration(env, ['CRON_SECRET']);
  // The operator supplies at least 32 random bytes; length alone does not establish entropy.
  if (Buffer.byteLength(env.CRON_SECRET) < 32) throw new HttpError(503, 'scheduler_configuration_unavailable');
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) deny();
}

export async function readJsonBody(request, maximumBytes = 16384) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new HttpError(415, 'json_required');
  if (Number(request.headers.get('content-length')) > maximumBytes) throw new HttpError(413, 'body_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'invalid_body');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); throw new HttpError(413, 'body_too_large'); }
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'invalid_body'); }
}

function verifiedClaims(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part))) deny();
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) deny();
    return claims;
  } catch { deny(); }
}

/** @param {Request} request @param {{env?:any, fetchImpl?:any, store?:any, permission?:string, human?:boolean, owner?:boolean, now?:number}} [options] */
export async function authenticateRequest(request, {
  env = process.env, fetchImpl = fetch, store, permission, human = false, owner = false, now = Date.now(),
} = {}) {
  requireConfiguration(env, ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SOREN_WORKSPACE_ID', 'SOREN_AUTH_AUDIENCE', 'SOREN_AUTH_RESOURCE', 'SOREN_AUTH_CLIENT_ID']);
  if (!store) throw new HttpError(503, 'private_store_unavailable');
  let header = request.headers.get('authorization') || '';
  if (!request.headers.has('authorization') && request.headers.has('cookie')) {
    const {readManagementSession} = await import('../management-session.mjs');
    const sessionToken = await readManagementSession(request, env);
    if (sessionToken) header = `Bearer ${sessionToken}`;
  }
  if (!/^Bearer [\w.-]+$/.test(header) || header.length > 16384) deny();
  const token = header.slice(7);
  let authOrigin;
  try { authOrigin = new URL(env.SUPABASE_URL); } catch { throw new HttpError(503, 'private_configuration_unavailable'); }
  if (authOrigin.protocol !== 'https:' || authOrigin.username || authOrigin.password || authOrigin.pathname !== '/' || authOrigin.search || authOrigin.hash) throw new HttpError(503, 'private_configuration_unavailable');
  const issuer = `${authOrigin.origin}/auth/v1`;
  let response, user;
  try {
    // Supabase validates signature/session/revocation. Decoding below only enforces additional application bindings.
    response = await fetchImpl(`${issuer}/user`, {headers: {Authorization: header, apikey: env.SUPABASE_ANON_KEY}, redirect: 'error', signal: AbortSignal.timeout(5000), cache: 'no-store'});
    if (!response.ok) { if (response.status === 401 || response.status === 403) deny(); throw new HttpError(503, 'identity_service_unavailable'); }
    const body = await readBoundedText(response, 65536, 'identity_service_unavailable');
    user = JSON.parse(body);
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, 'identity_service_unavailable'); }
  const claims = verifiedClaims(token);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!user?.id || claims.sub !== user.id || claims.iss !== issuer || !audiences.includes(env.SOREN_AUTH_AUDIENCE)
    || !Number.isFinite(claims.exp) || claims.exp <= now / 1000
    || (Object.hasOwn(claims, 'nbf') && (!Number.isFinite(claims.nbf) || claims.nbf > now / 1000))
    || claims.resource !== env.SOREN_AUTH_RESOURCE) deny('invalid_token_binding');
  const allowedClients = env.SOREN_AUTH_CLIENT_ID.split(',').map(value => value.trim()).filter(Boolean);
  if (typeof claims.client_id !== 'string' || !allowedClients.includes(claims.client_id)) deny('invalid_client');
  const context = await store.getPrincipalContext({issuer: claims.iss, subject: claims.sub, clientId: claims.client_id, workspaceId: env.SOREN_WORKSPACE_ID});
  if (!context || context.revoked || context.workspaceId !== env.SOREN_WORKSPACE_ID) throw new HttpError(403, 'workspace_access_denied');
  const result = {...context, permissions: new Set(context.permissions || []), accessToken: token};
  if (human || owner) {
    requireConfiguration(env, ['SOREN_MANAGEMENT_CLIENT_ID', 'SOREN_ADMIN_ORIGIN']);
    if (claims.client_id !== env.SOREN_MANAGEMENT_CLIENT_ID || context.kind !== 'human' || !['reviewer', 'owner'].includes(context.role)) throw new HttpError(403, 'human_session_required');
    if (!Number.isFinite(claims.auth_time) || now - claims.auth_time * 1000 > 15 * 60 * 1000 || claims.auth_time * 1000 > now + 5000) throw new HttpError(403, 'recent_authentication_required');
    const origin = request.headers.get('origin');
    if ((!['GET', 'HEAD'].includes(request.method) || origin) && origin !== env.SOREN_ADMIN_ORIGIN) throw new HttpError(403, 'origin_denied');
    result.isHuman = true;
  }
  if (owner && context.role !== 'owner') throw new HttpError(403, 'owner_required');
  if (permission && !result.permissions.has(permission)) throw new HttpError(403, 'permission_denied');
  return result;
}
