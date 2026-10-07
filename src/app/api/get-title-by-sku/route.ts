import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { getQcChecks, getKitParts } from '@/lib/neon/sku-catalog-queries';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS } from '@/lib/cache/tags';
import {
    pickSkuCatalogMatch,
    SKU_CANONICAL_KEY_MATCH_SQL,
    SKU_EXACT_MATCH_FLAG_SQL,
} from '@/lib/inventory/resolve-sku-catalog';

/**
 * The stable slice of a SKU resolution — everything EXCEPT the volatile
 * sku_stock stock/location (which decrement on every pick/pack). Cached
 * per (org, normSku, condition); the caller merges live stock on top.
 */
interface StableSkuSlice {
  found: boolean; // any of items/ecwid/catalog matched (drives the empty envelope)
  title: string; // from items/ecwid/catalog only — NOT from sku_stock
  imageUrl: string;
  skuCatalogId: number | null;
  /** The resolved catalog row's SKU — the live stock row must be this one's. */
  catalogSku: string | null;
  /** The input's canonical key matched several catalog SKUs; nothing was picked. */
  ambiguous: boolean;
  gtin: string | null;
  packNotes: string | null;
  qcFlags: Array<{ id: number; label: string; category: string | null }>;
  kitParts: Array<{ id: number; name: string; type: string; qty: number; critical: boolean }>;
}

/** The sku_catalog columns this route reads. `category` is never selected here. */
interface CatalogRow {
  id: number;
  sku: string;
  product_title: string;
  image_url: string | null;
  gtin: string | null;
  notes: string | null;
  category?: string | null;
}

/** GET /api/get-title-by-sku?sku=<value> */
export const GET = withAuth(async (request: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');
    // Optional order condition — condition-gates the kit-parts BOM (a part
    // flagged required_for=['REFURBISHED'] is hidden on a brand-new order).
    const condition = searchParams.get('condition');

    if (!sku) {
        return NextResponse.json({ error: 'Missing sku query param' }, { status: 400 });
    }

    const trimmedSku = String(sku).trim();
    if (!trimmedSku) {
        return NextResponse.json({ error: 'Empty sku' }, { status: 400 });
    }

    // Cache key: case-fold only. `36` and `00036` are different products, so
    // a zero-stripped key would serve one's bundle for the other.
    const normSku = trimmedSku.toUpperCase();
    const condKey = condition ?? '';

    // ── STABLE slice (cached) — everything except live stock/location.
    const stablePromise = getOrSet<StableSkuSlice>(
        CACHE_NS.titleBySku,
        orgId,
        `${normSku}:${condKey}`,
        600, // 10 min; TTL is a backstop — writes invalidate the tags
        [CACHE_TAGS.skuCatalog, CACHE_TAGS.skuKitParts, CACHE_TAGS.qcChecks],
        async () => {
            // Zoho/Ecwid lookups tolerate case/whitespace/leading zeros; the
            // catalog matches by canonical key with the ambiguity guard.
            const [zohoItem, ecwid, catalogDirect] = await Promise.all([
                tenantQuery(
                    orgId,
                    `SELECT name, image_url, image_document_id, zoho_item_id
                           FROM items
                          WHERE status = 'active'
                            AND organization_id = $2
                            AND (
                              UPPER(TRIM(sku)) = UPPER(TRIM($1))
                              OR regexp_replace(UPPER(TRIM(COALESCE(sku,''))), '^0+', '')
                                 = regexp_replace(UPPER(TRIM($1)), '^0+', '')
                            )
                          ORDER BY (UPPER(TRIM(sku)) = UPPER(TRIM($1))) DESC,
                                   (name IS NOT NULL AND name <> '') DESC
                          LIMIT 1`,
                    [trimmedSku, orgId],
                ),
                tenantQuery(
                    orgId,
                    `SELECT id, sku_catalog_id, platform_sku, display_name, image_url
                           FROM sku_platform_ids
                          WHERE platform = 'ecwid'
                            AND is_active = true
                            AND organization_id = $2
                            AND (
                              UPPER(TRIM(platform_sku)) = UPPER(TRIM($1))
                              OR regexp_replace(UPPER(TRIM(COALESCE(platform_sku,''))), '^0+', '')
                                 = regexp_replace(UPPER(TRIM($1)), '^0+', '')
                            )
                          ORDER BY (UPPER(TRIM(platform_sku)) = UPPER(TRIM($1))) DESC,
                                   (image_url IS NOT NULL AND image_url <> '') DESC,
                                   (display_name IS NOT NULL AND display_name <> '') DESC,
                                   id DESC
                          LIMIT 1`,
                    [trimmedSku, orgId],
                ),
                tenantQuery<CatalogRow & { exact: boolean }>(
                    orgId,
                    `SELECT id, sku, product_title, image_url, gtin, notes,
                            ${SKU_EXACT_MATCH_FLAG_SQL} AS exact
                           FROM sku_catalog
                          WHERE organization_id = $2
                            AND ${SKU_CANONICAL_KEY_MATCH_SQL}
                          ORDER BY exact DESC, id
                          LIMIT 2`,
                    [trimmedSku, orgId],
                ),
            ]);

            // An ambiguous key (`036` vs `00036` and `36`) names no product:
            // don't let a zero-tolerant Zoho/Ecwid hit pair one's title with
            // the other's catalog id.
            const catalogMatch = pickSkuCatalogMatch(catalogDirect.rows);
            if (catalogMatch.kind === 'ambiguous') {
                return {
                    found: false,
                    title: '',
                    imageUrl: '',
                    skuCatalogId: null,
                    catalogSku: null,
                    ambiguous: true,
                    gtin: null,
                    packNotes: null,
                    qcFlags: [],
                    kitParts: [],
                };
            }

            const zohoRow = zohoItem.rows[0] ?? null;
            const ecwidRow = ecwid.rows[0] ?? null;
            let catalogRow: CatalogRow | null = catalogMatch.kind === 'match' ? catalogMatch.row : null;

            // If the Ecwid row links to a catalog row we missed by SKU text
            // (because the catalog SKU isn't the Ecwid platform_sku), fetch it.
            if (!catalogRow && ecwidRow?.sku_catalog_id) {
                const linked = await tenantQuery<CatalogRow>(
                    orgId,
                    `SELECT id, sku, product_title, image_url, gtin, notes
                           FROM sku_catalog WHERE id = $1 AND organization_id = $2 LIMIT 1`,
                    [ecwidRow.sku_catalog_id, orgId],
                );
                catalogRow = linked.rows[0] ?? null;
            }

            const resolvedCatalogId: number | null =
                catalogRow?.id ?? ecwidRow?.sku_catalog_id ?? null;

            // Per-SKU QA flags the packer must verify before sealing. Reuses the
            // published QC-check templates authored in Products. Org-scoped.
            let qcFlags: StableSkuSlice['qcFlags'] = [];
            if (resolvedCatalogId != null) {
                try {
                    const checks = await getQcChecks(
                        resolvedCatalogId,
                        catalogRow?.category ?? null,
                        { publishedOnly: true },
                        orgId,
                    );
                    qcFlags = checks.map((c) => ({
                        id: c.id,
                        label: c.step_label,
                        category: c.category ?? null,
                    }));
                } catch {
                    qcFlags = []; // advisory; never block SKU resolution
                }
            }

            // Per-SKU kit parts (BOM), anchored on the SAME resolvedCatalogId —
            // keyed on sku_catalog.id, never the colliding SKU string. Condition-gated.
            let kitParts: StableSkuSlice['kitParts'] = [];
            if (resolvedCatalogId != null) {
                try {
                    const parts = await getKitParts(resolvedCatalogId, condition, orgId);
                    kitParts = parts.map((p) => ({
                        id: p.id,
                        name: p.component_name,
                        type: p.component_type,
                        qty: p.qty_required,
                        critical: p.is_critical,
                    }));
                } catch {
                    kitParts = []; // advisory at pack time
                }
            }

            return {
                found: Boolean(zohoRow || ecwidRow || catalogRow),
                title:
                    (zohoRow?.name && String(zohoRow.name).trim()) ||
                    (ecwidRow?.display_name && String(ecwidRow.display_name).trim()) ||
                    catalogRow?.product_title ||
                    '',
                imageUrl:
                    (zohoRow?.image_document_id && String(zohoRow.image_document_id).trim()
                        ? `/api/zoho/items/${encodeURIComponent(String(zohoRow.zoho_item_id))}/image`
                        : '') ||
                    (zohoRow?.image_url && String(zohoRow.image_url).trim()) ||
                    (zohoRow
                        ? ''
                        : (ecwidRow?.image_url && String(ecwidRow.image_url).trim()) ||
                          catalogRow?.image_url ||
                          ''),
                skuCatalogId: resolvedCatalogId,
                catalogSku: catalogRow?.sku ?? null,
                ambiguous: false,
                gtin: catalogRow?.gtin || null,
                packNotes: catalogRow?.notes || null,
                qcFlags,
                kitParts,
            };
        },
    );

    // ── LIVE stock/location — never cached (decrements every pick/pack). ────
    // Same canonical key as the catalog. The stock row must be the resolved
    // catalog SKU's own (`36` must not show `00036`'s stock); with no catalog
    // row the guard applies on sku_stock alone; an ambiguous key takes none.
    const stockPromise = tenantQuery<{ sku: string; stock: number | null; location: string | null; product_title: string | null; exact: boolean }>(
        orgId,
        `SELECT sku, stock, location, product_title, ${SKU_EXACT_MATCH_FLAG_SQL} AS exact
               FROM sku_stock
              WHERE organization_id = $2
                AND ${SKU_CANONICAL_KEY_MATCH_SQL}
              ORDER BY exact DESC
              LIMIT 3`,
        [trimmedSku, orgId],
    );

    const [stable, stock] = await Promise.all([stablePromise, stockPromise]);
    const stockMatch = pickSkuCatalogMatch(stock.rows);
    const stockRow = stable.ambiguous
        ? null
        : stable.catalogSku
          ? (stock.rows.find((r) => r.sku === stable.catalogSku) ?? null)
          : stockMatch.kind === 'match'
            ? stockMatch.row
            : null;

    if (!stable.found && !stockRow) {
        return NextResponse.json({
            sku: trimmedSku, title: '', stock: '0', location: '',
            imageUrl: '', skuCatalogId: null, gtin: null, packNotes: null,
            qcFlags: [], kitParts: [],
        });
    }

    return NextResponse.json({
        sku: trimmedSku,
        // Stable title (items/ecwid/catalog) wins; fall back to sku_stock's
        // product_title for SKUs that live only in stock (preserved behavior).
        title: stable.title || stockRow?.product_title || '',
        stock: stockRow?.stock != null ? String(stockRow.stock) : '0',
        location: stockRow?.location || '',
        imageUrl: stable.imageUrl,
        skuCatalogId: stable.skuCatalogId,
        gtin: stable.gtin,
        packNotes: stable.packNotes,
        qcFlags: stable.qcFlags,
        kitParts: stable.kitParts,
    });
}, { permission: 'sku_stock.view' });
