'use client';

/**
 * Right-pane workspace editor for a single receiving line — the UNBOX display,
 * and the MASTER/anchor for the workspace UX. All form state, effects, and
 * handlers live in `useUnboxLineController` (which composes the mode-agnostic
 * `useReceivingLineCore`); this file is pure composition.
 *
 * **The centre is the carton.** There is no tab strip in the workbench body:
 * `overview` (PO lines → label preview) IS the body, and every other display —
 * Package Pairing included, since 2026-08-02 — lives in the right-edge
 * {@link ReceivingDisplaysPushStack} — a peer of Ticket / Claim / tool push, not
 * a `RightRailHost` occupant (the occupant slot stays single-occupancy and
 * `detail:receiving` keeps the float host). The station's procedure is not in
 * the centre either — it IS the Checklist display in that same column
 * (the guided step stack in the workbench centre).
 *
 * The bottom dock is **carton-terminal**: always Print · Receive. It does not
 * change with the Displays selection — a right-panel click re-labelling the
 * bottom primary is cross-region action-at-a-distance.
 *
 * Triage (the identify-before-unbox pass) is its own lean panel
 * ({@link TriagePanel}); the two no longer share a JSX shell or a capability
 * matrix. The testing display (/tech) composes the SAME core + cards with its
 * own controller, so the carton/identity logic lives in exactly one place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  staggerRevealContainer,
  STAGGER_REVEAL_STEP,
} from '@/design-system/primitives/StaggerReveal';
import { toast } from '@/lib/toast';
import { ReceiveFeedbackRegion } from './ReceiveFeedbackRegion';
import { WorkspaceActionFeedbackSlot } from './WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from './InlineActionFeedbackCard';
import { ReceivingPhotoPeek } from './line-edit/ReceivingPhotoPeek';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';
import { LineCartonContextSection } from './line-edit/LineCartonContextSection';
import { useSyncedPoNote } from './line-edit/hooks/useSyncedPoNote';
import { useUnboxLineController } from './line-edit/hooks/useUnboxLineController';
import { useReceivingTicketView } from './line-edit/hooks/useReceivingTicketView';
import { useReceivingClaimView } from './line-edit/hooks/useReceivingClaimView';
import { useUnboxDisplayView } from './line-edit/hooks/useUnboxDisplayView';
import { clearUnboxPeerRightEdgeSurfaces } from './line-edit/unbox-right-edge';
import {
  ReceivingPushExpandStrip,
  ReceivingTicketExpandControl,
  ReceivingTicketStack,
  TICKET_PUSH_HOST_PAD_CLASS,
} from './ReceivingTicketStack';
import { ReceivingClaimStack } from './ReceivingClaimStack';
import { ReceivingDisplaysPushStack } from './ReceivingDisplaysPushStack';
import {
  ReceivingToolPushStack,
  type UnboxToolPushId,
} from './ReceivingToolPushStack';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { useReturnOrderLinkage } from './line-edit/hooks/useReturnOrderLinkage';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import {
  StationContextBar,
  stationMoreDetailsPaneHostClass,
} from '@/components/station/entity-context';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  StationPanelRoot,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { slicedActionDockWrapperClass } from '@/design-system/primitives';
import { usePoNoteTabState } from './line-edit/terminal/usePoNoteTabState';
import { resolveUnboxTerminal } from './line-edit/terminal/unbox-terminal';
import { buildUnboxOverview, buildUnboxSideTabs } from './line-edit/terminal/unbox-tabs';
import { WorkspaceNotesCard } from './line-edit/WorkspaceNotesCard';
import { UnboxProcedurePager } from './line-edit/UnboxProcedurePager';
import { UnboxScanProgressControl } from './UnboxScanProgressControl';
import {
  resolveUnboxSideTab,
  type UnboxSideTab,
} from './line-edit/unbox-side-tabs';
import { hasRealZohoPoId } from '@/lib/receiving/intake-items-routing';
import { dispatchReceivingOpenPairingPo } from '@/utils/events';
import { ArrowRightToLine, ChevronDown, ChevronUp } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';

export function LineEditPanel({
  row,
  staffId,
  itemTotal,
  accordionBootstrap = 'default',
  onPrevCarton,
  onNextCarton,
  onCloseCarton,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Total number of items in the PO — drives the "Receive" vs "Receive all" labels. */
  itemTotal?: number;
  /**
   * Snapshot of `receiving.accordionExpand` at carton open — `'all'` keeps the
   * active PO-line body expanded and suppresses inactive fake chevrons.
   */
  accordionBootstrap?: 'default' | 'all';
  /**
   * Record cursor + dismiss for the CARTON, rendered in the pane-anchored
   * utility row beside the progress ring. `ReceivingLineWorkspace` has carried
   * these three since the workspace was built but only ever handed them to
   * Triage — Unbox had no visible prev/next at all, and its only close was the
   * identity bar's exit chip.
   */
  onPrevCarton?: () => void;
  onNextCarton?: () => void;
  onCloseCarton?: () => void;
}) {
  // All state, effects, and handlers live in the controller — this panel is pure
  // composition. See useUnboxLineController / useReceivingLineCore.
  const qc = useQueryClient();
  const { claimView, claimMode, setClaimView } = useReceivingClaimView(row.id);
  const onOpenClaim = useCallback(
    (mode: 'create' | 'link') => {
      setClaimView(true, mode);
    },
    [setClaimView],
  );
  const c = useUnboxLineController(row, staffId, { itemTotal, onOpenClaim });
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  // Shared PO-note save (overwrite + push to inventory) — used by the notes
  // composer's push button and the standalone inventory-notes tab dock.
  const { saveOverallNote } = useSyncedPoNote(row, setActionFeedback);
  const rowSerials = Array.isArray(row.serials) ? row.serials : [];
  const serialCount = rowSerials.length;
  // Resolve the returned unit's OUTBOUND order (closed-loop linkage) from the
  // live scan input, falling back to the newest serial already on the line so
  // the identity persists after the scan bar clears. The resolved order# lands
  // in the top-row PO#/order chip (last-8) instead of a separate LINKAGE panel.
  const latestRowSerial = String(rowSerials[rowSerials.length - 1]?.serial_number ?? '').trim();
  const linkedOrder = useReturnOrderLinkage(c.serialInput.trim() || latestRowSerial);
  // REMOVED 2026-08-02 — the `activeStep` memo, and with it the `labelPrinted`
  // state, the live `photoCount` and the per-unit absent tally that fed it.
  //
  // Two reasons, and the second is the one that matters. It drove the notes
  // composer's print-step auto-focus, which is deleted (a derivation must never
  // move the caret at a scan bench). And it was a SECOND pointer derivation —
  // `activeReceivingStepKey` standing beside `resolveActiveStep` — which is the
  // precise hazard `procedure-pointer.ts` was extracted to close: the two
  // disagree the moment skips exist, and both look authoritative.
  //
  // Active-step / procedure %: `useUnboxProcedureSteps` (centre cards, checklist
  // display, pane scan-progress control) — never a second pointer derivation.

  // Which right-edge display is showing, from `?display=`. `null` = the column
  // is closed — one piece of state, URL-durable like its Ticket / Claim
  // siblings, so a reload or a shared link lands on the same display.
  const { requestedDisplay: requestedSideTab, setDisplay: setRequestedSideTab } =
    useUnboxDisplayView(row.id ?? null);
  const [classifyExpand, setClassifyExpand] = useState<{
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null>(null);

  const hasUnits = serialCount > 0;
  const trackingNumber = String(row.tracking_number ?? '').trim();
  const poIdForTracking = String(row.zoho_purchaseorder_id ?? '').trim();
  const hasTimelineTab =
    trackingNumber.length > 0 || hasUnits || row.receiving_id != null;
  const hasPoNoteTab = !c.isUnfound && row.receiving_id != null;
  const isLocalPickup = isLocalPickupFulfillment(row);
  const hasTrackingTab = !isLocalPickup;
  // Classification: checklist tab only (header pill row removed — DS SoT).
  // Unfound → strip order 1 (replaces Listings). Matched → ⋯ overflow.
  const hasClassifyTab = true;
  const classifyOnStrip = c.isUnfound;
  const hasListingsTab = !c.isUnfound;
  // Package Pairing needs a carton to pair — without a record the hub can only
  // teach ("scan its tracking"), which is not worth a strip cell.
  const hasPairingTab = row.receiving_id != null;
  const activeSideTab = resolveUnboxSideTab(requestedSideTab, {
    hasClassifyTab,
    hasPairingTab,
    hasListingsTab,
    hasUnits,
    hasPoNoteTab,
    hasTrackingTab,
    hasTimelineTab,
  });
  const displaysOpen = activeSideTab != null;

  const poNote = usePoNoteTabState({
    overallZohoNotes: row.receiving_zoho_notes ?? null,
    active: activeSideTab === 'po-note',
    onSaveOverallNote: saveOverallNote,
    onLoadZohoNotes: () => c.syncCartonFromZoho(),
  });

  const { ticketView, setTicketView } = useReceivingTicketView(row.id);
  const ticketId = c.providerTicketId;
  const showTicketStack = ticketView && ticketId != null && !claimView;
  const showClaimStack = claimView;

  const activeToolPush: UnboxToolPushId | null = c.movePhotosOpen
    ? 'move-photos'
    : c.photoNoteOpen
      ? 'photo-note'
      : c.auditOpen && row.receiving_id != null
        ? 'audit'
        : null;
  const showToolPush = activeToolPush != null && !showClaimStack && !showTicketStack;
  // Displays is the LOWEST-precedence right-edge surface: an exception surface
  // (Claim / Ticket) or a tool the operator just launched outranks reference
  // reading. It is still exclusive — never a second column beside them.
  const showDisplays =
    displaysOpen && !showClaimStack && !showTicketStack && !showToolPush;

  const closeDisplays = useCallback(
    () => setRequestedSideTab(null),
    [setRequestedSideTab],
  );

  /**
   * Open a display. `setDisplay` already drops the Ticket / Claim params and
   * suspends `detail:receiving` (it owns that half of the exclusion, same as
   * `setClaimView` does), so only the tool push — controller state, not URL —
   * is cleared here.
   */
  const openDisplays = useCallback(
    (tab: UnboxSideTab) => {
      c.closeToolPush();
      setRequestedSideTab(tab);
    },
    [c.closeToolPush, setRequestedSideTab],
  );

  /** Identity-header classify face → open Classify with that picker expanded. */
  const openClassifyFromHeader = useCallback(
    (picker: 'urgency' | 'platform' | 'type') => {
      openDisplays('classify');
      setClassifyExpand((prev) => ({
        dimension: picker,
        requestId: (prev?.requestId ?? 0) + 1,
      }));
    },
    [openDisplays],
  );

  // One right-edge secondary: Displays ↔ tool push ↔ Claim ↔ Ticket ↔
  // detail:receiving. Opening a tool clears peers. Opening Claim/Ticket closes
  // the tool only on a false→true *transition* (not while Claim is already
  // open) so clearing Claim when a tool opens cannot race and kill the tool
  // mid-open.
  useEffect(() => {
    if (!c.movePhotosOpen && !c.photoNoteOpen && !c.auditOpen) return;
    clearUnboxPeerRightEdgeSurfaces({
      setClaimView,
      setTicketView,
      claimView,
      ticketView,
    });
    setRequestedSideTab(null);
  }, [
    c.movePhotosOpen,
    c.photoNoteOpen,
    c.auditOpen,
    setClaimView,
    setTicketView,
    claimView,
    ticketView,
    setRequestedSideTab,
  ]);

  // Claim / Ticket drop `?display=` inside their OWN url write
  // (`clearPeerRightEdgeParams`), so these only close the tool push — controller
  // state, not URL. Clearing the display here too would race that write from a
  // stale `searchParams` snapshot and resurrect the param.
  const prevClaimViewRef = useRef(false);
  useEffect(() => {
    if (claimView && !prevClaimViewRef.current) c.closeToolPush();
    prevClaimViewRef.current = claimView;
  }, [claimView, c.closeToolPush]);

  const prevTicketViewRef = useRef(false);
  useEffect(() => {
    if (ticketView && !prevTicketViewRef.current) c.closeToolPush();
    prevTicketViewRef.current = ticketView;
  }, [ticketView, c.closeToolPush]);

  // Details overlay wins the edge: `useUnboxDisplayView` already drops
  // `?display=` on this event, so the panel only has to close the tool push.
  useEffect(() => {
    const handler = () => c.closeToolPush();
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [c.closeToolPush]);

  const closeToolPush = useCallback(() => {
    c.closeToolPush();
  }, [c.closeToolPush]);

  const openMovePhotosPush = useCallback(() => {
    c.openMovePhotos();
  }, [c.openMovePhotos]);

  const toggleTicketView = () => setTicketView(!ticketView);

  const closeClaimView = useCallback(() => {
    setClaimView(false);
    c.setReturnClaimPrefill(null);
  }, [setClaimView, c]);

  const onClaimTicketCreated = useCallback(
    (ticketNumber: string) => {
      void c.invalidateSupportTicket();
      invalidateSupportContextCaches(qc);
      if (row.receiving_id != null) {
        patchReceivingRailTicketByCarton(qc, row.receiving_id, ticketNumber);
      }
      dispatchLineUpdated({
        id: row.id,
        zendesk_ticket: ticketNumber,
        notes: row.notes,
      });
      invalidateReceivingFeeds(qc);
    },
    [c, qc, row.id, row.notes, row.receiving_id],
  );

  const onClaimTicketUnlinked = useCallback(() => {
    void c.invalidateSupportTicket();
    invalidateSupportContextCaches(qc);
    if (row.receiving_id != null) {
      patchReceivingRailTicketByCarton(qc, row.receiving_id, null);
    }
    dispatchLineUpdated({ id: row.id, zendesk_ticket: null, notes: row.notes });
    invalidateReceivingFeeds(qc);
  }, [c, qc, row.id, row.notes, row.receiving_id]);

  useEffect(() => {
    if (ticketView && !c.supportTicketLoading && ticketId == null) {
      setTicketView(false);
      toast('No linked ticket to edit on this carton.');
    }
  }, [ticketView, c.supportTicketLoading, ticketId, setTicketView]);

  // Carton-terminal: no `tabId`, no bridges. The dock is Print · Receive
  // whatever the Displays column is showing.
  const buildTerminal = useCallback(
    (kind: string) =>
      resolveUnboxTerminal(kind, {
        row,
        receive: {
          printReceivePrimaryLabel: c.printReceivePrimaryLabel,
          printThenReceiveTitle: c.printThenReceiveTitle,
          combinedReviewDisabled: c.combinedReviewDisabled,
          combinedReviewDisabledReason: c.combinedReviewDisabledReason,
          splitMenuAriaLabel: c.splitMenuAriaLabel,
          splitMenuHoverTitle: c.splitMenuHoverTitle,
          canPrintReview: c.canPrintReview,
          canReceiveReview: c.canReceiveReview,
          canZohoReceive: c.canZohoReceive,
          isUnfound: c.isUnfound,
          isReceived: c.isReceived,
          canUnreceive: c.canUnreceive,
          receiveMenuLabel: c.receiveMenuLabel,
          receiveMenuTitle: c.receiveMenuTitle,
          unreceiveMenuLabel: c.unreceiveMenuLabel,
          unreceiveMenuTitle: c.unreceiveMenuTitle,
          handlePrintAndReceive: () => void c.handlePrintAndReceive(),
          runPrintLabel: () => c.runPrintLabel(),
          printKind: (kind) => c.printKind(kind),
          labelSelectOptions: c.labelSelectOptions,
          selectedLabelKind: c.selectedLabelKind,
          setSelectedLabelKind: c.setSelectedLabelKind,
          activeLabelKind: c.activeLabelKind,
          handleReceive: (mode) => void c.handleReceive(mode),
        },
      }),
    [row, c],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'unbox',
    mode: 'unbox',
    build: buildTerminal,
  });

  /**
   * Carton `# ----` / Link PO → open the `pairing` DISPLAY with its PO tab
   * already selected. Click again while it is showing closes it.
   *
   * The `requestAnimationFrame` is load-bearing: `CartonMatchHub` subscribes to
   * `RECEIVING_OPEN_PAIRING_PO_EVENT` on mount, so dispatching in the same tick
   * as the display opens fires the event at a hub that does not exist yet and
   * the PO tab silently stays unselected.
   */
  const openPoPairing = useCallback(() => {
    if (activeSideTab === 'pairing') {
      closeDisplays();
      return;
    }
    openDisplays('pairing');
    requestAnimationFrame(() => dispatchReceivingOpenPairingPo());
  }, [activeSideTab, openDisplays, closeDisplays]);

  useEffect(() => {
    setActionFeedback(null);
  }, [row.id]);

  const handleItemDescFeedback = useCallback((feedback: InlineActionFeedbackPayload | null) => {
    setActionFeedback(feedback);
  }, []);

  const handleItemDescSaved = useCallback(
    (lineId: number, zohoNotes: string | null) => {
      if (lineId === row.id) {
        dispatchLineUpdated({ id: row.id, zoho_notes: zohoNotes });
      }
    },
    [row.id],
  );

  const showReceiveFeedback = Boolean(c.receiving || c.receiveResult);

  const reduceMotion = useReducedMotion();
  const revealContainer = staggerRevealContainer(reduceMotion ? 0 : STAGGER_REVEAL_STEP);
  const revealItem: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.001 } } }
    : { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

  const unboxOverview = useMemo(
    () =>
      buildUnboxOverview({
        row,
        staffId,
        c,
        onItemDescFeedback: handleItemDescFeedback,
        onItemDescSaved: handleItemDescSaved,
        accordionBootstrap,
      }),
    [
      row,
      staffId,
      c,
      handleItemDescFeedback,
      handleItemDescSaved,
      accordionBootstrap,
    ],
  );

  const unboxSideTabs = useMemo(
    () =>
      buildUnboxSideTabs({
        row,
        staffId,
        c,
        activeSideTab,
        hasUnits,
        serialCount,
        hasTimelineTab,
        hasTrackingTab,
        hasListingsTab,
        hasClassifyTab,
        classifyOnStrip,
        hasPairingTab,
        poIdForTracking,
        hasPoNoteTab,
        poNote,
        onItemDescFeedback: handleItemDescFeedback,
        onItemDescSaved: handleItemDescSaved,
        accordionBootstrap,
        classifyExpandDimension: classifyExpand?.dimension ?? null,
        classifyExpandRequestId: classifyExpand?.requestId ?? 0,
      }),
    [
      row,
      staffId,
      c,
      accordionBootstrap,
      activeSideTab,
      hasUnits,
      serialCount,
      hasTimelineTab,
      hasTrackingTab,
      hasListingsTab,
      hasClassifyTab,
      classifyOnStrip,
      hasPairingTab,
      poIdForTracking,
      hasPoNoteTab,
      poNote,
      handleItemDescFeedback,
      handleItemDescSaved,
      classifyExpand,
    ],
  );

  const showTicketExpand =
    !showClaimStack && !showTicketStack && !showToolPush && !showDisplays && ticketId != null;
  // Parked strip is ticket-restore only — Displays opens from the pane-anchored
  // progress ring, which stays put when a push column opens.
  const showExpandStrip = showTicketExpand;
  const showRightPushChrome =
    showClaimStack || showTicketStack || showToolPush || showDisplays || showExpandStrip;

  const openChecklistDisplay = useCallback(
    () => openDisplays('checklist'),
    [openDisplays],
  );

  /**
   * A push column actually occupies the right edge. ONE derivation — the ring
   * suppresses its hover peek on it, and the carton cursor trio mounts on it.
   * The parked ticket strip is deliberately NOT included: it is a restore
   * affordance, not an open rail.
   */
  const railOpen = showClaimStack || showTicketStack || showToolPush || showDisplays;

  const scanProgressControl = (
    <UnboxScanProgressControl
      row={row}
      railOpen={railOpen}
      checklistActive={showDisplays && activeSideTab === 'checklist'}
      onOpenChecklist={openChecklistDisplay}
      onCloseDisplays={closeDisplays}
    />
  );

  /**
   * The pane utility row — `close · up · down` on the LEFT, scan-progress ring
   * pinned to the top-right corner, in one pane-anchored cluster.
   *
   * **The cursor trio mounts only while a push column is open** (`railOpen`).
   * Closed, the ring is alone in the corner. Those three controls belong to the
   * column: close parks it back against the edge it came from, and prev/next
   * step the record the column is describing. With nothing open there is no
   * column to park and nothing beside the carton to describe, so they would be
   * three glyphs floating over the work canvas — chrome for a region that is
   * not on screen. The ring is the exception by contract: it is the Displays
   * toggle, so it must stay put whether the column is open or not.
   *
   * **Close leads** (`source-of-truth.md` → Panel header grammar, amended
   * 2026-08-02). Dismiss is the one control an operator reaches for without
   * looking, so it gets the stable end of the cluster: prev/next appear and
   * disappear with the queue behind the carton, and a trailing close would
   * shift under the cursor every time they did.
   *
   * **The glyph is `ArrowRightToLine` (`>|`), not an `X`.** This surface pushes
   * to the right — it is parked back against the edge it came from, not
   * cancelled — and the arrow says which way it goes. An `X` reads as "discard
   * this work", which is the opposite of what closing a carton does.
   *
   * Honest absence throughout: a host that passes no cursor renders the ring
   * alone, with no dead chevrons and no hairline.
   */
  const showCartonCursor =
    railOpen && Boolean(onCloseCarton || onPrevCarton || onNextCarton);

  const paneUtilityRow = (
    <div className="flex items-center">
      {/* One TIGHT trio, not three loose buttons. `xs` (24px) with no gap puts
          ~8px between glyphs; `sm` + `gap-0.5` put ~14px there, which read as
          three unrelated controls scattered beside the ring rather than one
          cursor group. The hairline is what separates group from ring. */}
      {showCartonCursor ? (
        <>
          <div className="flex items-center gap-0">
            {onCloseCarton ? (
              <HoverTooltip label="Close carton" asChild>
                <IconButton
                  size="xs"
                  tone="neutral"
                  ariaLabel="Close carton"
                  icon={<ArrowRightToLine className="h-4 w-4" />}
                  onClick={onCloseCarton}
                  data-testid="unbox-carton-close"
                />
              </HoverTooltip>
            ) : null}
            {onPrevCarton ? (
              <HoverTooltip label="Previous carton" asChild>
                <IconButton
                  size="xs"
                  tone="neutral"
                  ariaLabel="Previous carton"
                  icon={<ChevronUp className="h-4 w-4" />}
                  onClick={onPrevCarton}
                  data-testid="unbox-carton-prev"
                />
              </HoverTooltip>
            ) : null}
            {onNextCarton ? (
              <HoverTooltip label="Next carton" asChild>
                <IconButton
                  size="xs"
                  tone="neutral"
                  ariaLabel="Next carton"
                  icon={<ChevronDown className="h-4 w-4" />}
                  onClick={onNextCarton}
                  data-testid="unbox-carton-next"
                />
              </HoverTooltip>
            ) : null}
          </div>
          <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border-hairline" />
        </>
      ) : null}
      {scanProgressControl}
    </div>
  );

  // TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1
  // (`docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md`). Unbox has no free
  // slot for it: the left context column already renders the Queue/Viewed/
  // History rail, and the right edge is a mutually-exclusive stack (Displays /
  // Ticket / Claim / tool / `detail:receiving`). Mounting a personal triage rail
  // here means evicting an occupant or adding a region — an explicit decision,
  // not a default. F0 changes nothing here.
  const stationContextBar = (
    <StationContextBar
      identity={
        <LineCartonContextSection
          row={row}
          staffId={staffId}
          c={c}
          linkedOrderNumber={linkedOrder?.orderId ?? null}
          onToggleTicketView={toggleTicketView}
          ticketViewActive={ticketView}
          onToggleClaimView={() => {
            if (claimView) closeClaimView();
            else setClaimView(true, 'create');
          }}
          claimViewActive={claimView}
          onOpenMovePhotosExternal={openMovePhotosPush}
          // Unbox is the only opt-in to the two-row identity (row 1 = what kind
          // of work, row 2 = which record). Triage shares this adapter and
          // stays on the one-row `bar`.
          density="bar-stacked"
          // Identity pills open the Displays column on their own tab — the
          // editors moved right, so the header route follows them.
          onEditTracking={hasTrackingTab ? () => openDisplays('tracking') : undefined}
          onEditListing={hasListingsTab ? () => openDisplays('listings') : undefined}
          onEditPo={!hasRealZohoPoId(row) ? openPoPairing : undefined}
          onClassifyPillOpen={openClassifyFromHeader}
          trackingEditOpen={activeSideTab === 'tracking'}
          listingEditOpen={activeSideTab === 'listings'}
          poEditOpen={activeSideTab === 'pairing' && !hasRealZohoPoId(row)}
          photoStage="unbox_carton"
        />
      }
    />
  );

  return (
    <>
      <div
        className={cn(
          'relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden',
          // Trailing padding only (`pr-2`): overflow-hidden clips child `mr-*`.
          // Do not add `py-2` — vertical host pad stacks under StationContextBar's
          // `top-2` and drops the carton identity below the context-panel card.
          showRightPushChrome && TICKET_PUSH_HOST_PAD_CLASS,
        )}
      >
        {/* Pane-anchored always — same top-right whether Displays/Ticket/Claim
            is open. Not in the strip row (tabs · ⋮ · pencil are panel chrome).
            The Displays strip clears it with a TOP inset, not a right one, so
            its pencil can sit flush against the column's right edge. */}
        <div className={stationMoreDetailsPaneHostClass}>{paneUtilityRow}</div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <StationPanelRoot>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              {stationContextBar}
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                // The notes composer floats over the canvas on every carton now
                // that the centre is always `overview` — always reserve the
                // clearance so scroll content is never hidden under it.
                // `'pager'`: this dock also carries the step pager above the
                // composer, which makes it ~28px taller than the shared default.
                reserveScrollClearance="pager"
                // Unbox identity is the two-row `bar-stacked` card (32px taller
                // than the one-row bar), so the body needs the matching stacked
                // top clearance.
                reserveIdentityClearance="stacked"
                // The procedure column is a WORK surface: it rests against the
                // composer that commits it and grows upward as steps accumulate,
                // rather than floating at the top of an empty canvas. Nothing is
                // hidden or re-sorted to achieve it — the whole vocabulary stays
                // mounted, in order; only the stack's resting position changes.
                bodyAlign="end"
                // `tabs` is deliberately EMPTY: the strip moved to the
                // right-edge Displays column, so the carton owns the centre.
                feedback={
                  !showReceiveFeedback ? (
                    <WorkspaceActionFeedbackSlot
                      feedback={actionFeedback}
                      onDismiss={() => setActionFeedback(null)}
                    />
                  ) : null
                }
                footer={
                  showReceiveFeedback ? (
                    <div className="shrink-0 px-4 py-2 sm:px-6">
                      <div className={STATION_WORKBENCH_COLUMN}>
                        <ReceiveFeedbackRegion
                          receiving={c.receiving}
                          receiveResult={c.receiveResult}
                          responseExpanded={c.responseExpanded}
                          setResponseExpanded={c.setResponseExpanded}
                          onDismiss={() => {
                            c.setReceiveResult(null);
                            c.setResponseExpanded(false);
                          }}
                          // Replay the blocked attempt's OWN intent — waiving
                          // the photo gate must not silently promote a
                          // scan-only or local receive into a Zoho receive.
                          onPhotoPolicyOverride={(code) => {
                            const blocked =
                              c.receiveResult?.kind === 'diagnostic'
                                ? c.receiveResult.intent
                                : 'zoho_receive';
                            void c.handleReceive(blocked, { photoPolicyOverride: code });
                          }}
                        />
                      </div>
                    </div>
                  ) : null
                }
                dock={
                  // ONE elevated shell floating over the canvas — the receive
                  // split-CTA rides in the notes composer footer (no second dock
                  // row). Placement SoT = slicedActionDockWrapperClass({ docked: false }).
                  // There is no per-tab branch any more: the dock is
                  // carton-terminal, so this is the dock for every carton.
                  <div className={slicedActionDockWrapperClass({ docked: false })}>
                    <div className={`pointer-events-auto ${STATION_WORKBENCH_COLUMN}`}>
                      {terminalVm?.disabled && terminalVm.disabledReason ? (
                        <p
                          role="status"
                          className="mb-1.5 text-right text-role-caption font-semibold text-amber-700"
                        >
                          {terminalVm.disabledReason}
                        </p>
                      ) : null}
                      {/* Step pager — pinned chrome directly above the composer,
                          which is the one place a pager belongs (beside the
                          input, not trailing the content). The deck exposes a
                          single queued peek, so past the next step this and the
                          right-edge checklist are the pointer paths. */}
                      <UnboxProcedurePager row={row} />
                      <WorkspaceNotesCard
                        row={row}
                        c={c}
                        onActionFeedback={setActionFeedback}
                        // Enter in the notes field = chat Send → print+receive.
                        onPrimaryAction={
                          terminalVm ? () => void terminalVm.onClick() : undefined
                        }
                        primaryActionDisabled={Boolean(terminalVm?.disabled)}
                        trailingAction={
                          <StationTerminalDock
                            embedded
                            vm={terminalVm}
                            assignedTechId={row.assigned_tech_id}
                          />
                        }
                      />
                    </div>
                  </div>
                }
              >
                <motion.div initial={false} animate="show" variants={revealContainer}>
                  <motion.div variants={revealItem}>{unboxOverview}</motion.div>
                </motion.div>
              </StationWorkbench>
            </div>

            {row.receiving_id != null ? (
              /* Carton evidence fan — the carton's whole evidence set (arrival
                 package + unbox-carton + legacy), so a carton whose photos
                 predate the unbox_carton stage split still shows here instead of
                 reading empty. Item evidence (RECEIVING_LINE + receiving_item)
                 currently has NO desktop capture surface — see the note in
                 `photo-evidence-chain-INDEX`. New captures taken from this peek
                 still stamp `receiving_unbox_carton` (write path unaffected). */
              <ReceivingPhotoPeek
                receivingId={row.receiving_id}
                staffId={Number(staffId) || 0}
                poRef={c.poNumber || null}
                photoIntent={RECEIVING_PHOTO_LIST_INTENT_CARTON}
                onOpenMovePhotosExternal={openMovePhotosPush}
              />
            ) : null}
          </StationPanelRoot>
        </div>

        {showClaimStack ? (
          <ReceivingClaimStack
            row={row}
            initialMode={claimMode}
            prefillReason={c.returnClaimPrefill ?? undefined}
            onClose={closeClaimView}
            onTicketCreated={onClaimTicketCreated}
            onTicketUnlinked={onClaimTicketUnlinked}
          />
        ) : showTicketStack ? (
          <ReceivingTicketStack
            ticketId={ticketId!}
            receivingId={row.receiving_id ?? undefined}
            onClose={() => setTicketView(false)}
          />
        ) : showToolPush && activeToolPush ? (
          <ReceivingToolPushStack
            tool={activeToolPush}
            row={row}
            onClose={closeToolPush}
          />
        ) : showDisplays && activeSideTab ? (
          <ReceivingDisplaysPushStack
            tabs={unboxSideTabs}
            activeTab={activeSideTab}
            onTabChange={(id) => setRequestedSideTab(id as UnboxSideTab)}
            onClose={closeDisplays}
          />
        ) : showExpandStrip ? (
          // Ticket restore only — Displays toggles from the pane progress ring.
          <ReceivingPushExpandStrip>
            <ReceivingTicketExpandControl onExpand={() => setTicketView(true)} />
          </ReceivingPushExpandStrip>
        ) : null}
      </div>
    </>
  );
}
