import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getSkuPackProfileLink } from '@/lib/neon/pack-profile-links';
import { classifyPackTier } from '@/lib/packing/pack-tier-classifier';
import { snapMinutes, tierForMinutes } from '@/lib/packing/pack-standard-stops';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas/parse';
import {
    normalizeSkuKey,
    positiveOrNull,
    setProductParcelDims,
} from '@/lib/orders/parcel-dims';

const ParcelValue = z.number().positive().max(100_000).nullable();
const ProductParcelUpdateBody = z
    .object({
        parcel: z
            .object({
                weightOz: ParcelValue,
                lengthIn: ParcelValue,
                widthIn: ParcelValue,
                heightIn: ParcelValue,
            })
            .strict(),
    })
    .strict();

// GET /api/products/[sku] Single product detail for the /products/[sku] page.
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
                 COALESCE(NULLIF(BTRIM(sc.product_title), ''), it.name) AS product_title,
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

        const [platforms, stock, parcelRows] = await Promise.all([
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
            tenantQuery<{
                key_kind: 'sku' | 'item_number';
                key_value: string;
                weight_oz: string | number | null;
                length_in: string | number | null;
                width_in: string | number | null;
                height_in: string | number | null;
            }>(
                orgId,
                `SELECT key_kind, key_value, weight_oz, length_in, width_in, height_in
                   FROM product_parcel_dims
                  WHERE organization_id = $1
                    AND (sku_catalog_id = $2
                         OR (key_kind = 'sku' AND key_value = $3))
                  ORDER BY CASE WHEN key_kind = 'sku' THEN 0 ELSE 1 END, updated_at DESC
                  LIMIT 1`,
                [orgId, product.id, normalizeSkuKey(product.sku)],
            ),
        ]);

        const itemNumbers = [
            ...new Set(
                platforms.rows
                    .map((row) => String(row.platform_item_id ?? '').trim())
                    .filter(Boolean),
            ),
        ];
        const parcelRow = parcelRows.rows[0];
        const parcel = {
            weightOz: positiveOrNull(parcelRow?.weight_oz),
            lengthIn: positiveOrNull(parcelRow?.length_in),
            widthIn: positiveOrNull(parcelRow?.width_in),
            heightIn: positiveOrNull(parcelRow?.height_in),
            source: parcelRow?.key_kind ?? null,
            sourceKey: parcelRow?.key_value ?? null,
        };

        // Serial-units status counts. Pulled separately so a missing
        // serial_units row doesn't fail the rest of the payload.
        let unitsByStatus: Array<{ status: string; count: number }> = [];
        try {
            const unitsResult = await tenantQuery(
                orgId,
                `SELECT status, COUNT(*)::int AS count
                 FROM serial_units
                 WHERE sku = $1
                   AND organization_id = $2
                 GROUP BY status
                 ORDER BY status ASC`,
                [product.sku, orgId],
            );
            unitsByStatus = unitsResult.rows as Array<{ status: string; count: number }>;
        } catch (err) {
            console.warn('[api/products/[sku]] serial_units count failed:', err);
        }

        /* Time to pack — the standard this SKU's packs are weighted by. */
        const packOverride = await getSkuPackProfileLink(Number(product.id), orgId);
        const packRules = classifyPackTier({
            productTitle: product.product_title,
            category: product.category,
            sku: product.sku,
        });
        const packMinutes = snapMinutes(packOverride?.estimatedMinutes ?? packRules.estimatedMinutes);
        const packProfile = {
            minutes: packMinutes,
            tier: tierForMinutes(packMinutes),
            source: packOverride ? ('profile' as const) : ('rules' as const),
        };

        return NextResponse.json({
            success: true,
            product,
            platforms: platforms.rows,
            stock: {
                warehouse_qty: stock.rows[0]?.warehouse_qty ?? 0,
                units_by_status: unitsByStatus,
            },
            packProfile,
            itemNumbers,
            parcel,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch product';
        console.error('[api/products/[sku]] Error:', error);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

/** PATCH /api/products/[sku] — replace the parcel remembered for this product. */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ sku: string }> },
) {
    try {
        const gate = await requireRoutePerm(req, 'sku_stock.manage');
        if (gate.denied) return gate.denied;
        const orgId = gate.ctx.organizationId;
        const { sku: rawSku } = await params;
        const sku = decodeURIComponent(rawSku || '').trim();
        if (!sku) {
            return NextResponse.json({ success: false, error: 'sku required' }, { status: 400 });
        }

        const parsed = parseBody(ProductParcelUpdateBody, await req.json().catch(() => ({})));
        if (parsed instanceof NextResponse) return parsed;

        const result = await withTenantTransaction(orgId, async (client) => {
            const catalog = await client.query<{ id: number; sku: string }>(
                `SELECT id, sku
                   FROM sku_catalog
                  WHERE organization_id = $1 AND sku = $2
                  LIMIT 1`,
                [orgId, sku],
            );
            const product = catalog.rows[0];
            if (!product) return null;

            const linked = await client.query<{ platform_item_id: string | null }>(
                `SELECT DISTINCT platform_item_id
                   FROM sku_platform_ids
                  WHERE organization_id = $1
                    AND sku_catalog_id = $2
                    AND NULLIF(BTRIM(platform_item_id), '') IS NOT NULL`,
                [orgId, product.id],
            );
            const itemNumbers = linked.rows
                .map((row) => String(row.platform_item_id ?? '').trim())
                .filter(Boolean);

            await setProductParcelDims(client, {
                orgId,
                skuCatalogId: product.id,
                sku: product.sku,
                itemNumbers,
                parcel: parsed.parcel,
                staffId: Number(gate.ctx.staffId) || null,
            });
            return { itemNumbers };
        });

        if (!result) {
            return NextResponse.json({ success: false, error: 'product not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, parcel: parsed.parcel, itemNumbers: result.itemNumbers });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to save parcel';
        console.error('[api/products/[sku]] PATCH Error:', error);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
