import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolvePackScan } from '@/lib/packing/pack-scan';

/**
 * GET /api/packing/resolve-scan?scan= — what a pack-station scan is: a tote
 * (→ its pack job), a paired bin (→ its SKUs), or a unit serial / tracking
 * (→ its order). Read-only; see {@link resolvePackScan}.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const scan = req.nextUrl.searchParams.get('scan')?.trim();
  if (!scan || scan.length > 512) {
    return NextResponse.json({ success: false, error: 'Scan a serial, bin or tote' }, { status: 400 });
  }

  const result = await resolvePackScan(ctx.organizationId, scan);
  if (!result) {
    return NextResponse.json(
      { success: false, error: `Nothing matches "${scan}" — scan a unit serial, its bin or its tote` },
      { status: 404 },
    );
  }
  if (result.kind === 'refused') {
    return NextResponse.json({ success: false, error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true, result });
}, { permission: 'packing.view' });
