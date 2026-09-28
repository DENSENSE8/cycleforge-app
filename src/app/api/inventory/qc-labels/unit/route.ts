import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { findQcLabelPrintUnit } from '@/lib/labels/qc-labels-queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inventory/qc-labels/unit?scan=<QC label | serial> — the unit the
 * Inventory › QC labels desk prints a label for (`QcLabelsLedger` Print).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const scan = req.nextUrl.searchParams.get('scan')?.trim() ?? '';
  if (!scan) {
    return NextResponse.json({ ok: false, error: 'scan is required' }, { status: 400 });
  }
  const unit = await findQcLabelPrintUnit(ctx.organizationId, scan);
  if (!unit) {
    return NextResponse.json({ ok: false, error: `No unit with serial or label ${scan}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, unit });
}, { permission: 'print.label' });
