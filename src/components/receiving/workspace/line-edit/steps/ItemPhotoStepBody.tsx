'use client';

/**
 * `item_photos` — the card READS this line's item evidence. It has no camera.
 *
 * Ruled 2026-08-02: a procedure step card carries no action button. The item
 * capture pill lives in the bottom dock (`dock/SlotDockControls` →
 * `ItemPhotoDockControl`) when that lane is mounted.
 *
 * It fetches its own line-scoped list rather than taking a slot, exactly like
 * {@link CartonPhotoStepBody}. A slot would have to be threaded from the adapter
 * for a read the body can make itself, and the two photo bodies would then be
 * two different shapes for one job.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { photoIntentFromStage } from '@/lib/receiving/photo-intent';
import type { UnboxStepBodyContext } from './types';

/** Line-scoped item evidence — never the carton's own shots. */
const ITEM_LIST_INTENT = photoIntentFromStage('unbox_item');

interface ItemPhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt?: string | null;
}

export function ItemPhotoStepBody({ row, receivingId, poRef }: UnboxStepBodyContext) {
  const lineId = row.id;
  const enabled = Number.isFinite(receivingId) && receivingId > 0 && lineId > 0;

  const { data, isPending, isError } = useQuery<{ photos: ItemPhotoRow[] }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), ITEM_LIST_INTENT, lineId],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: ITEM_LIST_INTENT,
        receivingLineId: String(lineId),
      });
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 10_000,
  });

  const photos = useMemo(
    () =>
      (data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => receivingPhotoToGalleryInput(p, { poRef: poRef ?? null })),
    [data, poRef],
  );

  if (!enabled) {
    return (
      <p className="text-role-caption text-text-soft">No item evidence to capture on this line.</p>
    );
  }

  if (isPending) {
    return <p className="text-role-caption text-text-soft">Loading item photos…</p>;
  }

  // A failed fetch is NOT "nothing shot" — saying so sends the operator to
  // re-shoot evidence that already exists.
  if (isError) {
    return <p className="text-role-caption text-text-soft">Item photos unavailable.</p>;
  }

  if (photos.length === 0) {
    return (
      <p className="text-role-caption text-text-soft">
        No item photos on this line yet — use the item camera to capture.
      </p>
    );
  }

  return (
    <PhotoGallery
      photos={photos}
      orderId={`RCV-${receivingId}`}
      receivingId={receivingId}
      launcherLayout="toolbar"
      toolbarShowLabel={false}
      compact
    />
  );
}
