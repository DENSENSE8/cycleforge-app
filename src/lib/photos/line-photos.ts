/**
 * Every photo of the thing on an order line — the catalog hero, the listing's
 * catalog gallery (the item # resolves to its `sku_catalog` row on the order),
 * and every photo linked to the SKU (catalog links, serialized units' test /
 * pack shots, receiving lines' item shots). Owner 2026-09-24.
 *
 * Client-side, fetched on press. Shared by the desk ledger (Unbox's
 * `PhotoViewerPortal`) and the phone record (`MobileSwipePhotoViewer`); each
 * maps {@link LinePhoto} onto its own viewer's input.
 */

export interface LinePhotoSubject {
  skuCatalogId: number | null;
  sku: string | null;
  itemNumber: string | null;
  /** The catalog hero the row paints — first, so the viewer opens on it. */
  catalogImageUrl: string | null;
}

export interface LinePhoto {
  /** `photos.id`; null for the catalog hero (a URL, not a library photo). */
  id: number | null;
  url: string;
  thumbUrl: string | null;
  caption: string | null;
}

interface ListingGalleryItem {
  photoId: number;
  displayUrl: string;
  thumbUrl: string;
}

interface LibraryPhoto {
  id: number;
  displayUrl: string;
  thumbUrl: string;
  legacyUrl?: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Photos ${res.status}`);
  return (await res.json()) as T;
}

/** `ITEM · SKU`, once when they are the same string; `this line` when neither. */
export function linePhotoLabel(itemNumber: string | null, sku: string | null): string {
  const parts = [itemNumber, sku].map((v) => (v ?? '').trim()).filter(Boolean);
  return Array.from(new Set(parts)).join(' · ') || 'this line';
}

/** Query key for {@link fetchLinePhotos} — one cache for desk and phone. */
export function linePhotosQueryKey(subject: LinePhotoSubject) {
  return ['line-photos', subject.skuCatalogId, subject.sku ?? '', subject.catalogImageUrl ?? ''] as const;
}

/** Catalog hero + listing gallery + SKU-linked photos, deduped by photo id / url. */
export async function fetchLinePhotos(subject: LinePhotoSubject): Promise<LinePhoto[]> {
  const sku = (subject.sku ?? '').trim();
  const [gallery, library] = await Promise.all([
    subject.skuCatalogId && subject.skuCatalogId > 0
      ? fetchJson<{ items: ListingGalleryItem[] }>(
          `/api/photos/listing-gallery?targetKind=sku&targetId=${subject.skuCatalogId}`,
        ).then((r) => r.items ?? [])
      : Promise.resolve([] as ListingGalleryItem[]),
    sku
      ? fetchJson<{ photos: LibraryPhoto[] }>(
          `/api/photos/library?sku=${encodeURIComponent(sku)}&limit=96`,
        ).then((r) => r.photos ?? [])
      : Promise.resolve([] as LibraryPhoto[]),
  ]);

  const out: LinePhoto[] = [];
  const seenIds = new Set<number>();
  const seenUrls = new Set<string>();
  const push = (photo: LinePhoto) => {
    if (photo.id != null) {
      if (seenIds.has(photo.id)) return;
      seenIds.add(photo.id);
    }
    if (seenUrls.has(photo.url)) return;
    seenUrls.add(photo.url);
    out.push(photo);
  };
  const hero = (subject.catalogImageUrl ?? '').trim();
  if (hero) push({ id: null, url: hero, thumbUrl: null, caption: 'Catalog image' });
  for (const g of gallery) push({ id: g.photoId, url: g.displayUrl, thumbUrl: g.thumbUrl, caption: null });
  for (const p of library) {
    push({ id: p.id, url: p.legacyUrl || p.displayUrl, thumbUrl: p.thumbUrl, caption: null });
  }
  return out;
}
