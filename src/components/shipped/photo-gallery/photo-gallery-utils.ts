import { normalizePhotoDisplayUrl } from '@/lib/nas-photo-url';
import { resolvePhotoDisplayUrl } from '@/lib/photos/display-url';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';

/**
 * Source-scoped context for a single photo, surfaced by the fullscreen viewer's
 * info panel ({@link PhotoContextPanel}). Every field is optional so callers that
 * only have a URL (legacy thumbnail strips) keep working — the panel simply
 * renders less. Populated from `LibraryPhoto` in the photo library.
 */
export interface PhotoMeta {
  /** Denormalized ticket/PO ref (PO# for receiving, order/scan ref for packing). */
  poRef?: string | null;
  photoType?: string | null;
  /** Linked Zendesk ticket id — drives the claim source + deep link. */
  ticketId?: number | null;
  takenByStaffId?: number | null;
  takenByStaffName?: string | null;
  /** Server-INSERT instant. This is the UPLOAD time, not the shutter time. */
  createdAt?: string | null;
  /**
   * Device-reported capture instant (`photos.client_captured_at`) — the shutter
   * clock, which for a queued mobile upload can precede `createdAt` by hours.
   * Null for desktop/legacy rows with no usable timestamp, and NOT
   * server-attested; the panel labels it as device-reported for that reason.
   */
  clientCapturedAt?: string | null;
  damageDetected?: boolean | null;
  hasAnalysis?: boolean | null;
  caption?: string | null;
  /** Library source scope, for the source badge + "view all from source" link. */
  sourceScope?: PhotoLibrarySourceScope;
}

/** Minimal meta for receiving/unbox captures — lights up the viewer info panel. */
export function unboxingPhotoMeta(fields: {
  poRef?: string | null;
  caption?: string | null;
  createdAt?: string | null;
  /**
   * Shutter clock off the row (`/api/receiving-photos` → `clientCapturedAt`).
   * Threaded here rather than left off, so the carton peek reports the same
   * provenance the media-library viewer does — a field written on upload and
   * never read back is not evidence, it is a column.
   */
  clientCapturedAt?: string | null;
  takenByStaffName?: string | null;
}): PhotoMeta {
  return {
    poRef: fields.poRef ?? null,
    caption: fields.caption ?? null,
    createdAt: fields.createdAt ?? null,
    clientCapturedAt: fields.clientCapturedAt ?? null,
    takenByStaffName: fields.takenByStaffName ?? null,
    photoType: 'RECEIVING',
    sourceScope: 'unboxing',
  };
}

/** A receiving/carton photo row (as returned by `/api/receiving-photos`). */
export interface ReceivingPhotoRowLike {
  id: number;
  photoUrl: string;
  caption?: string | null;
  createdAt?: string | null;
  /** Shutter clock from `/api/receiving-photos`; null on desktop/legacy rows. */
  clientCapturedAt?: string | null;
}

/**
 * The ONE place receiving/unbox photo meta is built. Every surface that shows
 * carton photos (workspace peek + header pill, station details section) maps
 * through here so none can silently drop the PO linkage again — `poRef` is a
 * REQUIRED arg (pass `null` when genuinely unknown), not an optional field a
 * call site can forget. See `photo-context-provenance.ts` for how `poRef`
 * drives the viewer's "Linked to PO …" readout + deep link.
 */
export function receivingPhotoMeta(
  row: Pick<ReceivingPhotoRowLike, 'caption' | 'createdAt' | 'clientCapturedAt'>,
  ctx: { poRef: string | null },
): PhotoMeta {
  return unboxingPhotoMeta({
    poRef: ctx.poRef,
    caption: row.caption,
    createdAt: row.createdAt,
    clientCapturedAt: row.clientCapturedAt,
  });
}

/** Receiving photo row → `PhotoGallery` input `{id, url, meta}` (poRef required). */
export function receivingPhotoToGalleryInput(
  row: ReceivingPhotoRowLike,
  ctx: { poRef: string | null },
): { id: number; url: string; meta: PhotoMeta } {
  return { id: row.id, url: row.photoUrl, meta: receivingPhotoMeta(row, ctx) };
}

/**
 * Photo input shapes accepted by the gallery. Pass `{id, url}` to enable the
 * delete affordance — the gallery hits `DELETE /api/photos/[id]` directly. Attach
 * `meta` to light up the viewer's context panel. Bare strings or the legacy
 * `{url, index, uploadedAt}` shape render read-only with no panel.
 */
export type PhotoGalleryInput =
  | string
  | { id?: number; url: string; thumbUrl?: string; index?: number; uploadedAt?: string; meta?: PhotoMeta };

export interface PhotoItem {
  id: number | null;
  url: string;
  /** Lightweight thumbnail — used for grid tiles, the strip, and as an instant
   *  placeholder under the full-res main image so the viewer never shows black. */
  thumbUrl?: string;
  status: 'loading' | 'loaded' | 'error';
  index: number;
  /** Source context for the info panel (when the caller supplied it). */
  meta?: PhotoMeta;
  /** Intrinsic pixel size, captured during preload — shown in the info panel. */
  naturalWidth?: number;
  naturalHeight?: number;
}

type ParsedPhoto = { id: number | null; url: string; thumbUrl?: string; meta?: PhotoMeta };

/** Normalize the mixed input shapes into `{id, url, thumbUrl?, meta?}`, dropping blanks. */
export function parsePhotos(photos: PhotoGalleryInput[]): ParsedPhoto[] {
  return photos
    .map((photo): ParsedPhoto | null => {
      if (typeof photo === 'string') {
        const trimmed = photo.trim();
        return trimmed ? { id: null, url: normalizePhotoDisplayUrl(trimmed) } : null;
      }
      if (!photo?.url?.trim()) return null;
      const idNum = typeof photo.id === 'number' && Number.isFinite(photo.id) ? photo.id : null;
      return {
        id: idNum,
        url: resolvePhotoDisplayUrl({ id: idNum, url: photo.url }, normalizePhotoDisplayUrl),
        thumbUrl: photo.thumbUrl?.trim() ? normalizePhotoDisplayUrl(photo.thumbUrl) : undefined,
        meta: photo.meta,
      };
    })
    .filter((p): p is ParsedPhoto => p !== null);
}

/** Stable fingerprint of a parsed list — used to skip no-op re-inits. */
export function photosFingerprint(parsed: { id: number | null; url: string }[]): string {
  return parsed.map((p) => `${p.id ?? ''}|${p.url}`).join(' ');
}

/**
 * Shared `layoutId` for the media-library grid tile ↔ fullscreen viewer hero
 * morph — the SAME id on `PhotoThumb` (grid) and the viewer's main image lets
 * framer-motion travel the actual clicked photo into the lightbox instead of
 * crossfading two unrelated elements. `null`/missing ids (legacy bare-URL
 * photos) opt out — there's nothing stable to key the morph on.
 */
export function photoHeroLayoutId(id: number | null | undefined): string | undefined {
  return typeof id === 'number' && Number.isFinite(id) ? `photo-hero-${id}` : undefined;
}
