'use client';

/**
 * Compact receiving-photos control for station chrome. Carton-scoped by
 * default (the condensed CartonContextCard identity row); pass
 * `photoStage="unbox_item"` + `receivingLineId` for the unbox active-line item
 * camera — same pill, scoped to RECEIVING_LINE + `receiving_item` per the
 * stage SoT (`@/lib/receiving/photo-scope`).
 *
 * One pill: camera pinned left + (count when photos exist, else "+") pinned
 * right. **Click sends a capture request to the paired phone** — that action
 * never moves. When {@link onOpenPhotosDisplay} is set (Unbox carton identity),
 * **double-click opens Displays → Photos** (Actions list; replaces whatever
 * leaf is open). Single-click is deferred briefly so a double-click does not
 * also fire phone. Hover reveals the PhotoLauncher action dropdown (View ·
 * Upload · Download · Move · Ticket · Media · Details) unless
 * {@link suppressHoverGallery}. On Unbox, Move / Ticket open Displays (right
 * rail) via {@link onOpenMovePhotosExternal} / {@link onSendToTicket}. Count
 * and "+" never share the face — when a count is shown the plus is omitted.
 * Width is locked (`justify-between`) so digit growth does not shift the
 * identity row.
 *
 * Default hover strip is an {@link AnchoredLayer} at `panelPopover` (body
 * portal) so it escapes the scan-station center's `overflow-hidden`. Unbox
 * carton identity, item dock, and Arrival keep the hover strip.
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
/**
 * Delay before single-click → phone when {@link onOpenPhotosDisplay} is wired.
 * Long enough to absorb a double-click without sending; short enough that a
 * real phone tap still feels immediate.
 */
const PHONE_CLICK_DEFER_MS = 280;
/**
 * Delay before the hover PhotoLauncher strip opens. Instant open used to
 * `disabled` the teaching {@link HoverTooltip} on the same frame — operators
 * never saw “click = phone · double-click = details”. Short dwell keeps the
 * tip readable; longer hover still lands the action strip.
 */
const GALLERY_OPEN_DELAY_MS = 420;
/** Keep the portaled gallery flush to the photo trigger — no inter-control air. */
const GALLERY_GAP_PX = 0;

function galleryAnchoredPlacement(
  placement: 'below' | 'above' | 'right' | 'left',
): AnchoredPlacement {
  if (placement === 'above') return 'top-center';
  if (placement === 'right') return 'right-start';
  if (placement === 'left') return 'left-start';
  // Below opens CENTERED on the pill, not left-aligned to it: on the carton
  // strip the trigger is a narrow cell in a row of narrow cells, so a
  // start-aligned panel reads as belonging to whichever cell its left edge
  // happens to land under.
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
  onOpenMovePhotosExternal,
  onOpenPhotosDisplay,
  suppressHoverGallery = false,
}: {
  receivingId: number;
  staffId: number;
  /** Carton PO#/order ref — stamped onto each photo's meta so the viewer's
   *  details panel shows the linked PO (parity with ReceivingPhotoPeek). */
  poRef?: string | null;
  /**
   * Capture stage this pill stamps — required, never defaulted (a defaulted
   * safety classification is how bench photos silently became arrival
 * evidence;). Triage chrome passes
   * `arrival_package` explicitly; the unbox header passes `unbox_carton`; the
   * unbox active-line camera passes `unbox_item` together with
   * `receivingLineId`.
   */
  photoStage: ReceivingPhotoStage;
  /**
   * What this pill's shot SHOWS, within {@link photoStage} — the second axis.
   * A procedure step that asks for one specific frame ("the shipping label")
   * passes it, so the capture satisfies that step and only that step; the three
   * bench carton shots share one stage and are told apart by this alone.
   *
   * Omit on a general-purpose pill: null is *unclassified evidence*, which is
   * both legal and the honest answer when the surface did not ask for a
   * particular frame. Never defaulted to a concrete aspect — an aspect is a
   * claim about what the operator pointed the camera at, and this component is
   * not in a position to make one.
   *
   * Scoping is total: when set, the pill's COUNT and gallery show only shots of
   * this aspect, so "1 photo" on the shipping-label step never means a photo of
   * the box.
   */
  photoAspect?: PhotoAspect | null;
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
   * Where the hover gallery card opens relative to the pill.
   * - `below` — under the pill, align start (carton identity + unit rows).
   * - `above` — bottom-anchored chrome (unbox item dock) so the card never
   *   runs off the pane edge.
   * - `left` / `right` — beside the pill (legacy hosts only — not the carton bar).
   */
  galleryPlacement?: 'below' | 'above' | 'right' | 'left';
  /**
   * `pill` — station identity / section chrome (camera + count, locked w-14).
   * `flush` — square h-11 ghost cell for unit rows (Units Displays explosion).
   * `chrome` — one-row carton bar: h-full cell, h-3.5 camera + count.
   */
  appearance?: 'pill' | 'flush' | 'chrome';
  /** Opens SendPhotoNoteRail — ticket icon in the photo dropdown toolbar. */
  onSendToTicket?: () => void;
  /** Unbox: open Move photos in the station tool push instead of a center overlay. */
  onOpenMovePhotosExternal?: () => void;
  /**
   * Unbox carton identity — double-click opens Displays → Photos (Actions).
   * Replaces whatever Displays leaf is open; opens the column when closed.
   * Single-click stays send-to-phone (deferred so dblclick does not also send).
   * Omit on item dock / Arrival.
   */
  onOpenPhotosDisplay?: () => void;
  /**
   * Suppress the hover PhotoLauncher strip (rare). Unbox carton identity keeps
   * the strip — Move / Ticket open Displays via the external callbacks. Pill
   * click stays send-to-phone; double-click opens Displays when
   * {@link onOpenPhotosDisplay} is set.
   */
  suppressHoverGallery?: boolean;
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

  // Scope the cache key: a line pill must not share an entry with its carton,
  // and an aspect-scoped pill must not share one with the unscoped pill above it
  // — otherwise the shipping-label step would read the whole carton's count and
  // report itself satisfied by a photo of the box.
  const queryKey = useMemo(
    () =>
      [
        ...receivingPhotosQueryKey(receivingId),
        listIntent,
        lineId ?? 'carton',
        photoAspect ?? 'any',
      ] as const,
    [receivingId, listIntent, lineId, photoAspect],
  );

  const { data } = useQuery<PhotosPayload>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: listIntent,
      });
      if (lineId != null) params.set('receivingLineId', String(lineId));
      if (photoAspect) params.set('photoAspect', photoAspect);
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

  // An item capture routes to `/m/receiving/po/{ref}/item/{line}/photos`, which
  // needs a PO route ref. Without one the phone leg is unavailable (device
  // upload via the hover strip still works) — better than sending the operator's
  // phone to a route it cannot resolve.
  const routeRef = String(poRouteRef ?? '').trim();
  const canSendToPhone = !isItemScope || routeRef.length > 0;

  // Waiting/answered/unreachable renders on the house toast surface — NOT the
  // blind optimistic "Sent to phone" toast this replaced originally (an Ably
  // publish resolves with zero subscribers, so that one only ever confirmed
  // the desk had spoken). This toast tracks the real handshake state instead.
  // Same hook + same toast id shape as Pack (P1 · D2).
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
  const phoneClickTimer = useRef<ReturnType<typeof setTimeout>>();
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
      if (phoneClickTimer.current) clearTimeout(phoneClickTimer.current);
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
  const opensPhotosDisplay = typeof onOpenPhotosDisplay === 'function';

  // Compact teaching tip — sits to the right of the pill (short copy so it
  // never spills the viewport). Displays Photos wired → phone + dbl-click.
  const title = opensPhotosDisplay
    ? canSendToPhone
      ? 'Phone · dbl-click details'
      : `Upload ${noun} photos`
    : canSendToPhone
      ? 'Send to phone'
      : `Upload ${noun} photos`;

  const ariaLabel = opensPhotosDisplay
    ? hasGallery
      ? `Photos ${count}; send to phone; double-click opens photo details`
      : canSendToPhone
        ? 'Send to phone; double-click opens photo details'
        : `Upload ${noun} photos`
    : hasGallery
      ? suppressHoverGallery
        ? `Photos ${count}; send to phone`
        : `Photos ${count}; ${canSendToPhone ? 'send to phone' : 'upload'} or open gallery`
      : canSendToPhone
        ? 'Send to phone'
        : `Upload ${noun} photos`;

  const handlePillClick = useCallback(() => {
    if (!opensPhotosDisplay) {
      void handleRequestOnPhone();
      return;
    }
    // Defer phone so a double-click can cancel and open Displays instead.
    if (phoneClickTimer.current) clearTimeout(phoneClickTimer.current);
    phoneClickTimer.current = setTimeout(() => {
      phoneClickTimer.current = undefined;
      void handleRequestOnPhone();
    }, PHONE_CLICK_DEFER_MS);
  }, [handleRequestOnPhone, opensPhotosDisplay]);

  const handlePillDoubleClick = useCallback(() => {
    if (!onOpenPhotosDisplay) return;
    if (phoneClickTimer.current) {
      clearTimeout(phoneClickTimer.current);
      phoneClickTimer.current = undefined;
    }
    onOpenPhotosDisplay();
  }, [onOpenPhotosDisplay]);

  // Carton chrome: raw button (not Button size=sm). The primitive's h-8 /
  // caption line-height sat the glyph and count off the row midline.
  const pillButton = chromeFace ? (
    <button
      type="button"
      onClick={handlePillClick}
      onDoubleClick={opensPhotosDisplay ? handlePillDoubleClick : undefined}
      disabled={phone.pending}
      aria-disabled={!canSendToPhone || undefined}
      aria-label={ariaLabel}
      aria-expanded={suppressHoverGallery ? undefined : showGalleryPeek}
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
      onDoubleClick={opensPhotosDisplay ? handlePillDoubleClick : undefined}
      disabled={phone.pending}
      aria-disabled={!canSendToPhone || undefined}
      ariaLabel={ariaLabel}
      aria-expanded={suppressHoverGallery ? undefined : showGalleryPeek}
      icon={<Camera className="h-4 w-4" />}
      iconRight={appearance === 'pill' && !hasGallery ? <Plus className="h-3 w-3" /> : undefined}
      className={btnClass}
    >
      {appearance === 'flush' ? null : hasGallery ? count : null}
    </Button>
  );

  // Opt-out: phone-only face (no hover action dropdown).
  if (suppressHoverGallery) {
    return (
      <div ref={hostRef} className="relative flex h-full min-h-0 shrink-0 self-stretch items-stretch">
        <HoverTooltip label={title} placement="right" asChild>
          {pillButton}
        </HoverTooltip>
      </div>
    );
  }

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

      {/*
        Body portal at panelPopover — escapes the locked-720 center
        (overflow-hidden + sibling utility/Displays stacking). Gap bridge lives
        on the portaled host via mouse enter/leave (pill leave delay still
        applies). Carton chrome opens below-start and skips collision clamp so
        the panel cannot be shoved left over Claim.
      */}
      <AnchoredLayer
        open={showGalleryPeek}
        onClose={closeGalleryPeek}
        anchorRef={hostRef}
        placement={galleryAnchoredPlacement(galleryPlacement)}
        level="panelPopover"
        gap={GALLERY_GAP_PX}
        // The fullscreen viewer is a second body portal mounted by PhotoGallery.
        // Keep clicks inside that nested surface from looking like outside clicks
        // to this enclosing hover peek; the viewer owns its own close button and
        // scrim dismissal.
        ignoreClickSelector="[data-photo-portal]"
        avoidCollisions={appearance !== 'chrome'}
        closeOnEscape={!galleryUploadPinned && !galleryMovePinned}
        className="w-max max-w-[18rem]"
      >
        <div onMouseEnter={openGallery} onMouseLeave={scheduleCloseGallery}>
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
      </AnchoredLayer>
    </div>
  );
});

export default ReceivingPhotoButton;
