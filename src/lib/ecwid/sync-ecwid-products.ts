/**
 * Pure helpers for the Ecwid product-mirror sync
 * (POST /api/sku-catalog/sync-ecwid-products).
 *
 * Extracted DB-free so the parse / completeness / reconcile-missing logic is
 * unit-testable (reversibility plan 5.4 — deactivate pass must never run on a
 * truncated fetch). The route owns fetch + upsert; these functions own the
 * decisions.
 */

export interface EcwidMirrorProduct {
  ecwidProductId: string;
  sku: string | null;
  name: string;
  thumbnailUrl: string | null;
  /**
   * Ecwid's canonical storefront product URL (`items[].url`), persisted to
   * `sku_platform_ids.listing_url`.
   *
   * This is the ONLY place a real per-product storefront link enters the app.
   * Every other listing href for an ecwid SKU is built by
   * `getExternalUrlByPlatform`, which can only produce
   * `/products/search?keyword=<sku>` — a link that lands the reader in the
   * storefront's own search box rather than on the product. Null whenever the
   * payload has no usable http(s) URL, so callers keep the keyword fallback.
   */
  listingUrl: string | null;
}

/**
 * An http(s) URL or null — never a bare string.
 *
 * `listing_url` is rendered as an openable link, so a malformed value would
 * paint a dead control on the product page. Anything that is not a parseable
 * http/https URL is dropped and the caller falls back to keyword search.
 */
function httpUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return value;
  } catch {
    return null;
  }
}

/** Parse one Ecwid `items` page into mirror products (drops id-less/name-less rows). */
export function parseEcwidProductItems(items: unknown): EcwidMirrorProduct[] {
  if (!Array.isArray(items)) return [];
  const out: EcwidMirrorProduct[] = [];
  for (const item of items) {
    if (item == null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const ecwidProductId = String(rec.id || '').trim();
    const sku = String(rec.sku || '').trim() || null;
    const name = String(rec.name || '').trim();
    if (!ecwidProductId || !name) continue;
    out.push({
      ecwidProductId,
      sku,
      name,
      thumbnailUrl: typeof rec.thumbnailUrl === 'string' ? rec.thumbnailUrl : null,
      listingUrl: httpUrlOrNull(rec.url),
    });
  }
  return out;
}

/**
 * A paginated fetch is COMPLETE only when it terminated on a short page
 * (fewer items than the page limit). Exhausting the page cap with a full
 * final page means the catalog may be truncated — the deactivate pass must
 * not run on such a fetch (never mass-deactivate on a partial view).
 */
export function isEcwidFetchComplete(lastPageItemCount: number, pageLimit: number): boolean {
  return lastPageItemCount < pageLimit;
}

/**
 * Reconcile-missing: given the org's currently-active ecwid platform rows and
 * the ids seen in the latest COMPLETE fetch, return the row ids to soft-
 * deactivate. Rows without a platform_item_id can't be reconciled — skipped.
 */
export function selectStaleEcwidRowIds(
  existingRows: Array<{ id: number; platform_item_id: string | null }>,
  fetchedItemIds: Iterable<string>,
): number[] {
  const fetched = new Set(fetchedItemIds);
  return existingRows
    .filter((row) => row.platform_item_id != null && row.platform_item_id !== '' && !fetched.has(row.platform_item_id))
    .map((row) => row.id);
}
