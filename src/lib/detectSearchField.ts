export type SearchField = 'ecwid_sku' | 'zoho_sku' | 'title';

/** Pick the right search field for the SKU catalog based on the shape of the query. */
function detectSkuCatalogSearchField(query: string): SearchField {
  const trimmed = query.trim();
  if (!trimmed) return 'ecwid_sku';
  if (/\s/.test(trimmed)) return 'title';
  if (/^[0-9-]+$/.test(trimmed)) return 'ecwid_sku';
  if (/[A-Za-z]{3,}/.test(trimmed)) return 'title';
  return 'ecwid_sku';
}
