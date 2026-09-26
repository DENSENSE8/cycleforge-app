import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { setOrderPrice } from '@/lib/orders/set-order-price';

/** The sold price of an order line (`orders.sale_amount`). */

const OrderPriceBody = z
  .object({
    /** The numeric `orders.id` — one line. What a table row edit sends. */
    orderId: z.number().int().positive().optional(),
    orderNumber: z.string().trim().min(1).max(128).optional(),
    /**
     * Integer cents, or null to clear. `int()` is the guard that matters:
     * 19.5 cents is not a price, and silently rounding an operator's typo into
     * revenue is worse than refusing it.
     */
    priceCents: z.number().int().min(0).nullable(),
    currency: z.string().trim().length(3).optional(),
  })
  .refine((body) => (body.orderId === undefined) !== (body.orderNumber === undefined), {
    message: 'Supply exactly one of orderId or orderNumber',
    path: ['orderId'],
  });

export async function PUT(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.set_price');
    if (gate.denied) return gate.denied;

    const parsed = parseBody(OrderPriceBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const result = await setOrderPrice({
      organizationId: gate.ctx.organizationId,
      orderId: parsed.orderId ?? null,
      orderNumber: parsed.orderNumber ?? null,
      priceCents: parsed.priceCents,
      currency: parsed.currency ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          reason: result.reason,
          ...(result.reason === 'ambiguous_order_number' ? { lines: result.lines } : {}),
        },
        { status: result.status },
      );
    }

    // `sale_amount` is in the Redis-cached /api/orders payload (the price the
    // row renders), so without this the correction is invisible for 300s.
    await invalidateAllOrdersApiCaches([], gate.ctx.organizationId);
    await publishOrderChanged({
      organizationId: gate.ctx.organizationId,
      orderIds: [result.orderId],
      source: 'orders.set-price',
    });

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-price-api',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: result.orderId,
      before: result.before,
      after: result.after,
      extra: { order_number: result.orderNumber, field: 'sale_amount' },
    });

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      before: result.before,
      after: result.after,
    });
  } catch (error: unknown) {
    console.error('[PUT /api/orders/price] error:', error);
    return NextResponse.json(
      { error: 'Failed to set order price', details: error instanceof Error ? error.message : undefined },
      { status: 500 },
    );
  }
}
