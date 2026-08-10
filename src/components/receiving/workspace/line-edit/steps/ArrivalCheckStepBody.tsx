'use client';

/**
 * Door photo step body — `arrival_label_photo` / `arrival_box_photo`.
 *
 * Reads what the door already shot for THIS aspect. Capture of missing door
 * evidence lives in the dock (`ArrivalPhotosDockControl`, `arrival_package` +
 * step aspect). Never shows bench `unbox_carton` shots.
 */

import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { photoIntentFromStage } from '@/lib/receiving/photo-intent';
import { photoAspectLabel } from '@/lib/photos/photo-aspects';
import type { UnboxStepBodyContext } from './types';

/** Door evidence only — never the bench's own `unbox_carton` shots. */
const ARRIVAL_LIST_INTENT = photoIntentFromStage('arrival_package');

interface ArrivalPhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt?: string | null;
}

export function ArrivalCheckStepBody({ receivingId, aspect, poRef }: UnboxStepBodyContext) {
  const { data, isPending, isError } = useQuery<{ photos: ArrivalPhotoRow[] }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), ARRIVAL_LIST_INTENT, aspect ?? 'any'],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: ARRIVAL_LIST_INTENT,
      });
      if (aspect) params.set('photoAspect', aspect);
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: 10_000,
  });

  const photos = useMemo(
    () =>
      (data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => receivingPhotoToGalleryInput(p, { poRef: poRef ?? null })),
    [data, poRef],
  );

  const aspectNoun = aspect ? photoAspectLabel(aspect).toLowerCase() : 'door photo';

  if (isPending) {
    return <p className="text-role-caption text-text-soft">Loading {aspectNoun}…</p>;
  }

  if (isError) {
    return <p className="text-role-caption text-text-soft">{aspectNoun} unavailable.</p>;
  }

  if (photos.length === 0) {
    return (
      <p className="text-role-caption text-text-soft">
        No {aspectNoun} on this carton yet. Shot at the door before the box is
        opened — use Link, Upload, or Send to phone on the floor.
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
