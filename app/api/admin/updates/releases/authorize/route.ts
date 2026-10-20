import { createReleaseIngress } from '../../../../../../lib/updates/ingress.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = createReleaseIngress();
export const POST = (request: Request) => handle(request, 'authorize');
