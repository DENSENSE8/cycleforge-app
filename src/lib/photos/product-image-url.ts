/**
 * What a product LOOKS LIKE — one rule, OUR catalog first (owner decision
 * 2026-09-29): the catalog stock photo, then the SKU listing-gallery cover (a
 * photo an operator uploaded on the record, or marketplace media the backfill
 * landed), then the Zoho item image, then nothing (the caller's initials).
 * The same order is written in SQL by `RECEIVING_LINE_IMAGE_URL_SQL`,
 * `orders-list.ts` (`catalog_image_url`) and `orderLineImageSql`.
 */
import { photoContentUrl } from './display-url';

interface ProductImageSources {
  /** `sku_catalog.image_url` — the catalog stock photo. */
  catalogImageUrl?: string | null;
  /** Cover `photo_id` of the SKU's listing gallery — our own product photo. */
  listingCoverPhotoId?: number | null;
  /** `items.zoho_item_id` — the mirror's handle, and the URL's path segment. */
  zohoItemId?: string | null;
  /** `items.image_document_id` — present only when the item HAS a photo. */
  zohoImageDocumentId?: string | null;
}

/**
 * The product's image URL, or `null` when nothing knows one.
 *
 * `null` is load-bearing: every caller hands it to a cell that paints a typed
 * placeholder, and a fabricated URL would paint a broken `<img>` instead.
 */
export function productImageUrl(sources: ProductImageSources): string | null {
  const catalog = String(sources.catalogImageUrl ?? '').trim();
  if (catalog) return catalog;
  const cover = Number(sources.listingCoverPhotoId);
  if (Number.isInteger(cover) && cover > 0) return photoContentUrl(cover, 'thumb');
  const zohoItemId = String(sources.zohoItemId ?? '').trim();
  const documentId = String(sources.zohoImageDocumentId ?? '').trim();
  return zohoItemId && documentId ? `/api/zoho/items/${encodeURIComponent(zohoItemId)}/image` : null;
}
