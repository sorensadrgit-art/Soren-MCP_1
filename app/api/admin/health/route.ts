import {authenticateRequest, errorResponse} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const store = getOperationsStore();
    await authenticateRequest(request, {store, permission: 'health:read'});
    return Response.json(await store.getHealthSnapshot(), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
