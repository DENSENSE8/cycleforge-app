'use client';

/** Compact receiving-photos control for station chrome. */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAblyClient } from '@/contexts/AblyContext';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import {
  fetchReceivingPhotoList,
  RECEIVING_PHOTOS_STALE_MS,
  receivingPhotoListQueryKey,
  refreshReceivingPhotos,
} from '@/lib/queries/receiving-queries';
import { Camera, Plus } from '@/components/Icons';
import { AnchoredLayer, Button, type AnchoredPlacement } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  getReceivingPhotoRequestChannelName,
  publishReceivingPhotoRequest,
} from '@/lib/realtime/receiving-photo-request';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { toast } from '@/lib/toast';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { buildUnboxingCartonLibraryHref } from '@/components/shipped/photo-gallery/photo-context-provenance';
import { STATION_CONTEXT_PHOTO_CHROME_CLASS, STATION_CONTEXT_PHOTO_FLUSH_CLASS, STATION_CONTEXT_PHOTO_PILL_CLASS } from '@/components/station/entity-context/station-context-action-pill';
import { STATION_CHROME_GLYPH_CLASS } from '@/components/station/entity-context/station-identity-chrome';
import {
  RECEIVING_PHOTO_LIST_INTENT_CARTON,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import {
  effectiveReceivingPhotoStage,
  receivingPhotoListIntentForScope,
  resolveReceivingPhotoTarget,
} from '@/lib/receiving/photo-scope';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';

interface PhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  /** Shutter clock from `/api/receiving-photos` — surfaced in the viewer panel. */
  clientCapturedAt?: string | null;
}

interface PhotosPayload {
  photos: PhotoRow[];
  receivingCreatedAt?: string | null;
  initialNasFolder?: string | null;
}

const HOVER_LEAVE_MS = 140;
/** Delay before the hover PhotoLauncher strip opens. */
const GALLERY_OPEN_DELAY_MS = 420;
/**
 * Gap between the pill and the portaled gallery.
 * floating off its button. Operator 2026-09-22: "it's the only one that has a
 */
const GALLERY_GAP_PX = 6;
const GALLERY_CHROME_GAP_PX = 0;

function galleryAnchoredPlacement(
  placement: 'below' | 'above' | 'right' | 'left',
): AnchoredPlacement {
  if (placement === 'above') return 'top-center';
  if (placement === 'right') return 'right-start';
  if (placement === 'left') return 'left-start';
  // Below opens CENTERED on the pill, not left-aligned to it:
  return 'bottom-center';
}

export const ReceivingPhotoButton = memo(function ReceivingPhotoButton({
  receivingId,
  staffId,
  poRef,
  photoStage,
  photoAspect = null,
  receivingLineId = null,
  poRouteRef = null,
  galleryPlacement = 'below',
  appearance = 'pill',
  onSendToTicket,
}: {
  receivingId: number;
  staffId: number;
  /** Carton PO#/order ref — stamped onto each photo's meta so the viewer's
   *  details panel shows the linked PO (parity with ReceivingPhotoPeek). */
  poRef?: string | null;
  /** Capture stage this pill stamps — required, never defaulted (a defaulted safety classification is how bench photos silently became… */
  photoStage: ReceivingPhotoStage;
  /** What this pill's shot SHOWS, within {@link photoStage} — the second axis. */
  photoAspect?: PhotoAspect | null;
  /**
   * Active receiving line — makes this pill the ITEM camera (RECEIVING_LINE +
   * `receiving_item`): line-scoped count/gallery/upload, and phone requests
   * carry the line id. Entity wins: a line id forces the item stage.
   */
  receivingLineId?: number | null;
  /** Zoho PO id (or number) used ONLY to route an item phone request to `/m/receiving/po/{ref}/item/{line}/photos`. */
  poRouteRef?: string | null;
  /** Where the hover gallery card opens relative to the pill. */
  galleryPlacement?: 'below' | 'above' | 'right' | 'left';
  /**
   * `pill` — station identity / section chrome (camera + count, locked w-14).
   * `flush` — square h-11 ghost cell for unit rows.
   * `chrome` — one-row carton bar: h-full cell, h-3.5 camera + count.
   */
  appearance?: 'pill' | 'flush' | 'chrome';
  /** Opens SendPhotoNoteRail — ticket icon in the photo dropdown toolbar. */
  onSendToTicket?: () => void;
}) {
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  // Normalize scope through the stage SoT (entity wins — a line id is item
  // evidence regardless of the prop combination), then derive the write target
  // and the list intent from that one normalized stage.
  const lineId =
    receivingLineId != null && Number.isFinite(receivingLineId) && receivingLineId > 0
      ? receivingLineId
      : null;
  const stage = effectiveReceivingPhotoStage({ stage: photoStage, receivingLineId: lineId });
  const isItemScope = stage === 'unbox_item';
  // The Unbox header pill/gallery reads the carton's WHOLE evidence set (package + unbox_carton + legacy), not just this session's…
  const baseListIntent = receivingPhotoListIntentForScope({ stage, receivingLineId: lineId });
  const listIntent =
    baseListIntent === 'unbox_carton' ? RECEIVING_PHOTO_LIST_INTENT_CARTON : baseListIntent;
  const uploadTarget = useMemo(() => {
    try {
      return resolveReceivingPhotoTarget({
        receivingId,
        receivingLineId: lineId,
        stage,
        aspect: photoAspect,
      });
    } catch {
      return null; // incoherent scope — the query below is disabled too
    }
  }, [receivingId, lineId, stage, photoAspect]);

  const photoParams = { receivingId, photoIntent: listIntent, receivingLineId: lineId, photoAspect };
  const { data } = useQuery<PhotosPayload>({
    queryKey: receivingPhotoListQueryKey(photoParams),
    queryFn: () => fetchReceivingPhotoList(photoParams),
    enabled: Number.isFinite(receivingId) && receivingId > 0 && uploadTarget !== null,
    staleTime: RECEIVING_PHOTOS_STALE_MS,
  });

  const refresh = useCallback(
    (deletedPhotoId?: number) => {
      refreshReceivingPhotos(queryClient, receivingId, deletedPhotoId);
    },
    [queryClient, receivingId],
  );

  useReceivingPhotosRealtimeRefresh(receivingId, staffId, refresh, staffId > 0 && !!orgId);

  // An item capture routes to `/m/receiving/po/{ref}/item/{line}/photos`, which needs a PO route ref.
  const routeRef = String(poRouteRef ?? '').trim();
  const canSendToPhone = !isItemScope || routeRef.length > 0;

  // Waiting/answered/unreachable renders on the house toast surface — NOT the blind optimistic "Sent to phone" toast this replaced…
  const phone = useSendToDevice('receiving_photo');
  useSendToDeviceToast(phone.state, phone.retry);
  const ackChannelName = getReceivingPhotoRequestChannelName(orgId, staffId);

  const handleRequestOnPhone = useCallback(async () => {
    if (!orgId || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    if (!canSendToPhone) {
      toast.error('Link a PO to capture item photos on the phone');
      return;
    }
    await phone.send({
      channelName: ackChannelName,
      // The minted id must reach the wire — the phone echoes it back, and an
      // ack carrying a different id is an ack the desk is not waiting on.
      publish: async (requestId) => {
        const client = await getClient();
        await publishReceivingPhotoRequest(client, orgId, staffId, receivingId, {
          stage,
          receivingLineId: lineId,
          poRef: routeRef || null,
          requestId,
        });
      },
    });
  }, [
    ackChannelName,
    canSendToPhone,
    getClient,
    lineId,
    orgId,
    phone,
    receivingId,
    routeRef,
    staffId,
    stage,
  ]);

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
  const galleryOpenTimer = useRef<ReturnType<typeof setTimeout>>();
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Hover peek is available with or without photos — empty cartons still get
  // the gallery action strip (Upload photos) so operators can pick device upload
  // without using the pill click (pill click = send-to-phone only).
  const showGalleryPeek = galleryHover || galleryUploadPinned || galleryMovePinned;

  const clearGalleryOpenTimer = useCallback(() => {
    if (galleryOpenTimer.current) {
      clearTimeout(galleryOpenTimer.current);
      galleryOpenTimer.current = undefined;
    }
  }, []);

  /** Schedule the hover strip — delayed so the teaching tooltip can paint first. */
  const openGallery = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    // Already open / pinned — keep it; do not re-arm the dwell.
    if (galleryHover || galleryUploadPinned || galleryMovePinned) {
      clearGalleryOpenTimer();
      setGalleryHover(true);
      return;
    }
    if (galleryOpenTimer.current) return;
    galleryOpenTimer.current = setTimeout(() => {
      galleryOpenTimer.current = undefined;
      setGalleryHover(true);
    }, GALLERY_OPEN_DELAY_MS);
  }, [clearGalleryOpenTimer, galleryHover, galleryMovePinned, galleryUploadPinned]);

  const scheduleCloseGallery = useCallback(() => {
    clearGalleryOpenTimer();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setGalleryHover(false), HOVER_LEAVE_MS);
  }, [clearGalleryOpenTimer]);

  /** AnchoredLayer outside-click / Escape — pins keep the gallery mounted. */
  const closeGalleryPeek = useCallback(() => {
    clearGalleryOpenTimer();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setGalleryHover(false);
  }, [clearGalleryOpenTimer]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (galleryOpenTimer.current) clearTimeout(galleryOpenTimer.current);
    },
    [],
  );

  // One consistent resting state across every PO — a calm blue-tinted pill.
  // Radius shared with Claim via {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
  // Flush = square blue cell (same blue as carton-context Photos).
  const chromeFace = appearance === 'chrome';
  const btnClass =
    appearance === 'flush'
      ? STATION_CONTEXT_PHOTO_FLUSH_CLASS
      : chromeFace
        ? STATION_CONTEXT_PHOTO_CHROME_CLASS
        : STATION_CONTEXT_PHOTO_PILL_CLASS;

  const noun = isItemScope ? 'item' : 'carton';
  const title = canSendToPhone ? 'Send to phone' : `Upload ${noun} photos`;
  const ariaLabel = hasGallery
    ? `Photos ${count}; ${canSendToPhone ? 'send to phone' : 'upload'} or open gallery`
    : canSendToPhone
      ? 'Send to phone'
      : `Upload ${noun} photos`;

  const handlePillClick = useCallback(() => {
    void handleRequestOnPhone();
  }, [handleRequestOnPhone]);

  // Carton chrome: raw button (not Button size=sm). The primitive's h-8 /
  // caption line-height sat the glyph and count off the row midline.
  const pillButton = chromeFace ? (
    <button
      type="button"
      onClick={handlePillClick}
      disabled={phone.pending}
      aria-disabled={!canSendToPhone || undefined}
      aria-label={ariaLabel}
      aria-expanded={showGalleryPeek}
      className={STATION_CONTEXT_PHOTO_CHROME_CLASS}
    >
      <Camera className={STATION_CHROME_GLYPH_CLASS} aria-hidden />
      <span className="leading-none tabular-nums">{String(count)}</span>
    </button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handlePillClick}
      disabled={phone.pending}
      aria-disabled={!canSendToPhone || undefined}
      ariaLabel={ariaLabel}
      aria-expanded={showGalleryPeek}
      icon={<Camera className="h-4 w-4" />}
      iconRight={appearance === 'pill' && !hasGallery ? <Plus className="h-3 w-3" /> : undefined}
      className={btnClass}
    >
      {appearance === 'flush' ? null : hasGallery ? count : null}
    </Button>
  );


  return (
    <div
      ref={hostRef}
      className="relative flex h-full min-h-0 shrink-0 self-stretch items-stretch"
      onMouseEnter={openGallery}
      onMouseLeave={scheduleCloseGallery}
      onFocusCapture={openGallery}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleCloseGallery();
      }}
    >
      {/* Stable mount — peek disables the tooltip instead of unwrapping the
          pill (unwrap remounted the trigger mid-press and ate the click). */}
      <HoverTooltip label={title} placement="right" asChild disabled={showGalleryPeek}>
        {pillButton}
      </HoverTooltip>

      {/* Body portal at panelPopover — escapes the locked-720 center (overflow-hidden + sibling utility/Displays stacking). */}
      <AnchoredLayer
        open={showGalleryPeek}
        onClose={closeGalleryPeek}
        anchorRef={hostRef}
        placement={galleryAnchoredPlacement(galleryPlacement)}
        level="panelPopover"
        gap={chromeFace ? GALLERY_CHROME_GAP_PX : GALLERY_GAP_PX}
        avoidCollisions={appearance !== 'chrome'}
        closeOnEscape={!galleryUploadPinned && !galleryMovePinned}
        className="w-max max-w-[18rem]"
      >
        <div onMouseEnter={openGallery} onMouseLeave={scheduleCloseGallery}>
          <PhotoGallery
            photos={photos}
            orderId={`RCV-${receivingId}`}
            receivingId={receivingId}
            // Explicit target:
            uploadTarget={uploadTarget ?? undefined}
            allowReassign
            launcherLayout="toolbar"
            toolbarShowLabel={false}
            compact
            libraryHref={cartonLibraryHref}
            onPhotoDeleted={(photoId) => refresh(photoId)}
            // Reassign/upload are NOT deletes — passing the photo id as `deletedPhotoId` filtered the just-added photo straight back OUT of the…
            onPhotoReassigned={() => refresh()}
            onPhotoUploaded={() => refresh()}
            onUploadOverlayOpenChange={setGalleryUploadPinned}
            onMovePhotosOpenChange={setGalleryMovePinned}
            onSendToTicket={onSendToTicket}
          />
        </div>
      </AnchoredLayer>
    </div>
  );
});

export default ReceivingPhotoButton;
