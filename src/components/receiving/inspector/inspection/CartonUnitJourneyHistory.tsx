'use client';

/**
 * Carton search/read History — unit journeys only (no Units|Tracking slider).
 *
 * Distinct from the shared {@link WorkspaceTimelineTab} used on Unbox / Testing /
 * Shipping. Journey thumbs open the full carton receiving-photo set
 * (`GET /api/receiving-photos?receivingId=`), not the capped stage preview.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { StationUnitJourneys } from '@/components/station/workbench/StationUnitJourneys';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { useCartonSerials } from '@/hooks/useCartonSerials';

interface ReceivingPhotoRow {
  id: number;
  photoUrl: string;
}

function normalizeReceivingPhotos(data: unknown): ReceivingPhotoRow[] {
  const rows = Array.isArray(data)
    ? data
    : data && Array.isArray((data as { photos?: unknown }).photos)
      ? (data as { photos: unknown[] }).photos
      : [];
  return rows
    .map((raw) => {
      const r = raw as Partial<ReceivingPhotoRow>;
      const id = typeof r.id === 'number' && Number.isFinite(r.id) ? r.id : null;
      const photoUrl = typeof r.photoUrl === 'string' ? r.photoUrl.trim() : '';
      if (id == null || !photoUrl) return null;
      return { id, photoUrl };
    })
    .filter((r): r is ReceivingPhotoRow => r != null);
}

export function CartonUnitJourneyHistory({
  receivingId,
}: {
  receivingId: number | string;
}) {
  const serialQuery = useCartonSerials(receivingId);
  const serials = serialQuery.serials;

  const photosQuery = useQuery({
    queryKey: ['receiving-photos', String(receivingId)] as const,
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${receivingId}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalizeReceivingPhotos(await res.json().catch(() => null));
    },
    staleTime: 20_000,
  });

  const { galleryPhotos, galleryMatchIds } = useMemo(() => {
    const rows = photosQuery.data ?? [];
    // URL-only inputs — delete/upload stay off the carton read surface.
    const galleryPhotos: PhotoGalleryInput[] = rows.map((p) => ({ url: p.photoUrl }));
    const galleryMatchIds = rows.map((p) => p.id);
    return { galleryPhotos, galleryMatchIds };
  }, [photosQuery.data]);

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
