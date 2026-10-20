import {authenticateRequest, errorResponse, readJsonBody, HttpError} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
import {isUuid} from '../../../../lib/registry/identity.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const grantOperations = ['skills:read', 'receipts:write', 'health:read', 'health:observe', 'maintenance:run', 'updates:read', 'updates:promote', 'updates:pause', 'updates:evidence'];
export async function POST(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'grants:write', human: true, owner: true});
    const value = await readJsonBody(request);
    if (!isUuid(value.principalId) || !Array.isArray(value.operations) || !value.operations.length || value.operations.some(operation => !grantOperations.includes(operation)) || !Number.isFinite(Date.parse(value.expiresAt))) throw new HttpError(400, 'invalid_grant');
    return Response.json({grantId: await store.setGrant(context, value)}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'grants:write', human: true, owner: true});
    const value = await readJsonBody(request);
    if (!isUuid(value.grantId) || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 1) throw new HttpError(400, 'invalid_grant');
    await store.revokeGrant(context, value);
    return Response.json({revoked: true}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
