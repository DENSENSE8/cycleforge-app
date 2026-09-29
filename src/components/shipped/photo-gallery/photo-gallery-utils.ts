import { normalizePhotoDisplayUrl } from '@/lib/nas-photo-url';
import { photoContentUrl, resolvePhotoDisplayUrl } from '@/lib/photos/display-url';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { PhotoEvidenceStage } from '@/lib/photos/stages';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';

/** Source-scoped context for a single photo, surfaced by the fullscreen viewer's info panel ({@link PhotoContextPanel}). */
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
  /** Device-reported capture instant (`photos.client_captured_at`) — the shutter clock, which for a queued mobile upload can precede… */
  clientCapturedAt?: string | null;
  damageDetected?: boolean | null;
  hasAnalysis?: boolean | null;
  caption?: string | null;
  /** Evidence stage (`@/lib/photos/stages`) — resolved from (entity × photo_type) by the builder, rendered as a label by the panel. */
  stage?: PhotoEvidenceStage | null;
  /** Library source scope, for the source badge + "view all from source" link. */
  sourceScope?: PhotoLibrarySourceScope;
}

/** Minimal meta for receiving/unbox captures — lights up the viewer info panel. */
function unboxingPhotoMeta(fields: {
  poRef?: string | null;
  caption?: string | null;
  createdAt?: string | null;
  /** Shutter clock off the row (`/api/receiving-photos` → `clientCapturedAt`). */
  clientCapturedAt?: string | null;
  takenByStaffName?: string | null;
  stage?: PhotoEvidenceStage | null;
}): PhotoMeta {
  return {
    poRef: fields.poRef ?? null,
    caption: fields.caption ?? null,
    createdAt: fields.createdAt ?? null,
    clientCapturedAt: fields.clientCapturedAt ?? null,
    takenByStaffName: fields.takenByStaffName ?? null,
    stage: fields.stage ?? null,
    photoType: 'RECEIVING',
    sourceScope: 'unboxing',
  };
}

/** A receiving/carton photo row (as returned by `/api/receiving-photos`). */
interface ReceivingPhotoRowLike {
  id: number;
  photoUrl: string;
  /**
   * The list route's legacy alias — it carries `photos.photo_type`, NOT display
   * text (`photos` has no caption column). Read as the stage, never rendered.
   */
  caption?: string | null;
  /** `photos.photo_type` under its real name; falls back to {@link caption}. */
  photoType?: string | null;
  /** Present ⇒ item evidence, by the identity law. Decides the entity half. */
  receivingLineId?: number | null;
  createdAt?: string | null;
  /** Shutter clock from `/api/receiving-photos`; null on desktop/legacy rows. */
  clientCapturedAt?: string | null;
}

/** The ONE place receiving/unbox photo meta is built. */
export function receivingPhotoMeta(
  row: Pick<
    ReceivingPhotoRowLike,
    'caption' | 'photoType' | 'receivingLineId' | 'createdAt' | 'clientCapturedAt'
  >,
  ctx: { poRef: string | null },
): PhotoMeta {
  return unboxingPhotoMeta({
    poRef: ctx.poRef,
    // NOT `row.caption` — that alias carries the photo_type, and feeding it here
    // is what printed `receiving_package` under the viewer's "Caption" heading.
    // There is no caption to show, so the field stays absent.
    caption: null,
    stage: receivingPhotoStage(row),
    createdAt: row.createdAt,
    clientCapturedAt: row.clientCapturedAt,
  });
}

/** Evidence stage of a receiving photo row. */
export function receivingPhotoStage(
  row: Pick<ReceivingPhotoRowLike, 'caption' | 'photoType' | 'receivingLineId'>,
): PhotoEvidenceStage | null {
  const entityType = row.receivingLineId != null ? 'RECEIVING_LINE' : 'RECEIVING';
  return receivingStageFromPhotoType(entityType, row.photoType ?? row.caption);
}

/** Receiving photo row → `PhotoGallery` input `{id, url, meta}` (poRef required). */
export function receivingPhotoToGalleryInput(
  row: ReceivingPhotoRowLike,
  ctx: { poRef: string | null },
): { id: number; url: string; meta: PhotoMeta } {
  return { id: row.id, url: row.photoUrl, meta: receivingPhotoMeta(row, ctx) };
}

/** Photo input shapes accepted by the gallery. */
export type PhotoGalleryInput =
  | string
  | { id?: number; url: string; thumbUrl?: string; index?: number; uploadedAt?: string; meta?: PhotoMeta };

export interface PhotoItem {
  id: number | null;
  url: string;
  /** Lightweight thumbnail — used for grid tiles, the strip, and as an instant
   *  placeholder under the full-res main image so the viewer never shows black. */
  thumbUrl?: string;
  /** The tile (thumb) preload — what the launcher strip paints on. */
  status: 'loading' | 'loaded' | 'error';
  /** The full-res preload, run only while the viewer is open. */
  full?: 'loaded' | 'error';
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
        // An id'd photo always has a `?variant=thumb` (stored or synthesized) —
        // the strip must not pull the full-res bytes just to paint a tile.
        thumbUrl: photo.thumbUrl?.trim()
          ? normalizePhotoDisplayUrl(photo.thumbUrl)
          : idNum != null && idNum > 0
            ? photoContentUrl(idNum, 'thumb')
            : undefined,
        meta: photo.meta,
      };
    })
    .filter((p): p is ParsedPhoto => p !== null);
}

/** Stable fingerprint of a parsed list — used to skip no-op re-inits. */
export function photosFingerprint(parsed: { id: number | null; url: string }[]): string {
  return parsed.map((p) => `${p.id ?? ''}|${p.url}`).join(' ');
}

/** Shared `layoutId` for the media-library grid tile ↔ fullscreen viewer hero morph — the SAME id on `PhotoThumb` (grid) and the viewer's… */
export function photoHeroLayoutId(id: number | null | undefined): string | undefined {
  return typeof id === 'number' && Number.isFinite(id) ? `photo-hero-${id}` : undefined;
}
