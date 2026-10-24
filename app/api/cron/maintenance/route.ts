import {authorizeCron, errorResponse} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
import {runMaintenance} from '../../../../lib/operations/maintenance.mjs';
import {getVercelOidcToken} from '@vercel/oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET(
  request: Request,
  options: {
    getOidcToken?: typeof getVercelOidcToken;
    store?: ReturnType<typeof getOperationsStore>;
    runner?: typeof runMaintenance;
  } = {}
) {
  try {
    authorizeCron(request);
    const getOidcToken = options.getOidcToken ?? getVercelOidcToken;
    const store = options.store ?? getOperationsStore();
    const runner = options.runner ?? runMaintenance;
    let oidcToken = '';
    try { oidcToken = await getOidcToken(); } catch { /* Provider configuration remains explicitly UNKNOWN. */ }
    const result = await runner({store, oidcToken});
    return Response.json(result, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
