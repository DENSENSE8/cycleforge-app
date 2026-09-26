/**
 * Pick a catalog SKU from a paste search — exact SKU wins, then a unique hit.
 *
 * Ambiguous lists stay ambiguous: the toolbar paste must not guess which of
 * three Bose units the operator meant. That pick lives in Resolve.
 */

export type CatalogPasteHit = {
  id: number;
  sku: string;
  zoho_sku?: string | null;
};

type CatalogPasteMatch =
  | { kind: 'none' }
  | { kind: 'exact'; hit: CatalogPasteHit }
  | { kind: 'unique'; hit: CatalogPasteHit }
  | { kind: 'ambiguous'; hits: readonly CatalogPasteHit[] };

function skuEquals(hit: CatalogPasteHit, needle: string): boolean {
  if (hit.sku.trim().toLowerCase() === needle) return true;
  const zoho = (hit.zoho_sku ?? '').trim().toLowerCase();
  return zoho.length > 0 && zoho === needle;
}

export function matchCatalogHits(
  hits: readonly CatalogPasteHit[],
  itemNumber: string,
): CatalogPasteMatch {
  const needle = itemNumber.trim().toLowerCase();
  if (!needle) return { kind: 'none' };

  const exact = hits.filter((hit) => skuEquals(hit, needle));
  if (exact.length === 1) return { kind: 'exact', hit: exact[0] };
  if (exact.length > 1) return { kind: 'ambiguous', hits: exact };
  if (hits.length === 1) return { kind: 'unique', hit: hits[0] };
  if (hits.length === 0) return { kind: 'none' };
  return { kind: 'ambiguous', hits };
}
