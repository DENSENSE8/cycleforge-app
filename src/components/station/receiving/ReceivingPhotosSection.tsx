'use client';

import { useMemo } from 'react';
import { Camera } from '@/components/Icons';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import {
  receivingPhotoMeta,
  receivingPhotoToGalleryInput,
} from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { useReceivingPhotos } from '@/hooks/useReceivingPhotos';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

interface ReceivingPhotosSectionProps {
  receivingId: string;
  /** Carton PO#/order ref — stamped onto each photo's meta so the viewer's
   *  details panel resolves the linked PO. Pass null when genuinely unknown. */
  poRef?: string | null;
  /** Passed to PhotoGallery downloads as `orderId` filename stem. */
  downloadLabel?: string;
  /** Section heading (shipping panel uses “Packing Photos”). */
  sectionTitle?: string;
  /** Primary line on the same launcher affordance shipped uses for packing. */
  launcherTitle?: string;
  /** Look-up / carton-read: view only — no upload, delete, or PO reassign. */
  readOnly?: boolean;
  /** Omit the Camera + sectionTitle row (launcher card carries the label). */
  hideHeader?: boolean;
}

export function ReceivingPhotosSection({
  receivingId,
  poRef = null,
  downloadLabel,
  sectionTitle = 'Receiving photos',
  launcherTitle = 'View Receiving Photos',
  readOnly = false,
  hideHeader = false,
}: ReceivingPhotosSectionProps) {
  // Shared carton query — same cache entry as the camera badge and the progress
  // stepper's stage counts. It used to key on the STRING id, which made it a
  // second entry for the same rows that no delete-patch could reach.
  const { photos, isFetching, isError, invalidate } = useReceivingPhotos(receivingId, {
    readOnly,
  });

  const galleryPhotos = useMemo(
    () =>
      photos.map((p) =>
        readOnly
          ? // No numeric `id` — that is what keeps delete off the look-up surface
            // (`usePhotoGallery.canDeleteCurrent`). `meta` arms nothing: upload is
            // gated on the `receivingId` PROP, which the read branch omits.
            { url: p.photoUrl, meta: receivingPhotoMeta(p, { poRef }) }
          : receivingPhotoToGalleryInput(
              { ...p, createdAt: p.createdAt ?? null },
              { poRef },
            ),
      ),
    [photos, readOnly, poRef],
  );

  // A read surface must never render a fetch failure as "no photos" — that is an
  // outage reading as "no evidence exists". The bench keeps its quieter
  // degrade-to-empty, since capture is still live behind it.
  const showError = readOnly && isError;
  const loadingEmpty = isFetching && galleryPhotos.length === 0 && !isError;

  return (
    <div className="space-y-3">
      {hideHeader ? null : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Camera className="h-4 w-4 text-text-muted" aria-hidden />
            <h3 className="text-role-caption font-semibold text-text-default">
              {sectionTitle}
            </h3>
          </div>
        </div>
      )}

      {showError ? (
        <p className="text-role-caption text-text-danger">Photos unavailable</p>
      ) : loadingEmpty ? (
        <UniversalLoader isLoading label="Loading photos" className="min-h-20" />
      ) : (
        <PhotoGallery
          photos={galleryPhotos}
          orderId={downloadLabel ?? `recv-${receivingId}`}
          launcherTitle={readOnly ? (launcherTitle === 'View Receiving Photos' ? 'Photos' : launcherTitle) : launcherTitle}
          {...(readOnly
            ? { launcherTone: 'neutral' as const }
            : {
                receivingId: Number(receivingId),
                allowReassign: true,
                onPhotoDeleted: invalidate,
                onPhotoReassigned: invalidate,
                onPhotoUploaded: invalidate,
              })}
        />
      )}
    </div>
  );
}
