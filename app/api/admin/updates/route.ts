import { createUpdateAdmin } from '../../../../lib/updates/admin.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handle = createUpdateAdmin();
export const GET = (request: Request) => handle(request, 'status');
