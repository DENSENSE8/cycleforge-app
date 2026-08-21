'use client';

/**
 * Carton search/read History — unit journeys only (no Units|Tracking slider).
 *
 * Distinct from the shared {@link WorkspaceTimelineTab} used on Unbox / Testing /
 * Shipping. Journey thumbs open the full carton receiving-photo set
 * (`GET /api/receiving-photos?receivingId=`), not the capped stage preview.
 *
 * Loading and absence go through `UniversalLoader` / `EmptyState` (2026-08-21),
 * the same faces `/search` wears — this file had a hand-rolled spinner row and
 * two hand-painted dashed cards, and `/search?sel=receiving:` renders it right
 * beside the order branch that uses the house primitives.
 */

import { useMemo } from 'react';
import { Barcode } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { StationUnitJourneys } from '@/components/station/workbench/StationUnitJourneys';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { useCartonSerials } from '@/hooks/useCartonSerials';
import { useReceivingPhotos } from '@/hooks/useReceivingPhotos';

export function CartonUnitJourneyHistory({
  receivingId,
}: {
  receivingId: number | string;
}) {
  const serialQuery = useCartonSerials(receivingId);
  const serials = serialQuery.serials;

  // Shared carton query. This used to hold its own `useQuery` on
  // `['receiving-photos', String(id)]` — a fourth cache entry for the same rows,
  // on the same page as the triage panel, so `/carton/[id]` fetched this
  // endpoint twice on every open and the two copies could disagree after a
  // delete landed elsewhere.
  const { photos } = useReceivingPhotos(receivingId, { readOnly: true });

  const { galleryPhotos, galleryMatchIds } = useMemo(() => {
    const rows = photos.filter((p) => Number.isFinite(Number(p.id)));
    // URL-only inputs — delete/upload stay off the carton read surface.
    const galleryPhotos: PhotoGalleryInput[] = rows.map((p) => ({ url: p.photoUrl }));
    const galleryMatchIds = rows.map((p) => Number(p.id));
    return { galleryPhotos, galleryMatchIds };
  }, [photos]);

  if (serialQuery.isLoading) {
    return <UniversalLoader isLoading label="Loading serials" className="min-h-24" />;
  }
  if (serialQuery.isError) {
    return (
      <EmptyState
        tone="danger"
        icon={<Barcode className="h-6 w-6 text-text-danger" />}
        title="Could not load this carton’s serials"
        description="The journey feed is unavailable — the rest of the record is unaffected."
        // Retry is a real action, so it wears the house secondary button rather
        // than a rose underline hand-painted onto a ghost.
        action={
          <Button variant="secondary" onClick={() => serialQuery.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (serials.length === 0) {
    return (
      <EmptyState
        icon={<Barcode className="h-6 w-6 text-text-faint" />}
        title="No serialized units yet"
        description="Nothing on this receiving has been given a serial."
      />
    );
  }

  return (
    <StationUnitJourneys
      serials={serials}
      galleryPhotos={galleryPhotos.length > 0 ? galleryPhotos : undefined}
      galleryMatchIds={galleryMatchIds.length > 0 ? galleryMatchIds : undefined}
    />
  );
}
