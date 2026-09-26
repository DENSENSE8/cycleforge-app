import { NextRequest, NextResponse } from 'next/server';
import { getBinsOverview } from '@/lib/neon/location-queries';
import { withAuth } from '@/lib/auth/withAuth';
import { specialBinBarcodesForOverview } from '@/lib/inventory/special-bins';
import { getReceivingReturnsTestBin } from '@/lib/settings/accessors';
import { getOrganization } from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** GET /api/inventory/bins-overview?room=…&q=… */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const room = req.nextUrl.searchParams.get('room');
    const q = req.nextUrl.searchParams.get('q');
    const org = await getOrganization(ctx.organizationId as OrgId);
    const returnsBarcode = org
      ? getReceivingReturnsTestBin(org.settings, process.env.RETURNS_TEST_BIN_BARCODE)
      : undefined;
    const specialBarcodes = specialBinBarcodesForOverview(returnsBarcode);
    const data = await getBinsOverview({
      room,
      q,
      orgId: ctx.organizationId,
      specialBarcodes,
    });
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error('[GET /api/inventory/bins-overview] error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to load bins overview' },
      { status: 500 },
    );
  }
}, { permission: 'sku_stock.view' });
