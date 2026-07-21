'use client';

/**
 * Compact carton-photos control for the condensed CartonContextCard row.
 *
 * One pill: camera + (×N when photos exist) + "+". Click sends a capture
 * request to the paired phone. When photos exist, hovering the pill reveals
 * the read/delete gallery toolbar — the wrapper owns hover (with a short leave
 * delay) so the cursor can cross the gap to the popover without it collapsing.
 *
 * Upload opens {@link PhotoUploadOverlay} (RightPaneOverlay SoT, same shell as
 * ReceivingClaimModal) with drag-drop + device picker. The gallery stays pinned
 * while that overlay is open so the upload controller is not unmounted mid-pick.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAblyClient } from '@/contexts/AblyContext';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { PhotoUploadOverlay } from '@/components/shipped/photo-gallery/PhotoUploadOverlay';
import { receivingPhotosQueryKey, refreshReceivingPhotos } from '@/lib/queries/receiving-queries';
import { Camera, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { publishReceivingPhotoRequest } from '@/lib/realtime/receiving-photo-request';
import { toast } from '@/lib/toast';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { STATION_CONTEXT_PHOTO_PILL_CLASS } from './station-context-action-pill';

interface PhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
}

interface PhotosPayload {
  photos: PhotoRow[];
  receivingCreatedAt?: string | null;
  initialNasFolder?: string | null;
}

const HOVER_LEAVE_MS = 140;

export const ReceivingPhotoButton = memo(function ReceivingPhotoButton({
  receivingId,
  staffId,
  poRef,
  onSendToTicket,
}: {
  receivingId: number;
  staffId: number;
  /** Carton PO#/order ref — stamped onto each photo's meta so the viewer's
   *  details panel shows the linked PO (parity with ReceivingPhotoPeek). */
  poRef?: string | null;
  /** Opens SendPhotoNoteModal — ticket icon in the photo dropdown toolbar. */
  onSendToTicket?: () => void;
}) {
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();
  const queryKey = receivingPhotosQueryKey(receivingId);

  const { data } = useQuery<PhotosPayload>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${receivingId}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: 10_000,
  });

  const refresh = useCallback(
    (deletedPhotoId?: number) => {
      refreshReceivingPhotos(queryClient, receivingId, deletedPhotoId);
    },
    [queryClient, receivingId],
  );

  useReceivingPhotosRealtimeRefresh(receivingId, staffId, refresh, staffId > 0 && !!orgId);

  const handleRequestOnPhone = useCallback(async () => {
    try {
      const client = await getClient();
      await publishReceivingPhotoRequest(client, orgId, staffId, receivingId);
      toast.success('Sent to phone');
    } catch (err) {
      console.warn('receiving-photo-button: photo request publish failed', err);
      toast.error('Could not send to phone');
    }
  }, [getClient, orgId, receivingId, staffId]);

  const photos = useMemo(
    () =>
      (data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => receivingPhotoToGalleryInput(p, { poRef: poRef ?? null })),
    [data, poRef],
  );

  const count = photos.length;
  const hasGallery = count > 0;
  const [galleryHover, setGalleryHover] = useState(false);
  /** Pin while gallery-owned upload overlay is open (avoids unmount mid-pick). */
  const [galleryUploadPinned, setGalleryUploadPinned] = useState(false);
  /** Pin while Move photos modal is open (same hover-host unmount hazard). */
  const [galleryMovePinned, setGalleryMovePinned] = useState(false);
  /** Empty-carton desktop upload — same RightPaneOverlay shell, owned here. */
  const [emptyUploadOpen, setEmptyUploadOpen] = useState(false);
  const [emptyUploading, setEmptyUploading] = useState(false);
  const [emptyUploadError, setEmptyUploadError] = useState<string | null>(null);
  const [phoneSending, setPhoneSending] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const showGalleryPeek = hasGallery && (galleryHover || galleryUploadPinned || galleryMovePinned);

  const openGallery = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (count > 0) setGalleryHover(true);
  }, [count]);

  const scheduleCloseGallery = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setGalleryHover(false), HOVER_LEAVE_MS);
  }, []);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const handleEmptyUploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0 || emptyUploading) return;
      setEmptyUploading(true);
      setEmptyUploadError(null);
      try {
        for (const file of images) {
          await uploadPhotoClient({
            file,
            entityType: 'RECEIVING',
            entityId: receivingId,
            photoType: 'receiving_item',
            poRef: poRef ?? `RCV-${receivingId}`,
          });
        }
        refresh();
        const n = images.length;
        toast.success(n === 1 ? '1 photo uploaded' : `${n} photos uploaded`);
        setEmptyUploadOpen(false);
        setEmptyUploadError(null);
      } catch (err) {
        console.error('receiving-photo-button: upload failed', err);
        setEmptyUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setEmptyUploading(false);
      }
    },
    [emptyUploading, receivingId, poRef, refresh],
  );

  const handleEmptySendToPhone = useCallback(async () => {
    setPhoneSending(true);
    try {
      await handleRequestOnPhone();
    } finally {
      setPhoneSending(false);
    }
  }, [handleRequestOnPhone]);

  // One consistent resting state across every PO — a calm blue-tinted pill.
  // Radius shared with Claim via {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
  const btnClass = STATION_CONTEXT_PHOTO_PILL_CLASS;

  const title = hasGallery
    ? `${count} photo${count === 1 ? '' : 's'} · send to phone`
    : 'Add photos';

  const ariaLabel = hasGallery
    ? `${count} carton photo${count === 1 ? '' : 's'}; send to phone or hover for gallery`
    : 'Add carton photos — upload from device or send to phone';

  const handlePillClick = useCallback(() => {
    if (hasGallery) {
      void handleRequestOnPhone();
      return;
    }
    // No photos yet — open the desktop upload popover (drag-drop + device + phone).
    setEmptyUploadError(null);
    setEmptyUploadOpen(true);
  }, [hasGallery, handleRequestOnPhone]);

  const pillButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handlePillClick}
      ariaLabel={ariaLabel}
      aria-expanded={hasGallery ? galleryHover || galleryUploadPinned || galleryMovePinned : emptyUploadOpen}
      icon={<Camera className="h-4 w-4" />}
      iconRight={<Plus className="h-3 w-3" />}
      className={btnClass}
    >
      {count > 0 ? <>{count}</> : null}
    </Button>
  );

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={hasGallery ? openGallery : undefined}
      onMouseLeave={hasGallery ? scheduleCloseGallery : undefined}
      onFocusCapture={hasGallery ? openGallery : undefined}
      onBlurCapture={
        hasGallery
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleCloseGallery();
            }
          : undefined
      }
    >
      {/* Suppress pill tooltip while peek is open — avoids tooltip + toolbar stacking. */}
      {showGalleryPeek ? (
        pillButton
      ) : (
        <HoverTooltip label={title} placement="above" asChild>
          {pillButton}
        </HoverTooltip>
      )}

      {showGalleryPeek ? (
        // `pt-1.5` bridges the gap so the pointer stays inside the hover target
        // while moving from the pill to the gallery card.
        <div className="absolute right-0 top-full z-30 pt-1.5">
          <div className="w-fit max-w-[80vw] rounded-xl border border-blue-200 bg-surface-card p-0.5 shadow-xl">
            <PhotoGallery
              photos={photos}
              orderId={`RCV-${receivingId}`}
              receivingId={receivingId}
              allowReassign
              launcherLayout="toolbar"
              toolbarShowLabel={false}
              compact
              libraryHref={`/ops/photos?receivingId=${receivingId}`}
              onPhotoDeleted={(photoId) => refresh(photoId)}
              // Reassign/upload are NOT deletes — passing the photo id as
              // `deletedPhotoId` filtered the just-added photo straight back OUT
              // of the gallery cache (only the trailing refetch hid the bug).
              // Refresh with no id so the cache reconciles to include it.
              onPhotoReassigned={() => refresh()}
              onPhotoUploaded={() => refresh()}
              onUploadOverlayOpenChange={setGalleryUploadPinned}
              onMovePhotosOpenChange={setGalleryMovePinned}
              onSendToTicket={onSendToTicket}
            />
          </div>
        </div>
      ) : null}

      <PhotoUploadOverlay
        open={emptyUploadOpen}
        onClose={() => {
          if (emptyUploading) return;
          setEmptyUploadOpen(false);
          setEmptyUploadError(null);
        }}
        onFiles={handleEmptyUploadFiles}
        uploading={emptyUploading}
        uploadError={emptyUploadError}
        onClearError={() => setEmptyUploadError(null)}
        title="Upload carton photos"
        subtitle="Drop images here, choose files from this device, or send a capture request to your phone."
        secondaryAction={{
          label: 'Send to phone',
          onClick: () => void handleEmptySendToPhone(),
          loading: phoneSending,
          disabled: !orgId || staffId <= 0,
        }}
      />
    </div>
  );
});

export default ReceivingPhotoButton;
