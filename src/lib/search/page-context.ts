/** page-context — maps the surface a search was issued FROM to the entity types it most likely targets (AI search Phase 2, plan §8.1 / §12… */

import type { SearchEntityType } from '@/lib/search/build-search-text';

/** First-path-segment → likely entity types. Order is meaningless. */
const SEGMENT_SCOPE: Record<string, SearchEntityType[]> = {
  dashboard: ['ORDER'],
  pack: ['ORDER'], // first-class Packing surface (operator-surfaces Phase 7)
  packer: ['ORDER'], // legacy alias
  shipped: ['ORDER'],
  receiving: ['RECEIVING'], // also covers the nested `/receiving/history` surface
  unbox: ['RECEIVING'],
  carton: ['RECEIVING'], // `/carton/[id]` — the read-only carton record (D4)
  triage: ['RECEIVING'],
  incoming: ['RECEIVING'],
  pickup: ['RECEIVING'], // Walk-In front-desk station (operator-surfaces Phase 9)
  products: ['SKU'],
  'sku-stock': ['SKU'],
  inventory: ['SERIAL_UNIT', 'SKU'],
  test: ['SERIAL_UNIT'], // first-class Testing surface (operator-surfaces Phase 8)
  tech: ['SERIAL_UNIT'], // legacy alias
  testing: ['SERIAL_UNIT'],
  repair: ['REPAIR'],
  fba: ['FBA_SHIPMENT'],
  shipping: ['ORDER'], // first-class Shipping surface
  outbound: ['ORDER'], // legacy alias
};

/**
 * Resolve a pageContext string (pathname, possibly with query) to a boost
 * scope. Unknown/blank/global surfaces (operations, studio, ai-chat, …)
 * return undefined — no boost.
 */
export function pageContextToEntityTypes(
  pageContext: string | null | undefined,
): SearchEntityType[] | undefined {
  if (!pageContext) return undefined;
  let path = pageContext.trim();
  if (!path) return undefined;
  // Tolerate full URLs and query strings — we only care about the pathname.
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return undefined;
  }
  const [segment] = path.replace(/^\/+/, '').split(/[/?#]/, 1);
  if (!segment) return undefined;
  const scope = SEGMENT_SCOPE[segment.toLowerCase()];
  return scope ? [...scope] : undefined;
}
