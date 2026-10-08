/** Client-safe photo content URL helpers. */

/**
 * `full` (default) = the original upload (downloads, open-in-new-tab);
 * `display` = the viewer's screen-sized derivative; `thumb` = grid/strip tiles.
 */
export function photoContentUrl(id: number, variant?: 'thumb' | 'display' | 'full'): string {
  const q = variant === 'thumb' || variant === 'display' ? `?variant=${variant}` : '';
  return `/api/photos/${id}/content${q}`;
}

/** Stable same-origin URL for an entity video; the route 302s to a short-lived signed GCS read. */
export function videoContentUrl(id: number): string {
  return `/api/photos/videos/${id}/content`;
}

/**
 * Resolve a display URL for a photo list item.
 * Prefer id-based content route when photo id is known; fall back to legacy url normalization.
 */
export function resolvePhotoDisplayUrl(
  photo: { id?: number | null; url?: string | null },
  normalizeLegacy?: (url: string) => string,
): string {
  if (photo.id != null && photo.id > 0) {
    return photoContentUrl(photo.id);
  }
  const legacy = (photo.url || '').trim();
  if (!legacy) return '';
  return normalizeLegacy ? normalizeLegacy(legacy) : legacy;
}

export function resolvePhotoThumbUrl(
  photo: { id?: number | null; url?: string | null },
  normalizeLegacy?: (url: string) => string,
): string {
  if (photo.id != null && photo.id > 0) {
    return photoContentUrl(photo.id, 'thumb');
  }
  return resolvePhotoDisplayUrl(photo, normalizeLegacy);
}
