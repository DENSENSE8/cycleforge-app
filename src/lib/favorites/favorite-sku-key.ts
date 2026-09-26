/** The favorites KEY — SKU identity as `favorite_skus.sku_normalized` stores it, plus the pure selection helpers both the catalog routes… */

/** Workspace a favorite belongs to — a curated quick-pick list, one per rail. */
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

/** Narrow a catalog page to the favorited rows, IN FAVORITES ORDER. */
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
