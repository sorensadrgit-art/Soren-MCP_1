import {authenticateRequest, errorResponse, readJsonBody, HttpError} from '../../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../../lib/operations/store.mjs';
import {isUuid} from '../../../../../lib/registry/identity.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'reviews:write', human: true});
    const value = await readJsonBody(request);
    if (!Array.isArray(value.versionIds) || value.versionIds.length > 500 || value.versionIds.some(id => !isUuid(id)) || new Set(value.versionIds).size !== value.versionIds.length || !Number.isSafeInteger(value.expectedGeneration) || value.expectedGeneration < 0) throw new HttpError(400, 'invalid_catalog');
    return Response.json({generationId: await store.publishCatalog(context, value)}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
