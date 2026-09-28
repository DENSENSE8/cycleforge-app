import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { OrderBuyerPatchBody } from '@/lib/schemas/customers';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { updateOrderBuyer } from '@/lib/orders/order-buyer';
import { invalidateOrderViews } from '@/lib/orders/invalidation';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishRepairChanged } from '@/lib/realtime/publish';
import pool from '@/lib/db';

/**
 * PATCH /api/orders/[id]/buyer — staff correct the order's buyer (name / email /
 * phone / ship-to) from the order record. The corrected ship-to is what labels
 * are bought to (see `resolveOrderShipTo`). An order with no customer row gets
 * one created from its ShipStation ship-to and linked to all its lines.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid order id' }, { status: 400 });
    }

    const parsed = parseBody(OrderBuyerPatchBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId;
    const result = await updateOrderBuyer(orgId, id, parsed);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    if (result.changed) {
      await invalidateOrderViews({ organizationId: orgId, orderIds: result.orderRowIds, source: 'orders.buyer' });
      if (result.repairIds.length > 0) {
        await invalidateCacheTags(['repair-service']);
        await publishRepairChanged({ organizationId: orgId, repairIds: result.repairIds, source: 'orders.buyer' });
      }
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-api',
        action: AUDIT_ACTION.ORDER_BUYER_UPDATE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: id,
        before: result.before,
        after: result.after,
        extra: { customerId: result.customerId, customerCreated: result.customerCreated, orderRowIds: result.orderRowIds },
      });
    }

    return NextResponse.json({
      ok: true,
      customerId: result.customerId,
      customerCreated: result.customerCreated,
      changed: result.changed,
      orderRowIds: result.orderRowIds,
    });
  } catch (error: unknown) {
    console.error('[PATCH /api/orders/[id]/buyer] error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update the buyer' }, { status: 500 });
  }
}
