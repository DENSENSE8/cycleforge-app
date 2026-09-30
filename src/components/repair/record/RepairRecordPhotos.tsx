'use client';

/**
 * The repair record's photos, top of its right column (owner 2026-09-30): a
 * repair is still in the store, so both kinds are viewable AND addable from the
 * desk — Receiving (the device as it came in) and Shipping (as it leaves / is
 * packed back). One read (`GET /api/repair-service/[id]/photos`, the key the
 * phone's `/m/rs/[id]` photos screen shares) split by {@link repairPhotoKind};
 * each door uploads to entity `REPAIR_SERVICE` stamped with its kind's type.
 */

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RecordPhotosDoor } from '@/components/photos/RecordPhotosDoor';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import {
  REPAIR_PHOTO_KIND_TYPE,
  repairPhotoKind,
  type RepairPhotoKind,
  type RepairPhotosResponse,
} from '@/lib/repair/repair-photos';
import { qk } from '@/queries/keys';

const KIND_COPY: Record<RepairPhotoKind, { label: string; noun: string }> = {
  receiving: { label: 'Receiving photos', noun: 'receiving' },
  shipping: { label: 'Shipping photos', noun: 'shipping' },
};

export function RepairRecordPhotos({ repairId }: { repairId: number }) {
  const queryClient = useQueryClient();
  // Stable per repair, so the gallery's upload callback and the paste listener
  // are not rebuilt on every render.
  const uploads = useMemo(() => {
    const onUploaded = () => void queryClient.invalidateQueries({ queryKey: qk.repairs.workbench(repairId, 'photos') });
    const upload = (kind: RepairPhotoKind) => ({
      target: { entityType: 'REPAIR_SERVICE' as const, entityId: repairId, photoType: REPAIR_PHOTO_KIND_TYPE[kind] },
      onUploaded,
    });
    return { receiving: upload('receiving'), shipping: upload('shipping') };
  }, [queryClient, repairId]);
  const query = useQuery({
    queryKey: qk.repairs.workbench(repairId, 'photos'),
    queryFn: async ({ signal }): Promise<RepairPhotosResponse> => {
      const res = await fetch(`/api/repair-service/${repairId}/photos`, { signal });
      if (!res.ok) throw new Error(`photos ${res.status}`);
      const data = (await res.json()) as Partial<RepairPhotosResponse>;
      return { photos: data.photos ?? [], videos: data.videos ?? [] };
    },
  });

  const byKind = useMemo(() => {
    const split: Record<RepairPhotoKind, PhotoGalleryInput[]> = { receiving: [], shipping: [] };
    for (const photo of query.data?.photos ?? []) {
      split[repairPhotoKind(photo.photoType)].push({
        url: photo.url,
        thumbUrl: photo.thumbUrl,
        meta: { photoType: photo.photoType, createdAt: photo.createdAt },
      });
    }
    return split;
  }, [query.data]);

  return (
    <div className="flex flex-col gap-2" data-testid="repair-record-photos">
      {(['receiving', 'shipping'] as const).map((kind) => (
        <RecordPhotosDoor
          key={kind}
          photos={byKind[kind]}
          fetching={query.isFetching}
          error={query.isError}
          galleryId={`repair-${repairId}-${kind}`}
          noun={KIND_COPY[kind].noun}
          label={KIND_COPY[kind].label}
          upload={uploads[kind]}
          testId={`repair-record-photos-${kind}`}
        />
      ))}
    </div>
  );
}
