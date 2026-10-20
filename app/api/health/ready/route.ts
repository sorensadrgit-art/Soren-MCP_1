import {getReadiness} from '../../../../lib/operations/readiness.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const result = await getReadiness();
  return Response.json(result, {status: result.ready ? 200 : 503, headers: {'Cache-Control': 'no-store'}});
}
