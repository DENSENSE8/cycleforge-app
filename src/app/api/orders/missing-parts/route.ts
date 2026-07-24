import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { clearReplenishmentForOrder, ensureReplenishmentForOrder } from '@/lib/replenishment';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';

/**
 * POST /api/orders/missing-parts - Move order to missing parts status
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const { orderId, reason, isOutOfStock } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      );
    }

    // Determine the boolean value for is_out_of_stock
    // Priority: isOutOfStock boolean > reason presence
    let outOfStockBoolean: boolean;
    if (isOutOfStock !== undefined) {
      outOfStockBoolean = Boolean(isOutOfStock);
    } else {
      // Legacy: if reason is provided and non-empty, consider it out of stock
      outOfStockBoolean = Boolean(String(reason || '').trim());
    }

    // Update order and record audit in transaction
    await withTenantTransaction(ctx.organizationId, async (client) => {
      // Update order to mark missing parts status
      await client.query(
        'UPDATE orders SET is_out_of_stock = $1 WHERE id = $2 AND organization_id = $3',
        [outOfStockBoolean, orderId, ctx.organizationId]
      );

      // Record audit log
      await recordAudit(client, ctx, req, {
        source: 'api.orders.missing-parts',
        action: AUDIT_ACTION.ORDER_ASSIGNMENT_UPDATED,
        entityType: 'ORDER',
        entityId: String(orderId),
        after: { isOutOfStock: outOfStockBoolean },
        extra: {
          orderId: Number(orderId),
          changedFieldKeys: ['isOutOfStock'],
        },
      });
    });

    if (process.env.FEATURE_REPLENISHMENT === 'true') {
      if (outOfStockBoolean) {
        await ensureReplenishmentForOrder({
          orderId: Number(orderId),
          reason: 'Out of stock',
          changedBy: 'staff',
          forceFullQuantity: true,
        }, ctx.organizationId);
      } else {
        await clearReplenishmentForOrder(Number(orderId), 'staff', ctx.organizationId);
      }
    }

    await invalidateAllOrdersApiCaches(['shipped', 'need-to-order'], ctx.organizationId);
    await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: [Number(orderId)], source: 'orders.missing-parts' });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking order as missing parts:', error);
    return NextResponse.json(
      { error: 'Failed to update order', details: error.message },
      { status: 500 }
    );
  }
}, { permission: 'orders.create' });
