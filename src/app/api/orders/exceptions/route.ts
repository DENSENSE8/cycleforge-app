import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getOrderException,
  listOrderExceptions,
  type OrderExceptionScope,
} from '@/lib/orders/order-exceptions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/exceptions — the order-exception worklist.
 *
 * Read-only. Every FIX this surface performs goes through an endpoint that
 * already exists (`PATCH /api/orders/[id]`, `POST /api/sku-catalog`,
 * `POST /api/sku-catalog/pair`, `POST /api/orders/[id]/cage-release`), so this
 * route adds a question to the system and no new way to write.
 *
 * Query:
 *   ?scope=actionable|all   default `actionable` (excludes shipped)
 *   ?q=                     order # / item # / SKU / title
 *   ?limit=                 1–500, default 200
 *   ?orderId=               single row (the editor's read-after-write)
 */
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
      const rows = await listOrderExceptions(orgId, {
        scope,
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
