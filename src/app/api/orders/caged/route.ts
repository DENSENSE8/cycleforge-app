import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { countCagedOrders, listCagedOrders } from '@/lib/orders/caged-orders';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/caged — the CAGED set for the To-ship desk.
 *
 * The main queue (`/api/orders?fulfillmentScope=true`) requires
 * `shipment_id IS NOT NULL` and a non-blank tracking number, so a caged order —
 * which is caged precisely because facts like tracking are still missing — can
 * never appear there. That is why this is its own endpoint rather than a flag
 * on the queue: the two lists ask opposite questions.
 *
 * Every row arrives with its LIVE G1/G2/G3 evaluation attached, so the desk can
 * show which gate each caged order is waiting on without a second round trip
 * per row.
 *
 * `?countOnly=1` returns just the number — what the desk's Caged facet needs to
 * label itself without paying for the rows.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId as OrgId;
    const { searchParams } = new URL(req.url);

    try {
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
    } catch (error) {
      console.error('Error in GET /api/orders/caged:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load caged orders' },
        { status: 500 },
      );
    }
  },
  { permission: 'orders.view' },
);
