/**
 * The favorites KEY — SKU identity as `favorite_skus.sku_normalized` stores it,
 * plus the pure selection helpers both the catalog routes and the picker use.
 *
 * DB-free on purpose. `sku-favorites.ts` opens a tenant connection, and the
 * catalog picker is a client component that must paint a star on a tile without
 * dragging the pool into the bundle; a shared normalizer is the only way the
 * two halves can agree on whether `00128-RS` and `00128 rs` are the same
 * favorite. Never re-spell this expression at a call site — the SQL twin lives
 * in `catalog-search.ts` (`FAVORITE_SKU_KEY_SQL`) and is pinned by test.
 *
 * Callers: `sku-favorites.ts`, `catalog-search.ts`, `/api/repair/ecwid-products`,
 * `ProductSelector`. Affected API: none. Schemas: `favorite_skus.sku_normalized`.
 */

/**
 * Workspace a favorite belongs to — a curated quick-pick list, one per rail.
 *
 * `repair` / `sales` are the two kiosk catalog rails (and the staff repair
 * intake picker); `sku-stock` and `fba` are staff-only lists managed from
 * Inventory › Favorites. The DB mirrors this set in
 * `favorite_sku_workspaces_workspace_key_check`.
 */
export const FAVORITE_WORKSPACE_KEYS = ['repair', 'sales', 'sku-stock', 'fba'] as const;

export type FavoriteWorkspaceKey = (typeof FAVORITE_WORKSPACE_KEYS)[number];

export function isFavoriteWorkspaceKey(value: unknown): value is FavoriteWorkspaceKey {
  return (
    typeof value === 'string' && FAVORITE_WORKSPACE_KEYS.includes(value as FavoriteWorkspaceKey)
  );
}

/**
 * SKU → favorites key. Case-folded and stripped of every separator, so a SKU
 * typed `00128 RS`, scanned `00128-rs` and listed `00128-RS` all resolve to one
 * favorite row.
 */
export function normalizeFavoriteSku(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Keys for a favorites list, blanks dropped — the set a tile star reads. */
export function buildFavoriteSkuKeySet(skus: Iterable<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const sku of skus) {
    const key = normalizeFavoriteSku(sku);
    if (key) set.add(key);
  }
  return set;
}

/** Is this catalog SKU in the favorites set? */
export function isFavoriteSku(keys: ReadonlySet<string>, sku: string | null | undefined): boolean {
  const key = normalizeFavoriteSku(sku);
  return key.length > 0 && keys.has(key);
}

/**
 * Narrow a catalog page to the favorited rows, IN FAVORITES ORDER.
 *
 * For the one catalog source that cannot filter in SQL: the staff repair route
 * walks the live Ecwid storefront (`fetchRepairRootProductsCached`) and has no
 * query grammar. The kiosk routes filter in `searchKioskCatalog` instead, and
 * both must agree on order — a favorite pinned first by `sort_order` is first
 * on every surface, not "first on the tablet, alphabetical on the desk".
 *
 * A favorited SKU with no catalog row simply does not appear: the listing is
 * the product, and a tile with no price or photo is not a product.
 */
export function selectFavoriteCatalogProducts<T extends { sku: string }>(
  products: readonly T[],
  orderedFavoriteKeys: readonly string[],
): T[] {
  const bySku = new Map<string, T>();
  for (const product of products) {
    const key = normalizeFavoriteSku(product.sku);
    if (key && !bySku.has(key)) bySku.set(key, product);
  }

  const picked: T[] = [];
  const seen = new Set<string>();
  for (const key of orderedFavoriteKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const product = bySku.get(key);
    if (product) picked.push(product);
  }
  return picked;
}
