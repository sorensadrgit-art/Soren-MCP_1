import {authenticateRequest, errorResponse, HttpError, readJsonBody, requireConfiguration} from '../../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../../lib/operations/store.mjs';
import {validateWatcherReceipt} from '../../../../../lib/operations/watcher.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireConfiguration(process.env, ['SOREN_WATCHER_CLIENT_ID']);
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'receipts:write'});
    if (context.kind !== 'observer' || context.clientId !== process.env.SOREN_WATCHER_CLIENT_ID) throw new HttpError(403, 'watcher_identity_required');
    const receipt = validateWatcherReceipt(await readJsonBody(request));
    if (receipt.environment !== (process.env.SOREN_ENVIRONMENT || 'production')) throw new HttpError(403, 'watcher_environment_denied');
    return Response.json(await store.recordWatcherReceipt(context, receipt), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
