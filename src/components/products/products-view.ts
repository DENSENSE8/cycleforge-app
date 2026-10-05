/** The `/products` URL contract — the L2 view vocabulary, the open record and the detail href. */

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

/**
 * The catalog product open in the list's record plane (`/products?openSku=<SKU>`) —
 * the same key the detail-stack history tracker records for a product (`DETAIL_STACK_DEFS.sku`).
 */
export const PRODUCT_RECORD_PARAM = 'openSku';

/** Href for a SKU's standalone product page — the deep-link landing (GS1 resolver); the catalog list opens records in place. */
export function productDetailHref(sku: string): string {
  return `/products/sku/${encodeURIComponent(sku)}`;
}
