'use client';

import { useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { Image as ImageIcon } from '../Icons';
import { usePhotoGallery, type PhotoGalleryProps } from './photo-gallery/usePhotoGallery';
import { PhotoLauncher } from './photo-gallery/PhotoLauncher';
import { PhotoViewerModal } from './photo-gallery/PhotoViewerModal';

export type { PhotoGalleryInput } from './photo-gallery/photo-gallery-utils';

/**
 * Photo gallery: a launcher surface (thumbnail strip / slim toolbar / button)
 * plus a portaled fullscreen viewer with zoom, download, PO reassignment, and a
 * two-step delete. Thin composition layer — state/logic live in
 * {@link usePhotoGallery} under `./photo-gallery/`.
 */
export function PhotoGallery(props: PhotoGalleryProps) {
  const g = usePhotoGallery(props);
  const { isMobile } = useUIModeOptional();

  const swipeSlides = useMemo<SwipePhotoSlide[]>(
    () =>
      g.photoItems.map((p, idx) => ({
        id: String(p.id ?? idx),
        previewUrl: p.url,
        deletable: typeof p.id === 'number' && Number.isFinite(p.id),
      })),
    [g.photoItems],
  );

  const handleDelete = useCallback(
    async (slide: SwipePhotoSlide, index: number) => {
      g.setCurrentIndex(index);
      await g.deletePhotoDirect();
    },
    [g],
  );

  if (g.photoItems.length === 0) {
    return (
      <div className={`w-full bg-surface-canvas border border-border-soft rounded-xl px-4 py-3 ${g.className}`}>
        <div className="flex items-center justify-center gap-2 text-text-soft">
          <ImageIcon className="h-4 w-4" />
          <span className="text-xs font-semibold">No photos available</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <PhotoLauncher g={g} />

      {isMobile ? (
        <MobileSwipePhotoViewer
          open={g.viewerOpen}
          initialIndex={g.currentIndex}
          slides={swipeSlides}
          onClose={g.closeViewer}
          onDelete={handleDelete}
        />
      ) : (
        g.mounted && typeof document !== 'undefined' && createPortal(
          // A stable `key` + default (sync) mode is required for AnimatePresence
          // to reliably run the scrim's exit and UNMOUNT it. A keyless child under
          // `mode="wait"` deadlocks when the parent re-renders mid-exit, leaving a
          // full-screen scrim mounted that blocks every click until a page reload
          // (see LightboxPortal, which fixed the same "ghost overlay" bug).
          <AnimatePresence>
            {g.viewerOpen ? <PhotoViewerModal key="photo-lightbox" g={g} /> : null}
          </AnimatePresence>,
          document.body,
        )
      )}
    </>
  );
}
