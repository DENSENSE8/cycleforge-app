import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveToteScan, toteScanRefusal } from '@/lib/picking/tote-scan';

/** A read-only dispatch: resolving a scan never changes the tote or its order. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const scan = req.nextUrl.searchParams.get('scan')?.trim();
  if (!scan || scan.length > 512) {
    return NextResponse.json({ success: false, error: 'Scan a tote label to start packing' }, { status: 400 });
  }

  const tote = await resolveToteScan(ctx.organizationId, scan);
  if (!tote) {
    return NextResponse.json({ success: false, error: 'Tote not found' }, { status: 404 });
  }
  const refusal = toteScanRefusal(tote);
  if (refusal) {
    return NextResponse.json({ success: false, error: refusal, toteCode: tote.code }, { status: 409 });
  }
  return NextResponse.json({
    success: true,
    toteId: tote.toteId,
    toteCode: tote.code,
    orderId: tote.orderId,
    tracking: tote.tracking,
    packHref: `/m/pack/start/${tote.orderId}`,
  });
}, { permission: 'packing.view' });
