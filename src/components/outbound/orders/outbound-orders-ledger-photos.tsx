'use client';

/**
 * Desk record photo lane → every photo of this item # + SKU
 * ({@link fetchLinePhotos}), in Unbox's own viewer: `usePhotoGallery` +
 * `PhotoViewerPortal` (`PhotosActionsToolRuntime`, `PhotoPeekFan`). Fetched
 * on press, never on paint. The phone record reads the same fetcher into
 * `MobileSwipePhotoViewer`.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import {
  fetchLinePhotos,
  linePhotoLabel,
  linePhotosQueryKey,
  type LinePhotoSubject,
} from '@/lib/photos/line-photos';
import { toast } from '@/lib/toast';

/**
 * Mount while open. Loads the set, opens the viewer on the first photo, and
 * calls `onClose` when the viewer is dismissed (or when there is nothing to
 * show — said in a toast, not a blank lightbox).
 */
export function LedgerPhotoViewer({
  subject,
  onClose,
}: {
  subject: LinePhotoSubject;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: linePhotosQueryKey(subject),
    queryFn: () => fetchLinePhotos(subject),
    staleTime: 60_000,
  });
  const photos = query.data;
  const label = linePhotoLabel(subject.itemNumber, subject.sku);

  useEffect(() => {
    if (query.isError) {
      toast.error(`Could not load photos for ${label}`);
      onClose();
    } else if (photos && photos.length === 0) {
      toast.info(`No photos for ${label}`);
      onClose();
    }
  }, [query.isError, photos, label, onClose]);

  const inputs = useMemo<PhotoGalleryInput[]>(
    () =>
      (photos ?? []).map((p) => ({
        ...(p.id != null ? { id: p.id } : {}),
        url: p.url,
        ...(p.thumbUrl ? { thumbUrl: p.thumbUrl } : {}),
        ...(p.caption ? { meta: { caption: p.caption } } : {}),
      })),
    [photos],
  );

  if (inputs.length === 0) return null;
  return <LoadedViewer photos={inputs} onClose={onClose} />;
}

function LoadedViewer({ photos, onClose }: { photos: PhotoGalleryInput[]; onClose: () => void }) {
  const gallery = usePhotoGallery({ photos });
  const { openViewer } = gallery;
  // Open exactly once: `openViewer` changes identity every render.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    openViewer(0);
  }, [openViewer]);
  return <PhotoViewerPortal g={gallery} onDismissed={onClose} />;
}
