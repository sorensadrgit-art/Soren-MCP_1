import {authenticateRequest, errorResponse, readJsonBody, HttpError} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
import {isDigest, isUuid} from '../../../../lib/registry/identity.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'reviews:write', human: true});
    const versionId = new URL(request.url).searchParams.get('versionId');
    if (!isUuid(versionId)) throw new HttpError(400, 'invalid_version');
    if (!isDigest(process.env.SOREN_REVIEW_POLICY_SHA256)) throw new HttpError(503, 'review_policy_unavailable');
    return Response.json({...await store.getReviewDetails(context, versionId), policySha256: process.env.SOREN_REVIEW_POLICY_SHA256}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const store = getOperationsStore();
    const context = await authenticateRequest(request, {store, permission: 'reviews:write', human: true});
    const value = await readJsonBody(request);
    if (Object.keys(value).some(key => !['versionId', 'manifestSha256', 'decision', 'expectedReviewRevision', 'policySha256', 'evidenceRef'].includes(key))
      || !isUuid(value.versionId) || !isDigest(value.manifestSha256) || !isDigest(value.policySha256) || !['approve', 'reject'].includes(value.decision)
      || !Number.isSafeInteger(value.expectedReviewRevision) || value.expectedReviewRevision < 0 || typeof value.evidenceRef !== 'string' || !value.evidenceRef || value.evidenceRef.length > 256) throw new HttpError(400, 'invalid_review');
    if (!isDigest(process.env.SOREN_REVIEW_POLICY_SHA256)) throw new HttpError(503, 'review_policy_unavailable');
    if (value.policySha256 !== process.env.SOREN_REVIEW_POLICY_SHA256) throw new HttpError(409, 'review_policy_changed');
    return Response.json(await store.reviewVersion(context, value), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
