import { uploadPhotoClient, type ClientUploadResult } from '@/lib/photos/upload-client';
import { REPAIR_RECEIVING_PHOTO_TYPE, REPAIR_SHIPPING_PHOTO_TYPE } from '@/lib/photos/types';
import { BENCH_PHOTO_TYPE } from '@/lib/repair/repair-actions';

/** One photo of `GET /api/repair-service/[id]/photos` (oldest first). */
export interface RepairPhoto {
  id: number;
  url: string;
  thumbUrl: string;
  photoType: string | null;
  createdAt: string;
}

/**
 * One ready video of `GET /api/repair-service/[id]/photos` (oldest first).
 * `url` is `/api/photos/videos/{id}/content`, a 302 to a signed GCS read.
 */
export interface RepairVideo {
  id: number;
  url: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RepairPhotosResponse {
  photos: RepairPhoto[];
  videos: RepairVideo[];
}

export type RepairMediaItem = { kind: 'photo'; photo: RepairPhoto } | { kind: 'video'; video: RepairVideo };

/**
 * The Photos screen's one timeline: photos and videos interleaved by their
 * server stamp, oldest first (the grid and the viewer share this order, so a
 * tile's index is its slide). Equal stamps keep photos before videos.
 */
export function repairMediaTimeline(
  photos: readonly RepairPhoto[],
  videos: readonly RepairVideo[],
): RepairMediaItem[] {
  const items: RepairMediaItem[] = [
    ...photos.map((photo) => ({ kind: 'photo' as const, photo })),
    ...videos.map((video) => ({ kind: 'video' as const, video })),
  ];
  const stamp = (item: RepairMediaItem) =>
    Date.parse(item.kind === 'photo' ? item.photo.createdAt : item.video.createdAt);
  // Array.prototype.sort is stable, so the photos-first spread order breaks ties.
  return items.sort((a, b) => stamp(a) - stamp(b));
}

/** The repair's two photo kinds (owner 2026-09-30): the device as it came in, and as it leaves. */
export type RepairPhotoKind = 'receiving' | 'shipping';

/** The `photo_type` an upload of each kind is stamped with. */
export const REPAIR_PHOTO_KIND_TYPE: Record<RepairPhotoKind, string> = {
  receiving: REPAIR_RECEIVING_PHOTO_TYPE,
  shipping: REPAIR_SHIPPING_PHOTO_TYPE,
};

/**
 * Which kind a stored repair photo counts as. Shipping is the stamped shipping
 * shot or the bench's "after" shot (the repaired device, as it leaves); every
 * other row — the stamped receiving shot, the bench "before" shot, untyped
 * phone shots and legacy rows — is the device as it came in (receiving).
 */
export function repairPhotoKind(photoType: string | null | undefined): RepairPhotoKind {
  const t = String(photoType ?? '').trim().toLowerCase();
  return t === REPAIR_SHIPPING_PHOTO_TYPE || t === BENCH_PHOTO_TYPE.after ? 'shipping' : 'receiving';
}

/** Upload one repair evidence photo through the unified `/api/photos/upload` waist (entity `REPAIR_SERVICE`, gated `repair.intake`). */
export function uploadRepairPhoto(
  repairId: number,
  file: Blob,
  opts: { photoType?: string; capturedAtMs?: number | null } = {},
): Promise<ClientUploadResult> {
  return uploadPhotoClient({
    file,
    entityType: 'REPAIR_SERVICE',
    entityId: repairId,
    photoType: opts.photoType,
    clientCapturedAtMs: opts.capturedAtMs ?? null,
  });
}
