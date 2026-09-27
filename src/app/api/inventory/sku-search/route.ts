import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveBrandQuery } from '@/lib/search/brand-search';
import { SKU_BRAND_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';

export const dynamic = 'force-dynamic';

const SKU_STOCK_SELECT = `SELECT
         ss.sku,
         ss.product_title,
         COALESCE(ss.stock, 0)::int                 AS stock,
         COUNT(DISTINCT bc.location_id)::int        AS bin_count,
         COALESCE(SUM(bc.qty), 0)::int              AS total_qty`;

/**
 * GET /api/inventory/sku-search?q=…[&field=brand]
 *
 * `field=brand`: `q` names a brand (alias-matched), and the list is the
 * stocked SKUs whose catalog FACT brand is that brand or any line under it
 * (Bose → Wave SKUs too). Words in `q` that name no brand only rank.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ success: true, results: [] });
  }

  try {
    if (req.nextUrl.searchParams.get('field') === 'brand') {
      const brand = await resolveBrandQuery(ctx.organizationId, q);
      if (!brand) return NextResponse.json({ success: true, results: [] });
      const result = await tenantQuery(
        ctx.organizationId,
        `${SKU_STOCK_SELECT}
       FROM sku_catalog sc
       JOIN product_brands pb ON ${SKU_BRAND_JOIN_ON_SQL}
       JOIN sku_stock ss ON ss.sku = sc.sku AND ss.organization_id = sc.organization_id
       LEFT JOIN bin_contents bc ON bc.sku = ss.sku AND bc.organization_id = ss.organization_id
       WHERE sc.organization_id = $1
         AND sc.brand_id = ANY($2::int[])
       GROUP BY ss.sku, ss.product_title, ss.stock
       ORDER BY
         (SELECT COUNT(*) FROM unnest($3::text[]) AS w(tok)
           WHERE lower(COALESCE(ss.product_title, '') || ' ' || ss.sku) LIKE '%' || w.tok || '%') DESC,
         ss.product_title NULLS LAST,
         ss.sku
       LIMIT 20`,
        [ctx.organizationId, brand.brandIds, brand.residualTokens],
      );
      return NextResponse.json({ success: true, results: result.rows });
    }

    // Tenant-scoped:
    const result = await tenantQuery(
      ctx.organizationId,
      `${SKU_STOCK_SELECT}
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
  } catch (err: unknown) {
    console.error('[GET /api/inventory/sku-search] error:', err);
    return NextResponse.json(
      { success: false, error: (err instanceof Error && err.message) || 'Failed to search SKUs' },
      { status: 500 },
    );
  }
}, { permission: 'sku_stock.view' });
