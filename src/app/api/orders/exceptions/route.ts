import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getOrderException,
  listOrderExceptions,
  ORDER_EXCEPTION_CATEGORIES,
  type OrderExceptionCategory,
  type OrderExceptionScope,
} from '@/lib/orders/order-exceptions';
export const dynamic = 'force-dynamic';

/** GET /api/orders/exceptions — the order-exception worklist. */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const orgId = ctx.organizationId as OrgId;
      const { searchParams } = new URL(req.url);

      const singleId = Number(searchParams.get('orderId'));
      if (Number.isFinite(singleId) && singleId > 0) {
        const row = await getOrderException(orgId, singleId);
        if (!row) {
          return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, exception: row });
      }

      const scope: OrderExceptionScope =
        searchParams.get('scope') === 'all' ? 'all' : 'actionable';
      const requestedCategory = searchParams.get('category');
      const category: OrderExceptionCategory | null =
        ORDER_EXCEPTION_CATEGORIES.includes(requestedCategory as OrderExceptionCategory)
          ? (requestedCategory as OrderExceptionCategory)
          : null;
      const rows = await listOrderExceptions(orgId, {
        scope,
        category,
        limit: Number(searchParams.get('limit')) || undefined,
        search: searchParams.get('q') ?? undefined,
      });

      return NextResponse.json({
        ok: true,
        scope,
        count: rows.length,
        exceptions: rows,
      });
    } catch (error) {
      return errorResponse(error, 'GET /api/orders/exceptions');
    }
  },
  { permission: 'orders.view' },
);
