/** The `/products` URL contract — the L2 view vocabulary plus the detail href. */

const PRODUCTS_VIEWS = ['catalog', 'manuals', 'labels', 'pairing', 'qc'] as const;

export type ProductsView = (typeof PRODUCTS_VIEWS)[number];

const PRODUCTS_VIEW_SET = new Set<string>(PRODUCTS_VIEWS);

/** The default all-products view is represented by the bare `/products` URL. */
const DEFAULT_PRODUCTS_VIEW: ProductsView = 'catalog';

/** Any unrecognised value resolves to the default — never throws. */
export function parseProductsView(raw: string | null | undefined): ProductsView {
  if (raw && PRODUCTS_VIEW_SET.has(raw)) return raw as ProductsView;
  return DEFAULT_PRODUCTS_VIEW;
}

/** Href for a SKU's product detail page. */
export function productDetailHref(sku: string): string {
  return `/products/sku/${encodeURIComponent(sku)}`;
}
