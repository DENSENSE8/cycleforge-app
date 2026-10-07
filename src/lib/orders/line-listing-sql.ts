/**
 * SQL fragments that hand {@link resolveListingLink} its server-side facts —
 * the order's platform and the stored `sku_platform_ids` listings — so the
 * docs popover's listing link is resolved in the read, never guessed on the
 * client. `org` is the bound organization parameter (`$1`).
 */

import type { StoredListing } from '@/utils/external-item-url';

/**
 * The catalog platform slug an `orders` row's canonical `account_source`
 * names: a seller account (`usav`) resolves to its platform (`ecwid`), a
 * platform slug stays itself.
 */
export function orderPlatformSlugSql(orderAlias: string, org: string): string {
  return `COALESCE(
           (SELECT lower(btrim(p.slug))
              FROM platform_accounts pa
              JOIN platforms p ON p.organization_id = pa.organization_id AND p.id = pa.platform_id
             WHERE pa.organization_id = ${org} AND lower(btrim(pa.slug)) = ${orderAlias}.account_source
             ORDER BY pa.is_active DESC, pa.id
             LIMIT 1),
           NULLIF(btrim(${orderAlias}.account_source), ''))`;
}

/** At most this many stored listings per line / SKU reach the resolver. */
const MAX_STORED_LISTINGS = 8;

/**
 * Active `sku_platform_ids` rows for a listing number, a catalog id or a
 * platform SKU text (any may be NULL), as a JSON array of
 * `{ platform, itemId, url }` — the exact item number first, then rows that
 * carry a URL.
 */
export function storedListingsSql(org: string, keys: { itemNumber: string; skuCatalogId: string; sku: string }): string {
  const item = `NULLIF(BTRIM(${keys.itemNumber}), '')`;
  const sku = `NULLIF(BTRIM(${keys.sku}), '')`;
  return `(SELECT COALESCE(json_agg(json_build_object('platform', s.platform, 'itemId', s.platform_item_id, 'url', s.listing_url)), '[]'::json)
             FROM (SELECT sp.platform, sp.platform_item_id, NULLIF(BTRIM(sp.listing_url), '') AS listing_url
                     FROM sku_platform_ids sp
                    WHERE sp.organization_id = ${org} AND sp.is_active = true
                      AND ((${item} IS NOT NULL AND sp.platform_item_id = ${item})
                           OR (${keys.skuCatalogId} IS NOT NULL AND sp.sku_catalog_id = ${keys.skuCatalogId})
                           OR (${sku} IS NOT NULL AND sp.platform_sku = ${sku}))
                    ORDER BY (${item} IS NOT NULL AND sp.platform_item_id = ${item}) DESC,
                             (NULLIF(BTRIM(sp.listing_url), '') IS NOT NULL) DESC, sp.id DESC
                    LIMIT ${MAX_STORED_LISTINGS}) s)`;
}

/** A `storedListingsSql` value off a row (json, or text through a driver). */
export function toStoredListings(raw: unknown): StoredListing[] {
  const rows = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  return Array.isArray(rows) ? (rows as StoredListing[]) : [];
}
