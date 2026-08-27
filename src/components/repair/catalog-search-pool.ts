/**
 * Catalog search-pool choice — one engine for staff stacked + kiosk-split.
 *
 * First-page paint (`showAllProducts`) must not disable the whole-catalog
 * pool. Kiosk-split prefetches page 1 so the grid paints, then a 2+ char
 * query hydrates `rootSearchPool` (Redis-cached `mode=all&limit=100`).
 */

export function isCatalogRootSearchLevel(opts: {
  currentCategoryId: string | null;
  showAllProducts: boolean;
  kioskSplit: boolean;
}): boolean {
  if (opts.currentCategoryId) return false;
  // Kiosk all-products stage is still root — showAllProducts is only the
  // first-page paint / Load-more flag, not "we left root search".
  if (opts.kioskSplit) return true;
  return !opts.showAllProducts;
}

export function shouldHydrateRootSearchPool(opts: {
  isAtRootLevel: boolean;
  search: string;
  hasPool: boolean;
}): boolean {
  if (!opts.isAtRootLevel || opts.search.trim().length < 2) return false;
  // `rootSearchPool` is the once-only latch. Do not also gate on an in-flight
  // loading flag — that flag retriggers the effect, cancel discards the
  // fetch, and the next run then bails with loading stuck true.
  if (opts.hasPool) return false;
  return true;
}

export function resolveCatalogProductPool<T>(opts: {
  isAtRootLevel: boolean;
  search: string;
  rootSearchPool: T[] | null;
  products: T[];
}): T[] {
  if (opts.isAtRootLevel && opts.search.trim().length >= 2 && opts.rootSearchPool) {
    return opts.rootSearchPool;
  }
  return opts.products;
}
