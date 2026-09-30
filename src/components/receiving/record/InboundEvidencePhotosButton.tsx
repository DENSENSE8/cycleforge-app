'use client';

/**
 * The inbound record's EVIDENCE photos door — the twin of the order record's
 * `OrderEvidencePhotosButton` (owner 2026-09-29): what the floor shot on this
 * carton (arrival, unbox), read-only, through the shared {@link RecordPhotosDoor}.
 * With no carton yet (before the door scan) it reads "No photos yet".
 */

import { useMemo } from 'react';
import { RecordPhotosDoor } from '@/components/photos/RecordPhotosDoor';
import { receivingPhotoMeta } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { useReceivingPhotos } from '@/hooks/useReceivingPhotos';

export function InboundEvidencePhotosButton({
  receivingId,
  poRef,
}: {
  /** The carton; null before the door scan (nothing shot yet). */
  receivingId: number | null;
  poRef: string | null;
}) {
  const { photos: rows, isFetching, isError } = useReceivingPhotos(receivingId, { readOnly: true });
  const photos = useMemo(
    () => rows.map((photo) => ({ url: photo.photoUrl, meta: receivingPhotoMeta(photo, { poRef }) })),
    [rows, poRef],
  );
  return (
    <RecordPhotosDoor
      photos={photos}
      fetching={isFetching}
      error={isError}
      galleryId={receivingId ? `recv-${receivingId}` : undefined}
      noun="receiving"
      testId="inbound-record-photos"
    />
  );
}
