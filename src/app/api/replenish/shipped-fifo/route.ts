import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { readInventoryPositions } from '@/lib/inventory/inventory-position';

/**
 * Returns SKU-level shipped aggregation for FIFO replenishment view.
 * Shows which SKUs are depleting fastest based on recent shipments,
 * cross-referenced with existing replenishment requests and CycleForge's own
 * inventory position (no external stock system).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId;
  const { searchParams } = new URL(req.url);
  const days = Math.min(Number(searchParams.get('days') || '30'), 90);
  const sku = searchParams.get('sku') || null;
  const limit = Math.min(Number(searchParams.get('limit') || '100'), 500);

  // $1=days, $2=limit, $3=orgId, $4=sku (optional)
  const skuClause = sku
    ? `AND o.sku ILIKE '%' || $4 || '%'`
    : '';
  const params: unknown[] = [days, limit, orgId];
  if (sku) params.push(sku);

  const sql = `
      WITH shipped_agg AS (
        SELECT
          o.sku,
          MAX(o.product_title) AS product_title,
          MAX(o.account_source) AS account_source,
          COUNT(*)::int AS shipped_count,
          SUM(COALESCE(o.quantity::int, 1))::int AS shipped_qty,
          MIN(sal.created_at) AS earliest_shipped_at,
          MAX(sal.created_at) AS latest_shipped_at
        FROM orders o
        JOIN station_activity_logs sal
          ON sal.shipment_id = o.shipment_id
          AND sal.organization_id = o.organization_id
          AND sal.station = 'PACK'
          AND sal.activity_type = 'PACK_COMPLETED'
        WHERE sal.created_at >= NOW() - make_interval(days => $1)
          AND o.organization_id = $3
          AND sal.organization_id = $3
          AND o.sku IS NOT NULL
          AND BTRIM(o.sku) <> ''
          AND o.shipment_id IS NOT NULL
          ${skuClause}
        GROUP BY o.sku
      )
      SELECT
        sa.*,
        ROUND(sa.shipped_qty::numeric / GREATEST($1, 1) * 7, 1) AS avg_units_per_week,
        sc.id AS sku_catalog_id,
        sc.reorder_threshold AS reorder_level,
        rr.id AS active_replenishment_id,
        rr.status AS replenishment_status,
        rr.quantity_needed AS replenishment_qty_needed,
        rr.zoho_po_number
      FROM shipped_agg sa
      LEFT JOIN sku_catalog sc ON sc.sku = sa.sku AND sc.organization_id = $3
      LEFT JOIN LATERAL (
        SELECT id, status, quantity_needed, zoho_po_number
        FROM replenishment_requests
        WHERE sku = sa.sku
          AND organization_id = $3
          AND status NOT IN ('fulfilled', 'cancelled')
        ORDER BY created_at DESC
        LIMIT 1
      ) rr ON true
      ORDER BY sa.shipped_qty DESC, sa.shipped_count DESC
      LIMIT $2
    `;

  const result = await tenantQuery<Record<string, unknown> & { sku_catalog_id: number | null }>(orgId, sql, params);
  const ids = result.rows.flatMap((r) => (r.sku_catalog_id != null ? [Number(r.sku_catalog_id)] : []));
  const positions = await readInventoryPositions((text, p) => tenantQuery(orgId, text, p), orgId, ids);

  return NextResponse.json({
    skus: result.rows.map((r) => {
      const pos = r.sku_catalog_id != null ? positions.get(Number(r.sku_catalog_id)) : undefined;
      return {
        ...r,
        stock_available: pos ? pos.available : null,
        stock_on_hand: pos ? pos.onHand : null,
        stock_incoming: pos ? pos.incoming : null,
      };
    }),
    count: result.rows.length,
    days,
  });
}, { permission: 'sku_stock.view' });
