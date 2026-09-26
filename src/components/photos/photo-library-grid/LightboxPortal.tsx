'use client';

import { useEffect, useRef } from 'react';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';

/** Mounts the shared fullscreen viewer for a set of photos, opens it at `startIndex` on mount, and calls `onClose` (to unmount) once the… */
export function LightboxPortal({
  photos,
  startIndex = 0,
  onClose,
  onPhotoDeleted,
}: {
  photos: PhotoGalleryInput[];
  startIndex?: number;
  onClose: () => void;
  onPhotoDeleted?: (photoId: number) => void;
}) {
  // {id,url,meta} (not bare urls) so the viewer's delete + info panel show.
  const gallery = usePhotoGallery({ photos, onPhotoDeleted });
  const { openViewer } = gallery;

  // Open exactly once. `openViewer`'s identity changes every render (its deps
  // include the per-render useImageZoom object), so an unguarded effect would
  // re-open the viewer immediately after the user closes it.
  const requestedRef = useRef(false);
  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    openViewer(startIndex);
  }, [openViewer, startIndex]);

  return <PhotoViewerPortal g={gallery} onDismissed={onClose} />;
}
