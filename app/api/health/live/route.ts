export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  const revision = /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA || '') ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) : 'unknown';
  return Response.json({status: 'live', revision}, {headers: {'Cache-Control': 'no-store'}});
}
