'use client';

import { useQuery } from '@tanstack/react-query';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';

interface PhotosPayload {
  photos?: Array<{ photoUrl?: string | null }>;
}

/**
 * Live per-carton photo count, sharing the exact TanStack cache the camera ×N
 * badge (`ReceivingPhotoButton`) fills — so the progress stepper's Photos gate
 * and the camera pill can never disagree.
 *
 * Why this exists: the denormalized per-line `row.photo_count` is a snapshot
 * that gets clobbered back to 0 whenever an unrelated mutation (e.g. a Condition
 * update) re-patches or refetches the line, which flipped the Photos step back
 * to "active" even though 6 photos plainly existed on the carton. The live
 * `receiving-photos` cache is keyed on the carton (`receivingId`) and is NOT
 * touched by those mutations, so reading it keeps Photos done once photos exist.
 *
 * Falls back to `fallbackCount` (the row snapshot) only until the live query
 * hydrates or when the carton id is unknown (pre-carton stub). Once the live
 * payload is present it is authoritative — a genuine 0 (all photos deleted)
 * correctly reads as Photos-not-done.
 */
export function useReceivingPhotoCount(
  receivingId: number | null | undefined,
  fallbackCount = 0,
): number {
  const id = Number(receivingId);
  const valid = Number.isFinite(id) && id > 0;

  const { data } = useQuery<PhotosPayload>({
    queryKey: receivingPhotosQueryKey(valid ? id : 0),
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${id}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: valid,
    staleTime: 10_000,
  });

  if (!valid || !data) return Math.max(0, fallbackCount);
  return (data.photos ?? []).filter((p) => !!p.photoUrl?.trim()).length;
}
