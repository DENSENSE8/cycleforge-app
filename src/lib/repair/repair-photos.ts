import { uploadPhotoClient, type ClientUploadResult } from '@/lib/photos/upload-client';

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
