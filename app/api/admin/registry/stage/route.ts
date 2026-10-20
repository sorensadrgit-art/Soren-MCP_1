import {authenticateRequest, errorResponse, readJsonBody} from '../../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../../lib/operations/store.mjs';
import {prepareSkillVersion} from '../../../../../lib/registry/identity.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'reviews:write', human: true});
    const version = prepareSkillVersion(await readJsonBody(request, 2200000));
    return Response.json({versionId: await store.stageVersion(context, version), manifestSha256: version.manifestSha256}, {status: 201, headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
