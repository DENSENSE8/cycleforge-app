import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1),
      2000,
    );
    const minDays = Math.max(parseInt(searchParams.get('minDays') || '90', 10) || 90, 0);
    const includeNever = searchParams.get('includeNeverMoved') === 'true';
    // TENANT ISOLATION:
    const r = await tenantQuery(
      ctx.organizationId,
      `WITH last_move AS (
         SELECT sku, MAX(created_at) AS last_move_at
         FROM sku_stock_ledger
         WHERE reason <> 'INITIAL_BALANCE'
           AND organization_id = $4
         GROUP BY sku
       ),
       dead AS (
         SELECT
           ss.sku,
           ss.stock,
           lm.last_move_at,
           COALESCE(
             NULLIF(ss.display_name_override, ''),
             sp.display_name,
             sc.product_title,
             NULLIF(ss.product_title, '')
           ) AS product_title,
           CASE
             WHEN lm.last_move_at IS NULL THEN NULL::int
             ELSE EXTRACT(DAY FROM (NOW() - lm.last_move_at))::int
           END AS days_dormant
         FROM sku_stock ss
         LEFT JOIN last_move lm ON lm.sku = ss.sku
         LEFT JOIN sku_catalog sc
           ON sc.sku = ss.sku
          AND sc.organization_id = ss.organization_id
         LEFT JOIN LATERAL (
           SELECT e.display_name FROM sku_platform_ids e
           WHERE e.sku_catalog_id = sc.id
             AND e.organization_id = sc.organization_id
             AND e.platform = 'ecwid' AND e.is_active = true
             AND e.display_name IS NOT NULL
           LIMIT 1
         ) sp ON TRUE
         WHERE ss.organization_id = $4
           AND ss.stock > 0
           AND (lm.last_move_at IS NULL OR lm.last_move_at < NOW() - INTERVAL '90 days')
       )
       SELECT sku, product_title, stock, last_move_at, days_dormant
       FROM dead
       WHERE (days_dormant >= $1)
          OR ($3::boolean AND days_dormant IS NULL)
       ORDER BY days_dormant DESC NULLS LAST, stock DESC
       LIMIT $2`,
      [minDays, limit, includeNever, ctx.organizationId],
    );
    return NextResponse.json({ success: true, rows: r.rows });
  } catch (err: any) {
    console.error('[GET /api/reports/dead-stock] error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed' },
      { status: 500 },
    );
  }
}, { permission: 'reports.view' });
