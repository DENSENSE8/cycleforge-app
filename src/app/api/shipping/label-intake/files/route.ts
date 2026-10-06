import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { printFileQuerySchema } from '@/lib/label-prints/print-file-contracts';
import { listPrintFiles } from '@/lib/label-prints/print-files';

export const dynamic = 'force-dynamic';

/**
 * GET /api/shipping/label-intake/files — Labels & docs › Bulk: one row per
 * uploaded PDF (`PrintFileQueue`) with the print-status counts. `?sort=`,
 * `?printing=`, `?from=` / `?to=` (uploaded), `?printedFrom=` / `?printedTo=`,
 * `?q=`, `?limit=`, `?offset=`.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parsed = printFileQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid files query.', issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await listPrintFiles(ctx.organizationId, parsed.data));
}, { permission: 'shipping.view' });
