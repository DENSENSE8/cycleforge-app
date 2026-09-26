import { NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { withAuth } from '@/lib/auth/withAuth';

// Shipped state is now derived from station_activity_logs (SAL).
export const POST = withAuth(async (_req, ctx) => {
  const result = await tenantQuery(
    ctx.organizationId,
    `
      UPDATE orders o
      SET status = 'shipped'
      WHERE o.shipment_id IS NOT NULL
        AND (o.status IS NULL OR o.status != 'shipped')
        AND o.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM station_activity_logs sal
          WHERE sal.shipment_id IS NOT NULL
            AND sal.shipment_id = o.shipment_id
        )
      RETURNING o.id
    `,
    [ctx.organizationId],
  );

  await invalidateAllOrdersApiCaches(['orders-next', 'shipped', 'packing-logs'], ctx.organizationId);

  const updatedIds = (result.rows || []).map((r: any) => Number(r.id)).filter(Number.isFinite);
  if (updatedIds.length > 0) {
    await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: updatedIds, source: 'orders.check-shipped' });
  }

  return NextResponse.json({
    success: true,
    updatedCount: result.rowCount || 0,
    message:
      (result.rowCount || 0) > 0
        ? `Marked status=shipped on ${result.rowCount} order${result.rowCount === 1 ? '' : 's'} with packer logs`
        : 'No matching orders needed status update',
  });
}, { permission: 'shipping.mark_shipped' });
