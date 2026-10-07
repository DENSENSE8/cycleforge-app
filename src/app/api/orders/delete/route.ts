import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { deleteOrderDependentsInTx, releaseOrderAllocationsForDeletion } from '@/lib/neon/orders-queries';

/** POST /api/orders/delete - Delete one or more orders Body: */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { orderId, orderIds } = body;

  if (!orderId && (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0)) {
    return NextResponse.json(
      { error: 'orderId or orderIds array is required' },
      { status: 400 }
    );
  }

  const requestedIds: number[] = orderId ? [orderId] : orderIds;

  // An order number (order_id) can carry multiple rows in `orders`:
  const productKeyExpr = (a: string) => `COALESCE(
        NULLIF('cat:' || ${a}.sku_catalog_id::text, 'cat:'),
        NULLIF('sku:' || lower(trim(${a}.sku)), 'sku:'),
        NULLIF('title:' || lower(regexp_replace(trim(coalesce(${a}.product_title, '')), '\\s+', ' ', 'g')), 'title:')
      )`;
  const txOutcome = await withTenantTransaction(ctx.organizationId, async (client) => {
    const expanded = await client.query(
      `WITH targets AS (
           SELECT t.order_id, ${productKeyExpr('t')} AS pkey
             FROM orders t
            WHERE t.id = ANY($1::int[]) AND t.order_id IS NOT NULL AND t.order_id <> ''
              AND t.organization_id = $2
         )
         SELECT o.id, o.order_id, o.product_title, o.sku, o.condition, o.status, o.shipment_id, o.customer_id, o.created_at
           FROM orders o
          WHERE o.organization_id = $2
            AND (
              o.id = ANY($1::int[])
              OR EXISTS (
                   SELECT 1 FROM targets tg
                    WHERE tg.order_id = o.order_id
                      AND tg.pkey IS NOT DISTINCT FROM ${productKeyExpr('o')}
                 )
            )`,
      [requestedIds, ctx.organizationId],
    );
    const beforeRows = expanded;
    const idsToDelete: number[] = expanded.rows.map((r) => Number(r.id));

    if (idsToDelete.length === 0) {
      return { notFound: true as const };
    }

    // Deleting an order also owns its allocation edges. Release active units
    // safely and remove those rows before the restrictive FK sees the parent
    // delete, so operators do not have to clear allocations separately.
    for (const id of idsToDelete) {
      await releaseOrderAllocationsForDeletion(client, {
        orderId: id,
        orgId: ctx.organizationId,
        actorStaffId: ctx.staffId,
      });
    }

    const result = await client.query(
      `DELETE FROM orders WHERE id = ANY($1::int[]) AND organization_id = $2`,
      [idsToDelete, ctx.organizationId]
    );
    if ((result.rowCount || 0) === 0) {
      return { notFound: true as const };
    }

    await deleteOrderDependentsInTx(
      client,
      ctx.organizationId,
      idsToDelete,
      expanded.rows.flatMap((r) => (r.customer_id != null ? [Number(r.customer_id)] : [])),
    );

    // One audit row per deleted order, with full before snapshot.
    for (const row of beforeRows.rows) {
      await recordAudit(client, ctx, req, {
        source: 'orders.delete',
        action: AUDIT_ACTION.ORDER_DELETE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: Number(row.id),
        before: row,
        after: null,
        method: 'manual',
      });
    }

    return { deleted: result.rowCount || 0, idsToDelete };
  });

  if ('notFound' in txOutcome) {
    return NextResponse.json(
      { error: 'No matching orders were deleted', deleted: 0 },
      { status: 404 }
    );
  }

  // Dashboard shipped table is backed by /api/packerlogs cache ("packing-logs"),
  // not only /api/shipped, so delete must invalidate both domains.
  await invalidateAllOrdersApiCaches(['shipped', 'packing-logs'], ctx.organizationId);
  await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: txOutcome.idsToDelete, source: 'orders.delete' });
  // A deleted order leaves its packed scans pointing at a stale match — refresh
  // the shipped-table read model so they fall back correctly (best-effort). The
  // order_row_id branch in the helper still finds them post-delete.
  after(() =>
    recomputeEnrichmentForOrders(pool, txOutcome.idsToDelete).catch((e) =>
      console.warn('[orders/delete] enrichment recompute failed', e),
    ),
  );

  return NextResponse.json({ success: true, deleted: txOutcome.deleted });
}, { permission: 'orders.void' });
