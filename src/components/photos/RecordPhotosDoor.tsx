'use client';

/**
 * A record's EVIDENCE photos door, top of the right column (owner 2026-09-29):
 * what the floor shot on this record in the shared fullscreen viewer
 * (`PhotoViewerPortal`). Always present so the door is learnt: with none yet it
 * reads "No photos yet" and stays disabled. The host owns the read (the
 * carton's photos, the repair's photos). With `upload` the door also ADDS
 * (owner 2026-09-30, repair receiving / shipping): an Add button opens the
 * house {@link PhotoUploadOverlay} (pick · drop · paste), and files dropped or
 * pasted on the door itself upload straight to the same target.
 */

import { Camera, ImagePlus } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { PhotoUploadOverlay } from '@/components/shipped/photo-gallery/PhotoUploadOverlay';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { usePhotoGallery, type PhotoUploadTarget } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { cn } from '@/utils/_cn';

export function RecordPhotosDoor({
  photos,
  fetching,
  error,
  galleryId,
  noun,
  label = 'Photos',
  upload,
  testId,
}: {
  /** No numeric `id` on these — that is what keeps delete off a read surface. */
  photos: PhotoGalleryInput[];
  fetching: boolean;
  error: boolean;
  /** The viewer's gallery key (`recv-812`, `repair-4894`). */
  galleryId: string | undefined;
  /** "receiving", "repair" — the accessible name's kind of photo. */
  noun: string;
  /** The door's face ("Photos · 3", "Receiving photos · 3"). */
  label?: string;
  /** Makes the door an add surface: where files go, and the host's refetch. */
  upload?: { target: PhotoUploadTarget; onUploaded: () => void };
  testId: string;
}) {
  const gallery = usePhotoGallery({
    photos,
    orderId: galleryId,
    uploadTarget: upload?.target,
    onPhotoUploaded: upload?.onUploaded,
  });
  // Paste lands anywhere while the add overlay is up; on the door itself it
  // lands through the row's own handler. Without `upload` the zone is inert.
  const dropzone = usePhotoDropzone(gallery.handleUploadFiles, {
    paste: Boolean(upload),
    documentPaste: Boolean(upload) && gallery.uploadOverlayOpen,
  });
  const count = photos.length;
  const face = error
    ? `${label} unavailable`
    : fetching && count === 0
      ? label
      : count > 0
        ? `${label} · ${count}`
        : `No ${label.toLowerCase()} yet`;

  const door = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      icon={<Camera />}
      disabled={count === 0}
      ariaLabel={count > 0 ? `View ${count} ${noun} photo${count === 1 ? '' : 's'} full screen` : `No ${noun} photos yet`}
      onClick={() => gallery.openViewer(0)}
      className={cn('justify-center', upload ? 'min-w-0 flex-1' : 'w-full')}
      data-testid={testId}
    >
      {face}
    </Button>
  );
  const viewer = count > 0 ? <PhotoViewerPortal g={gallery} /> : null;
  if (!upload) {
    return (
      <>
        {door}
        {viewer}
      </>
    );
  }

  return (
    <>
      <div
        {...(gallery.uploadOverlayOpen ? {} : dropzone.rootProps)}
        className={cn('flex w-full items-stretch gap-2', dropzone.isDragging && 'outline-dashed outline-2 outline-offset-2 outline-blue-400')}
        data-testid={`${testId}-zone`}
      >
        {door}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<ImagePlus />}
          loading={gallery.uploading}
          disabled={gallery.uploading}
          ariaLabel={`Add ${noun} photos`}
          onClick={gallery.openUploadOverlay}
          data-testid={`${testId}-add`}
        >
          Add
        </Button>
      </div>
      <PhotoUploadOverlay
        open={gallery.uploadOverlayOpen}
        onClose={gallery.closeUploadOverlay}
        onFiles={gallery.handleUploadFiles}
        uploading={gallery.uploading}
        uploadError={gallery.uploadError}
        onClearError={gallery.clearUploadError}
        title={`Add ${noun} photos`}
        subtitle="Drop, paste, or choose images from this device."
      />
      {viewer}
    </>
  );
}
