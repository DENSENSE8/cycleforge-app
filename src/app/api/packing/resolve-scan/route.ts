import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolvePackScan } from '@/lib/packing/pack-scan-order';
import { withTenantTransaction } from '@/lib/tenancy/db';

/**
 * GET /api/packing/resolve-scan?scan= — which order a tote or unit scan packs.
 * A read-only dispatch: resolving never changes the tote, the unit or the
 * order. The hub href asks the pack hub to print the order's bundle on entry.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const scan = req.nextUrl.searchParams.get('scan')?.trim();
  if (!scan || scan.length > 512) {
    return NextResponse.json({ success: false, error: 'Scan a tote or unit label to start packing' }, { status: 400 });
  }

  const target = await withTenantTransaction(ctx.organizationId, (client) =>
    resolvePackScan(client, ctx.organizationId, scan),
  );
  if (!target) {
    return NextResponse.json({ success: false, error: 'No tote or unit matches this scan' }, { status: 404 });
  }
  if (target.kind === 'refused') {
    return NextResponse.json({ success: false, error: target.error }, { status: 409 });
  }
  if (target.kind === 'unit-not-on-order') {
    return NextResponse.json({ success: false, error: target.error }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    via: target.via,
    orderId: target.orderId,
    toteCode: target.via === 'tote' ? target.toteCode : null,
    serialUnitId: target.via === 'unit' ? target.serialUnitId : null,
    packHref: `/m/pack/start/${target.orderId}?print=1`,
  });
}, { permission: 'packing.view' });
