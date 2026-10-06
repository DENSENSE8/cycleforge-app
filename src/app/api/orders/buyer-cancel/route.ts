import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { BUYER_CANCELLED_STATUS } from '@/lib/orders/buyer-cancelled';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { withTenantTransaction } from '@/lib/tenancy/db';

/** Mark selected orders buyer-cancelled. The rows stay; Allocate stops listing them. */

const Body = z.object({
  orderIds: z.array(z.number().int().positive()).min(1).max(500),
});

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const parsed = parseBody(Body, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const updatedIds = await withTenantTransaction(gate.ctx.organizationId, async (client) => {
      const result = await client.query<{ id: number }>(
        `UPDATE orders
            SET status = $2
          WHERE id = ANY($1::int[])
          RETURNING id`,
        [parsed.orderIds, BUYER_CANCELLED_STATUS],
      );
      return result.rows.map((row) => row.id);
    });

    if (updatedIds.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    await invalidateAllOrdersApiCaches(['shipped', 'packing-logs'], gate.ctx.organizationId);
    await publishOrderChanged({
      organizationId: gate.ctx.organizationId,
      orderIds: updatedIds,
      source: 'orders.buyer-cancel',
    });

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-buyer-cancel',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: updatedIds[0] ?? 0,
      after: { status: BUYER_CANCELLED_STATUS, orderIds: updatedIds },
    });

    return NextResponse.json({ success: true, updatedIds });
  } catch (error: unknown) {
    console.error('[POST /api/orders/buyer-cancel] error:', error);
    const details = error instanceof Error ? error.message : 'Failed to mark buyer cancelled';
    return NextResponse.json({ error: 'Failed to mark buyer cancelled', details }, { status: 500 });
  }
}
