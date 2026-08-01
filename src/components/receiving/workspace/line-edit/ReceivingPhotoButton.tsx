'use client';

/**
 * Compact receiving-photos control for station chrome. Carton-scoped by
 * default (the condensed CartonContextCard identity row); pass
 * `photoStage="unbox_item"` + `receivingLineId` for the unbox active-line item
 * camera — same pill, scoped to RECEIVING_LINE + `receiving_item` per the
 * stage SoT (`@/lib/receiving/photo-scope`).
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
import {
  RECEIVING_PHOTO_LIST_INTENT_CARTON,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import {
  effectiveReceivingPhotoStage,
  receivingPhotoListIntentForScope,
  resolveReceivingPhotoTarget,
} from '@/lib/receiving/photo-scope';

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

export const ReceivingPhotoButton = memo(function ReceivingPhotoButton({
  receivingId,
  staffId,
  poRef,
  photoStage,
  receivingLineId = null,
  poRouteRef = null,
  galleryPlacement = 'below',
  onSendToTicket,
  onOpenMovePhotosExternal,
}: {
  receivingId: number;
  staffId: number;
  /** Carton PO#/order ref — stamped onto each photo's meta so the viewer's
   *  details panel shows the linked PO (parity with ReceivingPhotoPeek). */
  poRef?: string | null;
  /**
   * Capture stage this pill stamps — required, never defaulted (a defaulted
   * safety classification is how bench photos silently became arrival
   * evidence; see `.claude/rules/backend-patterns.md`). Triage chrome passes
   * `arrival_package` explicitly; the unbox header passes `unbox_carton`; the
   * unbox active-line camera passes `unbox_item` together with
   * `receivingLineId`.
   */
  photoStage: ReceivingPhotoStage;
  /**
   * Active receiving line — makes this pill the ITEM camera (RECEIVING_LINE +
   * `receiving_item`): line-scoped count/gallery/upload, and phone requests
   * carry the line id. Entity wins: a line id forces the item stage.
   */
  receivingLineId?: number | null;
  /**
   * Zoho PO id (or number) used ONLY to route an item phone request to
   * `/m/receiving/po/{ref}/item/{line}/photos`. Without it the phone action is
   * disabled for item scope (device upload still works) — `poRef` may be a
   * sales-order ref the mobile PO route can't resolve.
   */
  poRouteRef?: string | null;
  /**
   * Where the hover gallery card opens relative to the pill. Header pills keep
   * the default `below`; bottom-anchored chrome (the unbox item cluster) passes
   * `above` so the card never runs off the pane edge.
   */
  galleryPlacement?: 'below' | 'above';
  /** Opens SendPhotoNoteRail — ticket icon in the photo dropdown toolbar. */
  onSendToTicket?: () => void;
  /** Unbox: open Move photos in the station tool push instead of a center overlay. */
  onOpenMovePhotosExternal?: () => void;
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
  // The Unbox header pill/gallery reads the carton's WHOLE evidence set
  // (package + unbox_carton + legacy), not just this session's unbox_carton
  // shots — otherwise a carton whose photos predate the stage split shows a
  // count of 0 here while the sidebar's denormalized total still says N. The
  // WRITE target (below) stays pinned to `stage` so new captures still stamp
  // `receiving_unbox_carton` correctly; only this read broadens. Triage's
  // arrival-only pill and the line/item pill are unaffected.
  const baseListIntent = receivingPhotoListIntentForScope({ stage, receivingLineId: lineId });
  const listIntent =
    baseListIntent === 'unbox_carton' ? RECEIVING_PHOTO_LIST_INTENT_CARTON : baseListIntent;
  const uploadTarget = useMemo(() => {
    try {
      return resolveReceivingPhotoTarget({ receivingId, receivingLineId: lineId, stage });
    } catch {
      return null; // incoherent scope — the query below is disabled too
    }
  }, [receivingId, lineId, stage]);

  // Scope the cache key: a line pill must not share an entry with its carton.
  const queryKey = useMemo(
    () => [...receivingPhotosQueryKey(receivingId), listIntent, lineId ?? 'carton'] as const,
    [receivingId, listIntent, lineId],
  );

  const { data } = useQuery<PhotosPayload>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: listIntent,
      });
      if (lineId != null) params.set('receivingLineId', String(lineId));
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(receivingId) && receivingId > 0 && uploadTarget !== null,
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

  // An item capture routes to `/m/receiving/po/{ref}/item/{line}/photos`, which
  // needs a PO route ref. Without one the phone leg is unavailable (device
  // upload via the hover strip still works) — better than sending the operator's
  // phone to a route it cannot resolve.
  const routeRef = String(poRouteRef ?? '').trim();
  const canSendToPhone = !isItemScope || routeRef.length > 0;

  const handleRequestOnPhone = useCallback(async () => {
    if (!orgId || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    if (!canSendToPhone) {
      toast.error('Link a PO to capture item photos on the phone');
      return;
    }
    setPhoneSending(true);
    try {
      const client = await getClient();
      await publishReceivingPhotoRequest(client, orgId, staffId, receivingId, {
        stage,
        receivingLineId: lineId,
        poRef: routeRef || null,
      });
      toast.success('Sent to phone');
    } catch (err) {
      console.warn('receiving-photo-button: photo request publish failed', err);
      toast.error('Could not send to phone');
    } finally {
      setPhoneSending(false);
    }
  }, [getClient, orgId, receivingId, staffId, stage, lineId, routeRef, canSendToPhone]);

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

  const noun = isItemScope ? 'item' : 'carton';
  const phoneHint = canSendToPhone ? 'send to phone' : 'hover to upload';

  const title = hasGallery
    ? `${count} ${noun} photo${count === 1 ? '' : 's'} · ${phoneHint}`
    : canSendToPhone
      ? `Send to phone · hover for upload`
      : `Hover to upload ${noun} photos`;

  const ariaLabel = hasGallery
    ? `${count} ${noun} photo${count === 1 ? '' : 's'}; ${phoneHint} or hover for gallery`
    : canSendToPhone
      ? 'Send capture request to phone; hover for upload options'
      : `Hover for ${noun} upload options`;

  const handlePillClick = useCallback(() => {
    void handleRequestOnPhone();
  }, [handleRequestOnPhone]);

  const pillButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handlePillClick}
      // Item scope with no PO route ref: the phone leg has nowhere to land, but
      // the pill must stay hoverable for device upload — so it is click-inert,
      // not `disabled` (a disabled button swallows the hover the strip needs).
      disabled={phoneSending}
      aria-disabled={!canSendToPhone || undefined}
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
        // Gap bridge only — panel chrome comes from CopyChipHoverMenuPanel
        // (same drop SoT as tracking / ticket), not a second card wrapper.
        <div
          className={
            galleryPlacement === 'above'
              ? 'absolute bottom-full right-0 z-30 pb-1.5'
              : 'absolute right-0 top-full z-30 pt-1.5'
          }
        >
          <PhotoGallery
            photos={photos}
            orderId={`RCV-${receivingId}`}
            receivingId={receivingId}
            // Explicit target: without it a receiving gallery derives
            // RECEIVING + `receiving_package`, so an ITEM pill's hover-upload
            // would stamp carton evidence onto a line camera (and the write
            // waist would 400 it). The resolver already encodes the matrix.
            uploadTarget={uploadTarget ?? undefined}
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
            onOpenMovePhotosExternal={onOpenMovePhotosExternal}
            onSendToTicket={onSendToTicket}
          />
        </div>
      ) : null}
    </div>
  );
});

export default ReceivingPhotoButton;
