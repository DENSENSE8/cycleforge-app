/**
 * The `/products` URL contract — the L2 view vocabulary plus the detail href.
 *
 * The view list was previously re-typed in four places (`ProductsSidebarPanel`'s
 * `parseView`, `ProductsWorkspace`'s render chain, `SIDEBAR_PAGE_NAV`'s
 * `resolveChild`, and the route param spec), so adding a view meant remembering
 * all four. Compose this instead.
 *
 * `manuals` is the default and stays OUT of the URL — a mode target writes
 * `view: null` for it, exactly like every other default-drops mode in this app.
 *
 * Deliberately dependency-free: a server resolver (`lib/gs1`) and a client grid
 * both build the detail href, so this module must be safe at any altitude.
 */

export const PRODUCTS_VIEWS = ['manuals', 'catalog', 'labels', 'pairing', 'qc', 'kit'] as const;

export type ProductsView = (typeof PRODUCTS_VIEWS)[number];

const PRODUCTS_VIEW_SET = new Set<string>(PRODUCTS_VIEWS);

/**
 * The default view, dropped from the URL rather than written. Deliberately not
 * exported — callers ask `productsViewParam()` whether a view belongs in the URL
 * rather than comparing against this themselves.
 */
const DEFAULT_PRODUCTS_VIEW: ProductsView = 'manuals';

/** Any unrecognised value resolves to the default — never throws. */
export function parseProductsView(raw: string | null | undefined): ProductsView {
  if (raw && PRODUCTS_VIEW_SET.has(raw)) return raw as ProductsView;
  return DEFAULT_PRODUCTS_VIEW;
}

/** The `?view=` value for a view, or `null` when it is the default. */
export function productsViewParam(view: ProductsView): string | null {
  return view === DEFAULT_PRODUCTS_VIEW ? null : view;
}

/**
 * Href for a SKU's product detail page.
 *
 * The dynamic child is namespaced under a STATIC `sku` segment — the same shape
 * as `/inventory/sku/[sku]` and `/receiving/lines/[id]`. A bare `/products/[sku]`
 * could not survive `/products` growing view segments: static beats dynamic in
 * Next.js, so the SKU named `qc` would silently become unreachable the day a
 * `/products/qc` page exists. `next.config.ts` redirects the old bare path.
 */
export function productDetailHref(sku: string): string {
  return `/products/sku/${encodeURIComponent(sku)}`;
}
