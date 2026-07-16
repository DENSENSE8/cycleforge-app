import { normalizePhotoDisplayUrl } from '@/lib/nas-photo-url';
import { resolvePhotoThumbUrl } from '@/lib/photos/display-url';
import {
  photoGridTileRatio,
  type PhotoGridDensity,
  type PhotoGridTileRatio,
} from '@/lib/photos/photo-grid-density';

/**
 * Build a preview URL for the photo-selection grid. The dev proxy supports
 * `?thumb`; prod loads the full image through the same-origin /api/nas proxy
 * (session cookie).
 */
export function claimThumb(url: string, photoId?: number): string {
  if (photoId != null && photoId > 0) {
    return resolvePhotoThumbUrl({ id: photoId, url }, normalizePhotoDisplayUrl);
  }
  const normalized = normalizePhotoDisplayUrl(url);
  if (normalized.startsWith('/api/nas-dev/')) {
    return normalized + (normalized.includes('?') ? '&' : '?') + 'thumb=200';
  }
  return normalized;
}

/** Grid tile src + aspect for the claim / receiving photo attach picker. */
export function claimPhotoTileProps(
  photo: { id: number; url: string },
  density: PhotoGridDensity,
): { ratio: PhotoGridTileRatio; imageUrl: string } {
  return {
    ratio: photoGridTileRatio(density),
    imageUrl:
      density === 'lg' ? normalizePhotoDisplayUrl(photo.url) : claimThumb(photo.url, photo.id),
  };
}

// `ticketDate` moved to @/components/support/link/TicketPicker with the picker
// itself — that component was its only consumer, and leaving a copy here would
// be the fork the promotion exists to prevent.
