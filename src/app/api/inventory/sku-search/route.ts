import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';

export const dynamic = 'force-dynamic';

/** GET /api/inventory/sku-search?q=… */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ success: true, results: [] });
  }

  try {
    // Tenant-scoped:
    const result = await tenantQuery(
      ctx.organizationId,
      `SELECT
         ss.sku,
         ss.product_title,
         COALESCE(ss.stock, 0)::int                 AS stock,
         COUNT(DISTINCT bc.location_id)::int        AS bin_count,
         COALESCE(SUM(bc.qty), 0)::int              AS total_qty
       FROM sku_stock ss
       LEFT JOIN bin_contents bc ON bc.sku = ss.sku AND bc.organization_id = ss.organization_id
       WHERE (ss.sku ILIKE $1 OR ss.product_title ILIKE $1) AND ss.organization_id = $3
       GROUP BY ss.sku, ss.product_title, ss.stock
       ORDER BY
         CASE WHEN ss.sku ILIKE $2 THEN 0 ELSE 1 END,   -- exact-prefix SKU first
         ss.product_title NULLS LAST,
         ss.sku
       LIMIT 20`,
      [`%${q}%`, `${q}%`, ctx.organizationId],
    );
    return NextResponse.json({ success: true, results: result.rows });
  } catch (err: any) {
    console.error('[GET /api/inventory/sku-search] error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to search SKUs' },
      { status: 500 },
    );
  }
}, { permission: 'sku_stock.view' });
