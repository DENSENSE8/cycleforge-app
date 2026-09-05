import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';

/**
 * Serial-unit statuses that mean the unit is no longer ours to sell.
 *
 * The grade breakdown answers "what is on the floor right now", so counting a
 * SHIPPED unit would quote a customer something that left the building. Kept
 * as a named list rather than inlined in SQL because it is a business rule
 * someone will want to argue with, not a query detail. RETURNED is deliberately
 * absent — a returned unit is back in the building and sellable again.
 */
const UNITS_GONE_STATUSES = ['SHIPPED', 'SCRAPPED', 'RMA'] as const;

// GET /api/products/[sku]
// Single product detail for the /products/[sku] page.
//
// Returns the catalog row plus the platform_ids list (including each channel's
// listing_url, so the page can open the real listing instead of bouncing the
// reader through storefront search). Live stock summary (WAREHOUSE qty,
// serial-units by status AND by condition grade) is folded in so the detail
// page can render the cross-link card without a second roundtrip.
//
// Condition grade is the answer to "what can I actually sell you" on a refurb
// floor: one catalog SKU is many physical units at different grades, and a
// single storefront price cannot express that spread.
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ sku: string }> },
) {
    try {
        const gate = await requireRoutePerm(req, 'sku_stock.view');
        if (gate.denied) return gate.denied;
        const orgId = gate.ctx.organizationId;

        const { sku: rawSku } = await params;
        const sku = decodeURIComponent(rawSku || '').trim();
        if (!sku) {
            return NextResponse.json(
                { success: false, error: 'sku required' },
                { status: 400 },
            );
        }

        const catalog = await tenantQuery(
            orgId,
            `SELECT
                 sc.id,
                 sc.sku,
                 COALESCE(NULLIF(BTRIM(it.name), ''), sc.product_title) AS product_title,
                 sc.category,
                 sc.gtin,
                 sc.upc,
                 sc.image_url,
                 sc.is_active,
                 sc.provider_item_id
             FROM sku_catalog sc
             LEFT JOIN items it
               ON it.zoho_item_id = sc.provider_item_id
              AND it.organization_id = sc.organization_id
             WHERE sc.sku = $1
               AND sc.organization_id = $2
             LIMIT 1`,
            [sku, orgId],
        );

        if (catalog.rows.length === 0) {
            return NextResponse.json(
                { success: false, error: 'product not found' },
                { status: 404 },
            );
        }

        const product = catalog.rows[0];

        const [platforms, stock] = await Promise.all([
            tenantQuery(
                orgId,
                `SELECT
                     sp.id,
                     sp.platform,
                     sp.platform_sku,
                     sp.platform_item_id,
                     sp.account_name,
                     sp.display_name,
                     sp.image_url,
                     sp.listing_url,
                     sp.is_active
                 FROM sku_platform_ids sp
                 WHERE (sp.sku_catalog_id = $1 OR sp.platform_sku = $2)
                   AND sp.organization_id = $3
                 ORDER BY sp.platform ASC, sp.account_name ASC NULLS LAST`,
                [product.id, product.sku, orgId],
            ),
            tenantQuery(
                orgId,
                `SELECT
                     COALESCE(SUM(CASE WHEN bc.location_id IS NOT NULL THEN bc.qty ELSE 0 END), 0)::int AS warehouse_qty
                 FROM bin_contents bc
                 WHERE bc.sku = $1
                   AND bc.organization_id = $2`,
                [product.sku, orgId],
            ),
        ]);

        // Serial-unit counts. Pulled separately so a missing serial_units row
        // doesn't fail the rest of the payload.
        //
        // The status column is `current_status` (serial_status_enum) — an
        // earlier version of this route grouped by a bare `status`, which does
        // not exist on the table, so every request threw into the catch below
        // and the page reported "No serial units tracked" for every product.
        let unitsByStatus: Array<{ status: string; count: number }> = [];
        let unitsByGrade: Array<{ grade: string; count: number }> = [];
        try {
            const [statusResult, gradeResult] = await Promise.all([
                tenantQuery(
                    orgId,
                    `SELECT current_status::text AS status, COUNT(*)::int AS count
                     FROM serial_units
                     WHERE sku = $1
                       AND organization_id = $2
                     GROUP BY current_status
                     ORDER BY current_status ASC`,
                    [product.sku, orgId],
                ),
                tenantQuery(
                    orgId,
                    `SELECT COALESCE(condition_grade::text, 'UNGRADED') AS grade,
                            COUNT(*)::int AS count
                     FROM serial_units
                     WHERE sku = $1
                       AND organization_id = $2
                       AND current_status <> ALL($3::text[]::serial_status_enum[])
                     GROUP BY 1
                     ORDER BY 2 DESC`,
                    [product.sku, orgId, UNITS_GONE_STATUSES],
                ),
            ]);
            unitsByStatus = statusResult.rows as Array<{ status: string; count: number }>;
            unitsByGrade = gradeResult.rows as Array<{ grade: string; count: number }>;
        } catch (err) {
            console.warn('[api/products/[sku]] serial_units count failed:', err);
        }

        return NextResponse.json({
            success: true,
            product,
            platforms: platforms.rows,
            stock: {
                warehouse_qty: stock.rows[0]?.warehouse_qty ?? 0,
                units_by_status: unitsByStatus,
                units_by_grade: unitsByGrade,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch product';
        console.error('[api/products/[sku]] Error:', error);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
