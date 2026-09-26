import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { countCagedOrders, listCagedOrders } from '@/lib/orders/caged-orders';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** GET /api/orders/caged — the pairing-held set (R-FLOW-7). */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId as OrgId;
    const { searchParams } = new URL(req.url);

    if (searchParams.get('countOnly') === '1') {
      const count = await countCagedOrders(orgId);
      return NextResponse.json({ success: true, count });
    }

    const limitRaw = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

    const [orders, count] = await Promise.all([
      listCagedOrders(orgId, { limit }),
      countCagedOrders(orgId),
    ]);

    return NextResponse.json({ success: true, orders, count });
  },
  { permission: 'orders.view' },
);
