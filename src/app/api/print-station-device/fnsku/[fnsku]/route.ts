/** GET /api/print-station-device/fnsku/[fnsku] — the catalog title and condition an enrolled station prints on an FBA label. */

import { NextRequest, NextResponse } from 'next/server';
import { withPrintStationAuth } from '@/lib/auth/withPrintStationAuth';
import { tenantQuery } from '@/lib/tenancy/db';

export const runtime = 'nodejs';

const FNSKU_RE = /^[A-Z0-9]{1,40}$/;

// Same row shape as `/api/admin/fba-fnskus/[fnsku]` (the staff station's read), so
// `printFnskuStationJob` reads either. The wrapper ignores route params: the key is the last path segment.
export const GET = withPrintStationAuth(async (req: NextRequest, ctx) => {
  const fnsku = decodeURIComponent(req.nextUrl.pathname.split('/').at(-1) ?? '').trim().toUpperCase();
  if (!FNSKU_RE.test(fnsku)) return NextResponse.json({ success: false, error: 'FNSKU is required' }, { status: 400 });
  const { rows } = await tenantQuery<{ fnsku: string; product_title: string | null; condition: string | null }>(
    ctx.organizationId,
    `SELECT fnsku, product_title, condition
       FROM fba_fnskus
      WHERE organization_id = $1 AND fnsku = $2`,
    [ctx.organizationId, fnsku],
  );
  if (!rows[0]) return NextResponse.json({ success: false, error: 'FNSKU not found' }, { status: 404 });
  return NextResponse.json({ success: true, fnsku: rows[0] }, { headers: { 'cache-control': 'no-store' } });
});
