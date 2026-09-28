'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { useScopedReceivingPhotos } from '@/hooks/useScopedReceivingPhotos';
import { useAuth } from '@/contexts/AuthContext';
import { notifyReceivingPhotoChanged } from '@/lib/queries/receiving-queries';

/**
 * Fullscreen swipe gallery mounted on the receiving feed — stays on `/m/receiving`
 * (no navigation to `/m/r/{id}/photos`). {@link MobileSwipePhotoViewer} owns the
 * layer: it opens once the photos have loaded, and dismisses itself (→ `onClose`)
 * when the carton has none.
 */
export function MobileReceivingFeedGallery({
  receivingId,
  staffId,
  open,
  onClose,
}: {
  receivingId: number | null;
  staffId: number;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;

  const scope = useMemo(
    () =>
      receivingId
        ? {
            receivingId,
            receivingLineId: null as number | null,
            photosListScope: 'all' as const,
          }
        : {
            receivingId: 0,
            receivingLineId: null as number | null,
            photosListScope: 'all' as const,
          },
    [receivingId],
  );

  const { photos, deletePhoto, queryKey, query } = useScopedReceivingPhotos(scope, {
    enabled: open && receivingId != null && receivingId > 0,
  });

  const refreshPhotos = useCallback(() => {
    void query.refetch();
  }, [query]);

  useReceivingPhotosRealtimeRefresh(
    receivingId ?? 0,
    staffId,
    refreshPhotos,
    open && staffId > 0 && !!orgId && receivingId != null && receivingId > 0,
  );

  const swipeSlides = useMemo<SwipePhotoSlide[]>(
    () =>
      photos.map((p) => ({
        id: String(p.id),
        previewUrl: p.displayUrl,
        uploadedBy: p.uploadedBy,
        deletable: true,
      })),
    [photos],
  );

  const handleDelete = useCallback(
    async (slide: SwipePhotoSlide) => {
      if (!receivingId) return;
      const photoId = Number(slide.id);
      if (!Number.isFinite(photoId)) return;
      const ok = await deletePhoto(photoId);
      if (!ok) return;
      notifyReceivingPhotoChanged(queryClient, {
        action: 'delete',
        receivingId,
        photoIds: [photoId],
      });
      void queryClient.invalidateQueries({ queryKey });
    },
    [deletePhoto, queryClient, queryKey, receivingId],
  );

  if (!open || !receivingId) return null;

  return (
    <MobileSwipePhotoViewer
      presentation="sheet"
      open={!query.isLoading}
      initialIndex={Math.max(0, swipeSlides.length - 1)}
      slides={swipeSlides}
      onClose={onClose}
      onDelete={handleDelete}
    />
  );
}
