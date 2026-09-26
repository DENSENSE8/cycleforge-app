/** The `/products` URL contract — the L2 view vocabulary plus the detail href. */

/** Reference (`catalog`) and Kit Parts (`kit`) left this list 2026-09-15 on the operator's ruling — *"removing the products reference, the… */
export const PRODUCTS_VIEWS = ['manuals', 'labels', 'pairing', 'qc'] as const;

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

/** Href for a SKU's product detail page. */
export function productDetailHref(sku: string): string {
  return `/products/sku/${encodeURIComponent(sku)}`;
}
