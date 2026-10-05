/** GET /api/print-station-device/qc-label — resolve one product label under the paired station's tenant. */

import { NextRequest, NextResponse } from 'next/server';
import { withPrintStationAuth } from '@/lib/auth/withPrintStationAuth';
import { findQcLabelPrintUnit } from '@/lib/labels/qc-labels-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withPrintStationAuth(async (req: NextRequest, ctx) => {
  const scan = req.nextUrl.searchParams.get('scan')?.trim() ?? '';
  if (!scan) return NextResponse.json({ ok: false, error: 'scan is required' }, { status: 400 });
  const unit = await findQcLabelPrintUnit(ctx.organizationId, scan);
  if (!unit) {
    return NextResponse.json({ ok: false, error: `No unit or package with label ${scan}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, unit }, { headers: { 'cache-control': 'no-store' } });
});
