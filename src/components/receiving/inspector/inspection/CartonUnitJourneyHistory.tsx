'use client';

/**
 * Carton search/read History — unit journeys only (no Units|Tracking slider).
 *
 * Distinct from the shared {@link WorkspaceTimelineTab} used on Unbox / Testing /
 * Shipping. Journey thumbs open the full carton receiving-photo set
 * (`GET /api/receiving-photos?receivingId=`), not the capped stage preview.
 */

import { useMemo } from 'react';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
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
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-role-caption font-medium text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading serials…
      </div>
    );
  }
  if (serialQuery.isError) {
    return (
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-semibold text-rose-600">
        Could not load this carton&rsquo;s serials.
        <Button
          variant="ghost"
          onClick={() => serialQuery.refetch()}
          className="ml-2 inline h-auto p-0 align-baseline text-rose-600 underline decoration-dotted hover:bg-transparent hover:text-rose-700"
        >
          Retry
        </Button>
      </div>
    );
  }
  if (serials.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center text-role-caption font-medium text-text-soft">
        No serialized units on this receiving yet.
      </div>
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
