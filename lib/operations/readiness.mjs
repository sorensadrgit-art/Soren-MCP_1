import {bundledReadiness} from './maintenance.mjs';
import {getOperationsStore} from './store.mjs';
import {publicReadiness} from './health.mjs';
import {requireConfiguration} from '../security/auth.mjs';

let cached = null;
export async function getReadiness({env = process.env, now = Date.now(), createStore = getOperationsStore, fetchImpl = fetch} = {}) {
  const mode = env.SOREN_CAPABILITY_MODE === 'private_enabled' ? 'private_enabled' : 'public_only';
  const bundledReady = bundledReadiness();
  if (mode === 'public_only') return publicReadiness({mode, bundledReady, now});
  try { requireConfiguration(env, ['SUPABASE_ANON_KEY', 'SOREN_AUTH_AUDIENCE', 'SOREN_AUTH_RESOURCE', 'SOREN_AUTH_CLIENT_ID']); }
  catch { return publicReadiness({mode, bundledReady, now}); }
  if (cached && cached.expiresAt > now && cached.origin === env.SUPABASE_URL) return publicReadiness({...cached.value, mode, bundledReady, now});
  let privateReady = false;
  try {
    const [snapshot, auth] = await Promise.all([
      createStore(env).getHealthSnapshot(),
      fetchImpl(`${env.SUPABASE_URL}/auth/v1/health`, {headers: {apikey: env.SUPABASE_ANON_KEY || ''}, signal: AbortSignal.timeout(3000), redirect: 'error', cache: 'no-store'}),
    ]);
    privateReady = snapshot != null && auth.ok;
  } catch { privateReady = false; }
  const value = {privateReady, observedAt: new Date(now).toISOString()};
  cached = {origin: env.SUPABASE_URL, expiresAt: now + 15000, value};
  return publicReadiness({...value, mode, bundledReady, now});
}
