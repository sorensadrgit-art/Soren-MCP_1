import {authenticateRequest, errorResponse, readJsonBody, HttpError} from '../../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../../lib/operations/store.mjs';
import {isUuid} from '../../../../../lib/registry/identity.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, human: true, owner: true});
    const value = await readJsonBody(request);
    if (!isUuid(value.versionId) || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 256) throw new HttpError(400, 'invalid_revocation');
    return Response.json({revocationId: await store.revokeVersion(context, value)}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
