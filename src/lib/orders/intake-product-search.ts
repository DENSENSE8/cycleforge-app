import 'server-only';

/**
 * The intake form's product search — anything typed (title words, SKU, item #,
 * FNSKU, UPC, or "black bose 151 bracket") → catalog products to put on a line.
 *
 * No search engine of its own. It asks the shared cores and keeps their order:
 *  1. `identify` — exact probes (SKU, GTIN/UPC, FNSKU, ASIN, an order's item #)
 *     plus the brand / keyword / typo arms for words;
 *  2. `resolveCatalogByItemNumber` — a marketplace listing id (`sku_platform_ids`)
 *     identify does not probe;
 *  3. `findRecords` — the hybrid (semantic) retrieval the assistant uses, only
 *     when a phrase found nothing above.
 * Then one read paints each product: identity title (`resolveSkuIdentityTitle`,
 * the Zoho item governs), photo, stock on hand, the fullest bin, an item #.
 */

import { identify } from '@/lib/identify/identify';
import { resolveCatalogByItemNumber } from '@/lib/packing/resolve-catalog-by-item-number';
import { findRecords } from '@/lib/search/find-records';
import { looksLikeIdentifier } from '@/lib/search/search-hit';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

export interface IntakeProductHit {
  skuCatalogId: number;
  sku: string;
  /** Identity title — the Zoho item name, else the catalog title, else the SKU. */
  title: string;
  /** The listing item number the query matched, else the product's first one. */
  itemNumber: string | null;
  imageUrl: string | null;
  onHand: number;
  /** The bin holding the most units, `null` when none is stocked. */
  bin: string | null;
  /** What the query matched on (`sku`, `gtin`, `fnsku`, `item_number`, `keyword`…). */
  matchedOn: string;
  /** Price each to pre-fill, cents: this org's last sale of the product, else the Zoho list rate. */
  suggestedUnitCents: number | null;
  /** Where {@link suggestedUnitCents} came from. */
  priceSource: 'last_sale' | 'list' | null;
}

type Found = { id: number; matchedOn: string; itemNumber: string | null };

const ORDER_PRODUCT_SQL = `SELECT id, sku_catalog_id, item_number FROM orders
 WHERE organization_id = $1 AND id = ANY($2::int[]) AND sku_catalog_id IS NOT NULL`;

const PRODUCTS_SQL = `SELECT sc.id, sc.sku, sc.image_url,
       i.name AS zoho_item_title, sc.product_title AS catalog_product_title,
       (SELECT COALESCE(sum(bc.qty), 0)::int FROM bin_contents bc
         WHERE ${skuCatalogJoinOnSql('bc')} AND bc.qty > 0) AS on_hand,
       (SELECT l.name FROM bin_contents bc JOIN locations l ON l.id = bc.location_id
         WHERE ${skuCatalogJoinOnSql('bc')} AND bc.qty > 0
         ORDER BY bc.qty DESC, l.name LIMIT 1) AS bin,
       (SELECT p.platform_item_id FROM sku_platform_ids p
         WHERE p.organization_id = sc.organization_id AND p.sku_catalog_id = sc.id
           AND COALESCE(btrim(p.platform_item_id), '') <> ''
         ORDER BY p.id LIMIT 1) AS item_number,
       (SELECT round(o.sale_amount * 100 / GREATEST(COALESCE(substring(o.quantity FROM '^\\d{1,6}')::int, 1), 1))::int
          FROM orders o
         WHERE o.organization_id = sc.organization_id AND o.sku_catalog_id = sc.id AND o.sale_amount > 0
         ORDER BY o.created_at DESC, o.id DESC LIMIT 1) AS last_unit_cents,
       round(i.rate * 100)::int AS list_unit_cents
  FROM sku_catalog sc
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sc.organization_id = $1 AND sc.id = ANY($2::int[])`;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function searchIntakeProducts(orgId: OrgId, raw: string, limit = 8): Promise<IntakeProductHit[]> {
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (q.length < 2) return [];
  const found = new Map<number, Found>();
  const add = (id: number, matchedOn: string, itemNumber: string | null = null) => {
    if (Number.isSafeInteger(id) && id > 0 && !found.has(id)) found.set(id, { id, matchedOn, itemNumber });
  };

  // A listing id / platform SKU is an exact answer — it ranks ahead of anything identify's word arms found.
  const identifier = looksLikeIdentifier(q);
  const [listing, identified] = await Promise.all([
    identifier ? resolveCatalogByItemNumber(orgId, { itemNumber: q }).catch(() => null) : null,
    identify(orgId, { q, limit: 12 }).catch(() => null),
  ]);
  if (listing?.status === 'resolved') {
    const bySku = listing.catalog.matchVia === 'sku';
    add(listing.catalog.catalogId, bySku ? 'sku' : 'item_number', bySku ? null : q);
  } else if (listing?.status === 'ambiguous') {
    for (const c of listing.candidates) add(c.catalogId, 'item_number', q);
  }

  const orderHits: number[] = [];
  for (const candidate of identified?.lines[0]?.candidates ?? []) {
    if (candidate.kind === 'sku') add(candidate.entityId, candidate.matchedOn.field);
    else if (candidate.kind === 'order' && candidate.matchedOn.field === 'item_number') orderHits.push(candidate.entityId);
  }
  if (orderHits.length > 0) {
    const { rows } = await tenantQuery<{ sku_catalog_id: number; item_number: string | null }>(
      orgId,
      ORDER_PRODUCT_SQL,
      [orgId, orderHits],
    );
    for (const row of rows) add(Number(row.sku_catalog_id), 'item_number', str(row.item_number) || null);
  }

  if (!identifier && found.size === 0) {
    const records = await findRecords(orgId, q, { limit: 12 }).catch(() => null);
    for (const row of records?.rows ?? []) if (row.entityType === 'sku') add(row.id, 'semantic');
  }

  const ranked = [...found.values()].slice(0, limit);
  if (ranked.length === 0) return [];
  const { rows } = await tenantQuery(orgId, PRODUCTS_SQL, [orgId, ranked.map((f) => f.id)]);
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  return ranked.flatMap((hit) => {
    const row = byId.get(hit.id);
    if (!row) return [];
    const sku = str(row.sku);
    return [{
      skuCatalogId: hit.id,
      sku,
      title:
        resolveSkuIdentityTitle({
          zoho_item_title: str(row.zoho_item_title),
          catalog_product_title: str(row.catalog_product_title),
          sku,
        }) || sku,
      itemNumber: hit.itemNumber ?? (str(row.item_number) || null),
      imageUrl: str(row.image_url) || null,
      onHand: Number(row.on_hand ?? 0),
      bin: str(row.bin) || null,
      matchedOn: hit.matchedOn,
      ...(row.last_unit_cents != null && Number(row.last_unit_cents) > 0
        ? { suggestedUnitCents: Number(row.last_unit_cents), priceSource: 'last_sale' as const }
        : row.list_unit_cents != null && Number(row.list_unit_cents) > 0
          ? { suggestedUnitCents: Number(row.list_unit_cents), priceSource: 'list' as const }
          : { suggestedUnitCents: null, priceSource: null }),
    }];
  });
}
