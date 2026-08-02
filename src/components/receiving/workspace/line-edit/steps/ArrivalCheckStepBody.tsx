'use client';

/**
 * `arrival_check` — READ what the door already shot. It never captures.
 *
 * The distinction is the whole point of the step. `arrival_package` is the
 * pre-opening insurance photo, and it is the only stage the `require_one`
 * receive gate counts, precisely so that gate cannot be satisfied after the box
 * is open. So this body offers no camera: the bench verifies the door's evidence
 * exists, and captures its own shots at `unbox_carton` in the three steps that
 * follow ({@link CartonPhotoStepBody}).
 *
 * A capture affordance here would be one click away from voiding the control.
 */

import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { photoIntentFromStage } from '@/lib/receiving/photo-intent';

/** Door evidence only — never the bench's own `unbox_carton` shots. */
const ARRIVAL_LIST_INTENT = photoIntentFromStage('arrival_package');
import type { UnboxStepBodyContext } from './types';

interface ArrivalPhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt?: string | null;
}

export function ArrivalCheckStepBody({ receivingId, poRef }: UnboxStepBodyContext) {
  const { data, isPending, isError } = useQuery<{ photos: ArrivalPhotoRow[] }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), ARRIVAL_LIST_INTENT],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: ARRIVAL_LIST_INTENT,
      });
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

  if (isPending) {
    return <p className="text-role-caption text-text-soft">Loading arrival photos…</p>;
  }

  // A failed fetch is NOT "no arrival photos". Saying the door shot nothing when
  // the request simply failed would send the operator to re-shoot evidence that
  // exists — and a bench shot cannot stand in for a door shot anyway.
  if (isError) {
    return <p className="text-role-caption text-text-soft">Arrival photos unavailable.</p>;
  }

  if (photos.length === 0) {
    return (
      <p className="text-role-caption text-text-soft">
        No arrival photos on this carton. They are shot at the door, before the box is
        opened — this step reads them, it cannot take them.
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
