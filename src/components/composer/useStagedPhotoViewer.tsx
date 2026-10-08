'use client';

/**
 * Full-screen viewing for the photos staged on a composer (the strip above the
 * Cc row): a press on a thumbnail opens the shared viewer at that photo.
 * Read-only — removing a staged photo stays the strip's hover ×.
 */

import { useMemo, type ReactNode } from 'react';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import type { StagedPhoto } from '@/hooks/useTicketPhotoStaging';

export function useStagedPhotoViewer(staged: readonly StagedPhoto[]): {
  open: (index: number) => void;
  viewer: ReactNode;
} {
  const photos = useMemo(
    () =>
      staged.map((s) => ({
        url: s.url ?? s.previewUrl,
        thumbUrl: s.thumbUrl ?? s.previewUrl,
      })),
    [staged],
  );
  const gallery = usePhotoGallery({ photos });
  return {
    open: gallery.openViewer,
    viewer: gallery.photoItems.length > 0 ? <PhotoViewerPortal g={gallery} /> : null,
  };
}
