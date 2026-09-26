/**
 * What a product LOOKS LIKE — one rule, Zoho first.
 * Zoho Inventory is the SoT for a unit's photo (operator 2026-09-05). `items`
 */
import { photoContentUrl } from './display-url';

export interface ProductImageSources {
  /** `items.zoho_item_id` — the mirror's handle, and the URL's path segment. */
  zohoItemId?: string | null;
  /** `items.image_document_id` — present only when the item HAS a photo. */
  zohoImageDocumentId?: string | null;
  /** `sku_catalog.image_url` — the catalog stock photo. */
  catalogImageUrl?: string | null;
  /** Cover `photo_id` of the SKU's listing gallery — marketplace media's tier. */
  listingCoverPhotoId?: number | null;
}

/**
 * The product's image URL, or `null` when nothing knows one.
 *
 * `null` is load-bearing: every caller hands it to a cell that paints a typed
 * placeholder, and a fabricated URL would paint a broken `<img>` instead.
 */
export function productImageUrl(sources: ProductImageSources): string | null {
  const zohoItemId = String(sources.zohoItemId ?? '').trim();
  const documentId = String(sources.zohoImageDocumentId ?? '').trim();
  if (zohoItemId && documentId) {
    return `/api/zoho/items/${encodeURIComponent(zohoItemId)}/image`;
  }
  const catalog = String(sources.catalogImageUrl ?? '').trim();
  if (catalog) return catalog;
  const cover = Number(sources.listingCoverPhotoId);
  return Number.isInteger(cover) && cover > 0 ? photoContentUrl(cover, 'thumb') : null;
}
