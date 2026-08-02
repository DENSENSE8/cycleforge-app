/**
 * Pure preview math for {@link TimelineMediaStrip}: station density shows a
 * capped thumb row with a dedicated `+N` overflow tile when the stage has more
 * photos than `thumbLimit`.
 */

/**
 * When `mediaLength > thumbLimit`, show `thumbLimit - 1` thumbs + a `+N` tile
 * (`N = mediaLength - (thumbLimit - 1)`). Otherwise show every thumb.
 */
export function timelineMediaStripPreview(
  mediaLength: number,
  thumbLimit = 4,
): { visibleCount: number; overflowCount: number } {
  const limit = Math.max(1, Math.floor(thumbLimit));
  const n = Math.max(0, Math.floor(mediaLength));
  if (n <= limit) return { visibleCount: n, overflowCount: 0 };
  const visibleCount = limit - 1;
  return { visibleCount, overflowCount: n - visibleCount };
}

/**
 * Map a clicked stage-preview photo into a gallery index.
 * Prefer `photoId` match against `galleryPhotoIds`; fall back to URL match;
 * then fall back to `fallbackIndex` (usually the preview index or 0).
 */
export function resolveTimelineGalleryIndex(opts: {
  photoId?: number | null;
  url?: string | null;
  galleryPhotoIds: Array<number | null | undefined>;
  galleryUrls: string[];
  fallbackIndex?: number;
}): number {
  const { photoId, url, galleryPhotoIds, galleryUrls, fallbackIndex = 0 } = opts;
  if (typeof photoId === 'number' && Number.isFinite(photoId)) {
    const byId = galleryPhotoIds.findIndex((id) => id === photoId);
    if (byId >= 0) return byId;
  }
  const needle = url?.trim();
  if (needle) {
    const byUrl = galleryUrls.findIndex((u) => u === needle);
    if (byUrl >= 0) return byUrl;
  }
  const fb = Math.floor(fallbackIndex);
  if (!Number.isFinite(fb) || galleryUrls.length === 0) return 0;
  return Math.min(Math.max(0, fb), galleryUrls.length - 1);
}
