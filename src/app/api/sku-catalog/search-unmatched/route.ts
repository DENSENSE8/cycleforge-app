import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

/** GET /api/sku-catalog/search-unmatched?q=<fragment> */
export const GET = withAuth(async (request, ctx) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return NextResponse.json({
      success: true,
      query: q,
      catalogSku: { exists: false },
      unmappedPlatformIds: [],
    });
  }

  try {
    const like = `%${q}%`;

    // String-key joins (sp↔orders on item_number/sku) collide across tenants —
    // align both subqueries on organization_id. sku_catalog and sku_platform_ids
    // both carry organization_id; filter each on the caller's org + GUC wrap.
    const [catalog, unmapped] = await Promise.all([
      tenantQuery(
        ctx.organizationId,
        `SELECT id, is_active FROM sku_catalog WHERE upper(sku) = upper($1) AND organization_id = $2 LIMIT 1`,
        [q, ctx.organizationId],
      ),
      tenantQuery(
        ctx.organizationId,
        `SELECT
           sp.id              AS "platformIdRowId",
           sp.platform,
           sp.platform_sku    AS "platformSku",
           sp.platform_item_id AS "platformItemId",
           sp.account_name    AS "accountName",
           (
             SELECT o.product_title
               FROM orders o
              WHERE o.organization_id = sp.organization_id
                AND ((sp.platform_item_id IS NOT NULL AND upper(o.item_number) = upper(sp.platform_item_id))
                  OR (sp.platform_sku     IS NOT NULL AND upper(o.sku)         = upper(sp.platform_sku)))
              ORDER BY o.created_at DESC NULLS LAST
              LIMIT 1
           ) AS "suggestedTitle",
           (
             SELECT COUNT(*)::int
               FROM orders o
              WHERE o.organization_id = sp.organization_id
                AND o.sku_catalog_id IS NULL
                AND ((sp.platform_item_id IS NOT NULL AND upper(o.item_number) = upper(sp.platform_item_id))
                  OR (sp.platform_sku     IS NOT NULL AND upper(o.sku)         = upper(sp.platform_sku)))
           ) AS "orderCount"
         FROM sku_platform_ids sp
         WHERE sp.sku_catalog_id IS NULL
           AND sp.is_active = true
           AND sp.organization_id = $2
           AND (sp.platform_sku ILIKE $1
                OR (sp.platform <> 'ecwid' AND sp.platform_item_id ILIKE $1))
         ORDER BY "orderCount" DESC, sp.id
         LIMIT 25`,
        [like, ctx.organizationId],
      ),
    ]);

    const catalogRow = catalog.rows[0];
    return NextResponse.json({
      success: true,
      query: q,
      catalogSku: catalogRow
        ? { exists: true, id: catalogRow.id, isActive: catalogRow.is_active }
        : { exists: false },
      unmappedPlatformIds: unmapped.rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'search-unmatched failed';
    console.error('[search-unmatched] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'sku_stock.view' });
