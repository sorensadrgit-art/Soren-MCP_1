import {authorizeCron, errorResponse} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
import {runMaintenance} from '../../../../lib/operations/maintenance.mjs';
import {getVercelOidcToken} from '@vercel/oidc';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;
export async function GET(request: Request) {
  try {
    authorizeCron(request);
    let oidcToken = '';
    try { oidcToken = await getVercelOidcToken(); } catch { /* Provider configuration remains explicitly UNKNOWN. */ }
    const result = await runMaintenance({store: getOperationsStore(), oidcToken});
    return Response.json(result, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
