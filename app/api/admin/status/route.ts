import {authenticateRequest, errorResponse} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'dashboard:read', human: true});
    const status = await store.getWorkspaceStatus(context.subjectId);
    return Response.json({...status, capabilityMode: 'private_enabled', principal: {role: context.role, kind: context.kind, clientId: context.clientId, permissions: [...context.permissions], grantRevision: context.grantRevision}}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
