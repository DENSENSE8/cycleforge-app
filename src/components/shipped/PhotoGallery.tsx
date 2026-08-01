'use client';

import { useMemo, useCallback } from 'react';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { Image as ImageIcon, Upload } from '../Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { usePhotoGallery, type PhotoGalleryProps } from './photo-gallery/usePhotoGallery';
import { PhotoLauncher } from './photo-gallery/PhotoLauncher';
import { PhotoViewerPortal } from './photo-gallery/PhotoViewerPortal';
import { PhotoUploadOverlay } from './photo-gallery/PhotoUploadOverlay';
import { MovePhotosBetweenPoRail } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoRail';

export type { PhotoGalleryInput } from './photo-gallery/photo-gallery-utils';

/**
 * Photo gallery: a launcher surface (thumbnail strip / slim toolbar / button)
 * plus a portaled fullscreen viewer with zoom, download, PO photo moves, and a
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
    async (_slide: SwipePhotoSlide, index: number) => {
      g.setCurrentIndex(index);
      await g.deletePhotoDirect();
    },
    [g],
  );

  const movePhotosModal =
    !props.onOpenMovePhotosExternal && g.canReassignCurrent && g.receivingId != null ? (
      <MovePhotosBetweenPoRail
        key={g.movePhotosKey}
        open={g.movePhotosOpen}
        receivingId={g.receivingId}
        onClose={g.closeMovePhotos}
        onMoved={() => g.onPhotoReassigned?.(0)}
      />
    ) : null;

  const uploadOverlay = g.canUpload ? (
    <PhotoUploadOverlay
      open={g.uploadOverlayOpen}
      onClose={g.closeUploadOverlay}
      onFiles={g.handleUploadFiles}
      uploading={g.uploading}
      uploadError={g.uploadError}
      onClearError={g.clearUploadError}
    />
  ) : null;

  // Toolbar layout keeps the action strip even with zero photos (upload /
  // library / send-to-ticket stay available; view/download/move disable).
  // Other layouts keep the legacy empty card / Upload button.
  if (g.photoItems.length === 0 && g.launcherLayout !== 'toolbar') {
    if (!g.canUpload) {
      return (
        <div
          className={cn(
            'w-full rounded-xl border border-border-soft px-4 py-3',
            g.launcherTone === 'neutral' ? 'bg-surface-card' : 'bg-surface-canvas',
            g.className,
          )}
        >
          <div className="flex items-center justify-center gap-2 text-text-soft">
            <ImageIcon className="h-4 w-4" />
            <span className="text-xs font-semibold">No photos available</span>
          </div>
        </div>
      );
    }

    return (
      <>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Upload className="h-4 w-4" />}
          onClick={g.openUploadOverlay}
          disabled={g.uploading}
          loading={g.uploading}
          className={g.className}
          ariaLabel="Upload photos"
        >
          Upload photos
        </Button>
        {uploadOverlay}
      </>
    );
  }

  return (
    <>
      <PhotoLauncher g={g} />
      {uploadOverlay}
      {movePhotosModal}

      {g.photoItems.length > 0 ? (
        isMobile ? (
          <MobileSwipePhotoViewer
            open={g.viewerOpen}
            initialIndex={g.currentIndex}
            slides={swipeSlides}
            onClose={g.closeViewer}
            onDelete={handleDelete}
          />
        ) : (
          <PhotoViewerPortal g={g} />
        )
      ) : null}
    </>
  );
}
