'use client';

import { Camera } from '@/components/Icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';

interface ReceivingPhoto {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  createdAt?: string;
  /** Shutter clock from `/api/receiving-photos` — surfaced in the viewer panel. */
  clientCapturedAt?: string | null;
}

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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const queryKey = ['receiving-photos', receivingId] as const;
  const {
    data: photos,
    isFetching,
    isError: photosError,
  } = useQuery<ReceivingPhoto[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${receivingId}`);
      if (!res.ok) {
        // Read surfaces must not collapse a failed fetch into "no photos".
        if (readOnly) throw new Error(`Failed to load photos for receiving ${receivingId}`);
        return [];
      }
      const data = await res.json().catch(() => null);
      // Some routes return the array directly, others wrap it as `{ photos }`,
      // and stale cached entries may have been a different shape. Normalize
      // here so the consumer never has to type-check `photos.map`.
      if (Array.isArray(data)) return data as ReceivingPhoto[];
      if (data && Array.isArray((data as { photos?: unknown }).photos)) {
        return (data as { photos: ReceivingPhoto[] }).photos;
      }
      return [];
    },
    // 30s poll is the pickup path for photos uploaded elsewhere (e.g. mobile
    // packer). React Query pauses this while the tab is hidden by default.
    refetchInterval: readOnly ? false : 30_000,
    staleTime: 20_000,
  });

  useReceivingPhotosRealtimeRefresh(
    Number(receivingId),
    staffId,
    () => queryClient.invalidateQueries({ queryKey }),
    !readOnly && staffId > 0,
  );

  // Defensive — `photos` should always be an array per the queryFn, but a
  // stale React Query cache entry from an older shape could be non-array
  // here. Guard against the crash; the queryFn will replace the cache on
  // its next run.
  const photosArr: ReceivingPhoto[] = Array.isArray(photos) ? photos : [];
  const galleryPhotos = photosArr
    .filter((p) => !!p.photoUrl)
    .map((p) =>
      readOnly
        ? // URL-only — omit numeric ids so delete/upload stay off the look-up surface.
          { url: p.photoUrl }
        : receivingPhotoToGalleryInput(p, { poRef }),
    );
  const loadingEmpty = isFetching && galleryPhotos.length === 0;

  return (
    <div className="space-y-3">
      {hideHeader ? null : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Camera className="h-4 w-4 text-text-muted" aria-hidden />
            <h3 className="text-role-caption font-semibold uppercase tracking-widest text-text-default">
              {sectionTitle}
            </h3>
          </div>
        </div>
      )}

      {photosError ? (
        <p className="text-role-caption text-text-danger">Photos unavailable</p>
      ) : loadingEmpty ? (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border-hairline bg-surface-canvas p-2">
          <div className="h-16 rounded-lg bg-surface-sunken" aria-hidden />
          <div className="h-16 rounded-lg bg-surface-sunken" aria-hidden />
          <div className="h-16 rounded-lg bg-surface-sunken" aria-hidden />
          <span className="sr-only">Loading photos</span>
        </div>
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
                onPhotoDeleted: () => queryClient.invalidateQueries({ queryKey }),
                onPhotoReassigned: () => queryClient.invalidateQueries({ queryKey }),
                onPhotoUploaded: () => queryClient.invalidateQueries({ queryKey }),
              })}
        />
      )}
    </div>
  );
}
