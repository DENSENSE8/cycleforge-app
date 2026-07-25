'use client';

/**
 * Compact carton-photos control for the condensed CartonContextCard row.
 *
 * One pill: camera pinned left + (count when photos exist, else "+") pinned
 * right. Click always sends a capture request to the paired phone. Hover
 * always reveals the gallery action strip (upload / library / …) — including
 * when the carton has no photos yet (empty → Upload photos). Count and "+"
 * never share the face — when a count is shown the plus is omitted. Width is
 * locked (`justify-between`) so digit growth does not shift the identity row.
 * The wrapper owns hover (with a short leave delay) so the cursor can cross
 * the gap to the popover without it collapsing.
 *
 * While a gallery-owned upload/move overlay is open, the peek stays pinned so
 * the upload controller is not unmounted mid-pick.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAblyClient } from '@/contexts/AblyContext';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { receivingPhotosQueryKey, refreshReceivingPhotos } from '@/lib/queries/receiving-queries';
import { Camera, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { publishReceivingPhotoRequest } from '@/lib/realtime/receiving-photo-request';
import { toast } from '@/lib/toast';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { buildUnboxingCartonLibraryHref } from '@/components/shipped/photo-gallery/photo-context-provenance';
import { STATION_CONTEXT_PHOTO_PILL_CLASS } from '@/components/station/entity-context/station-context-action-pill';

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

  const [phoneSending, setPhoneSending] = useState(false);

  const handleRequestOnPhone = useCallback(async () => {
    if (!orgId || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    setPhoneSending(true);
    try {
      const client = await getClient();
      await publishReceivingPhotoRequest(client, orgId, staffId, receivingId);
      toast.success('Sent to phone');
    } catch (err) {
      console.warn('receiving-photo-button: photo request publish failed', err);
      toast.error('Could not send to phone');
    } finally {
      setPhoneSending(false);
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
  const cartonLibraryHref = buildUnboxingCartonLibraryHref({
    receivingId,
    poRef: poRef ?? null,
  });
  const [galleryHover, setGalleryHover] = useState(false);
  /** Pin while gallery-owned upload overlay is open (avoids unmount mid-pick). */
  const [galleryUploadPinned, setGalleryUploadPinned] = useState(false);
  /** Pin while Move photos modal is open (same hover-host unmount hazard). */
  const [galleryMovePinned, setGalleryMovePinned] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  // Hover peek is available with or without photos — empty cartons still get
  // the gallery action strip (Upload photos) so operators can pick device upload
  // without using the pill click (pill click = send-to-phone only).
  const showGalleryPeek = galleryHover || galleryUploadPinned || galleryMovePinned;

  const openGallery = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setGalleryHover(true);
  }, []);

  const scheduleCloseGallery = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setGalleryHover(false), HOVER_LEAVE_MS);
  }, []);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // One consistent resting state across every PO — a calm blue-tinted pill.
  // Radius shared with Claim via {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
  const btnClass = STATION_CONTEXT_PHOTO_PILL_CLASS;

  const title = hasGallery
    ? `${count} photo${count === 1 ? '' : 's'} · send to phone`
    : 'Send to phone · hover for upload';

  const ariaLabel = hasGallery
    ? `${count} carton photo${count === 1 ? '' : 's'}; send to phone or hover for gallery`
    : 'Send capture request to phone; hover for upload options';

  const handlePillClick = useCallback(() => {
    void handleRequestOnPhone();
  }, [handleRequestOnPhone]);

  const pillButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handlePillClick}
      disabled={phoneSending}
      ariaLabel={ariaLabel}
      aria-expanded={showGalleryPeek}
      icon={<Camera className="h-4 w-4" />}
      // Right face: count when photos exist (children), else "+". Camera stays
      // left via justify-between on the locked photo-pill width. Count is not
      // iconRight — Button's icon box would crush multi-digit tabular nums.
      iconRight={hasGallery ? undefined : <Plus className="h-3 w-3" />}
      className={btnClass}
    >
      {hasGallery ? count : null}
    </Button>
  );

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={openGallery}
      onMouseLeave={scheduleCloseGallery}
      onFocusCapture={openGallery}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleCloseGallery();
      }}
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
              libraryHref={cartonLibraryHref}
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
    </div>
  );
});

export default ReceivingPhotoButton;
