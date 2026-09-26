import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { refreshAmazonOrderItemFacts } from '@/lib/amazon/order-item-refresh';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

/** POST /api/orders/[id]/amazon-refresh */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderDbId = parseId(rawId);
  if (orderDbId === null) {
    return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });
  }

  const orgId = gate.ctx.organizationId as OrgId;

  try {
    const result = await refreshAmazonOrderItemFacts(orgId, orderDbId);

    if (!result.ok) {
      const status =
        result.code === 'not_found' ? 404
          : result.code === 'not_amazon' || result.code === 'no_order_id' ? 400
            : result.code === 'no_account' ? 409
              : 502;
      return NextResponse.json({ success: false, error: result.error, code: result.code }, { status });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-amazon-refresh-api',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderDbId,
      after: {
        source: 'amazon-refresh',
        amazonOrderId: result.amazonOrderId,
        itemNumber: result.itemNumber,
        productTitle: result.productTitle,
        sku: result.sku,
        updated: result.updated,
      },
    });

    after(() => {
      void invalidateAllOrdersApiCaches([], orgId);
      void publishOrderChanged({
        organizationId: orgId,
        orderIds: [orderDbId],
        source: 'orders.amazon-refresh',
      });
    });

    return NextResponse.json({
      success: true,
      itemNumber: result.itemNumber,
      productTitle: result.productTitle,
      sku: result.sku,
      updated: result.updated,
    });
  } catch (error) {
    console.error('Error in POST /api/orders/[id]/amazon-refresh:', error);
    return NextResponse.json({ success: false, error: 'Amazon refresh failed' }, { status: 500 });
  }
}
