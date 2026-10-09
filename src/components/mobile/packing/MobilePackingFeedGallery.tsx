'use client';

import { useCallback, useMemo } from 'react';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { usePackerPhotosRealtimeRefresh } from '@/hooks/usePackerPhotosRealtimeRefresh';
import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';

/**
 * Fullscreen swipe gallery on the Packing photo feed — the packing mirror of
 * `MobileReceivingFeedGallery`: it stays on `/m/packing`, opens once the
 * pack's photos have loaded, and a delete refreshes the feed's count.
 */
export function MobilePackingFeedGallery({
  packerLogId,
  onClose,
  onChanged,
}: {
  packerLogId: number | null;
  onClose: () => void;
  /** The feed's own refetch — a deleted photo changes the row's count. */
  onChanged: () => void;
}) {
  const open = packerLogId != null && packerLogId > 0;
  const { query, deletePrior } = useScopedPackerPhotos(packerLogId ?? 0, { enabled: open });

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);
  usePackerPhotosRealtimeRefresh(packerLogId, refresh, open);

  const slides = useMemo<SwipePhotoSlide[]>(
    () =>
      (query.data?.photos ?? [])
        .filter((photo) => !!photo.photoUrl?.trim())
        .map((photo) => ({ id: String(photo.id), previewUrl: photo.photoUrl, deletable: true })),
    [query.data?.photos],
  );

  const handleDelete = useCallback(
    async (slide: SwipePhotoSlide) => {
      const photoId = Number(slide.id);
      if (!Number.isFinite(photoId)) return;
      if (await deletePrior(photoId)) onChanged();
    },
    [deletePrior, onChanged],
  );

  if (!open) return null;

  return (
    <MobileSwipePhotoViewer
      presentation="sheet"
      open={!query.isLoading}
      initialIndex={Math.max(0, slides.length - 1)}
      slides={slides}
      onClose={onClose}
      onDelete={handleDelete}
    />
  );
}
