'use client';

/**
 * Right-pane workspace editor for a single receiving line — the UNBOX display,
 * and the MASTER/anchor for the workspace UX. All form state, effects, and
 * handlers live in `useUnboxLineController` (which composes the mode-agnostic
 * `useReceivingLineCore`); this file is pure composition.
 *
 * **The centre is the carton.** There is no tab strip in the workbench body:
 * `overview` (PO lines with condition + serial → label preview) IS the body, and
 * every other display — Package Pairing included — lives in the right-edge
 * {@link ReceivingDisplaysPushStack} — a peer of Ticket / Claim / tool push, not
 * a `RightRailHost` occupant (the occupant slot stays single-occupancy and
 * `detail:receiving` keeps the float host).
 *
 * The guided ProcedureDeck / step dock is parked on the `unbox-work` lane
 * (`../cycleforge-unbox`). Main dogfood ships this PO-line centre.
 *
 * The bottom dock is **carton-terminal**: notes + Print · Receive. It does not
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
import {
  clearUnboxPeerRightEdgeSurfaces,
  yieldUnboxStationPushesOnAssistantOpen,
} from './line-edit/unbox-right-edge';
import {
  ReceivingTicketStack,
  TICKET_PUSH_HOST_PAD_CLASS,
} from './ReceivingTicketStack';
import { useAssistantDockOpen } from '@/components/assistant/AssistantProvider';
import {
  ASSISTANT_DOCK_OPEN_EVENT,
  dispatchAssistantDockClose,
} from '@/utils/events';
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
import {
  buildUnboxOverview,
  buildUnboxSideTabs,
} from './line-edit/terminal/unbox-tabs';
import { WorkspaceNotesCard } from './line-edit/WorkspaceNotesCard';
import { UnboxScanProgressControl } from './UnboxScanProgressControl';
import {
  resolveUnboxSideTab,
  type UnboxSideTab,
} from './line-edit/unbox-side-tabs';
import { hasRealZohoPoId } from '@/lib/receiving/intake-items-routing';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';

export function LineEditPanel({
  row,
  staffId,
  itemTotal,
  accordionBootstrap = 'default',
  onPrevCarton,
  onNextCarton,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Total number of items in the PO — drives the "Receive" vs "Receive all" labels. */
  itemTotal?: number;
  /** Snapshot of `receiving.accordionExpand` at carton open — expands PO lines. */
  accordionBootstrap?: 'default' | 'all';
  /**
   * Record cursor for the CARTON, rendered in the pane-anchored utility row
   * (top-right). The progress ring peeks procedure % from the Displays strip.
   * `ReceivingLineWorkspace` has carried these since the workspace was built but
   * only ever handed them to Triage — Unbox had no visible prev/next at all.
   *
   * **There is deliberately no `onCloseCarton` here.** Carton dismiss is the
   * identity bar's leading `◁` (`CartonContextCard` `onExitToList`), which
   * dispatches the same `receiving-workspace-close` the pane handler listens
   * for. The `→|` that used to sit in this row wore panel semantics and closed
   * the carton — see the pane utility row's docblock.
   */
  onPrevCarton?: () => void;
  onNextCarton?: () => void;
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

  // Which right-edge display is showing, from `?display=`. `null` = the column
  // is closed — one piece of state, URL-durable like its Ticket / Claim
  // siblings, so a reload or a shared link lands on the same display.
  const { requestedDisplay: requestedSideTab, setDisplay: setRequestedSideTab } =
    useUnboxDisplayView(row.id ?? null);
  const [classifyExpand, setClassifyExpand] = useState<{
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null>(null);
  /** Carton `# ----` handoff — which pairing tab the display should open on. */
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po';
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

  // AI open → yield every Unbox station right-edge surface (one details column).
  const assistantOpen = useAssistantDockOpen();
  const yieldPeersRef = useRef({
    clearAllUrl: () => setClaimView(false),
    clearDisplay: () => setRequestedSideTab(null),
    closeToolPush: c.closeToolPush,
  });
  yieldPeersRef.current = {
    clearAllUrl: () => setClaimView(false),
    clearDisplay: () => setRequestedSideTab(null),
    closeToolPush: c.closeToolPush,
  };
  useEffect(() => {
    const onOpen = () => {
      yieldUnboxStationPushesOnAssistantOpen(yieldPeersRef.current);
    };
    window.addEventListener(ASSISTANT_DOCK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_DOCK_OPEN_EVENT, onOpen);
  }, []);
  const prevAssistantOpenRef = useRef(false);
  useEffect(() => {
    const opened = assistantOpen && !prevAssistantOpenRef.current;
    prevAssistantOpenRef.current = assistantOpen;
    if (!opened) return;
    yieldUnboxStationPushesOnAssistantOpen(yieldPeersRef.current);
  }, [assistantOpen]);

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
    dispatchAssistantDockClose();
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
   * **The intent travels as a PROP, never as a timed event.** This dispatched
   * `RECEIVING_OPEN_PAIRING_PO_EVENT` inside a `requestAnimationFrame` until
   * 2026-08-02, on the theory that one frame was enough for `CartonMatchHub` to
   * mount and subscribe. It is not: opening the display is a `router.replace`,
   * so the hub mounts a navigation later — the event always fired into an empty
   * room and the display opened on its default tab. Measured on the QA org, not
   * reasoned about.
   *
   * A request id (not a bare flag) so clicking the chip again while pairing is
   * already showing re-selects the PO tab. Same handoff shape as
   * {@link openClassifyFromHeader} → `TriageClassifySection`, which is the
   * house pattern for exactly this.
   */
  const openPoPairing = useCallback(() => {
    if (activeSideTab === 'pairing') {
      closeDisplays();
      return;
    }
    openDisplays('pairing');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
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
    [row, staffId, c, handleItemDescFeedback, handleItemDescSaved, accordionBootstrap],
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
        pairingFocusTab: pairingFocus?.tab ?? null,
        pairingFocusRequestId: pairingFocus?.requestId ?? 0,
      }),
    [
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
      handleItemDescFeedback,
      handleItemDescSaved,
      accordionBootstrap,
      classifyExpand,
      pairingFocus,
    ],
  );

  // Parked ticket expand strip removed 2026-08-03 — reopen ticket from carton
  // identity Reply; Displays opens from the dock-anchored progress ring.
  const showRightPushChrome =
    showClaimStack || showTicketStack || showToolPush || showDisplays;

  const openChecklistDisplay = useCallback(
    () => openDisplays('checklist'),
    [openDisplays],
  );

  /**
   * A push column actually occupies the right edge. ONE derivation — the ring
   * suppresses its hover peek on it. Ticket reopen is carton identity, not a
   * parked strip on this edge.
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
   * The pane utility row — carton `↑ ↓` only, pinned to the pane's top-right.
   * The scan-progress ring peeks optional procedure % (checklist display).
   *
   * **The `→|` dismiss left this row on 2026-08-02, and it is not coming back.**
   * It closed the whole carton while its glyph (`→|` = park to the right edge),
   * its corner (the open push column's) and its `railOpen` gating all said
   * "collapse this panel". An operator who reached for it lost their carton. It
   * now lives in {@link UnboxPushColumn}'s header band at the **column's**
   * top-left and closes the column — the job every signal on it already claimed.
   * Carton dismiss was never only here: the identity bar's leading `◁` ("Back to
   * list", `CartonContextCard` `onExitToList`) is the carton's own exit, it is
   * permanent, it is the leftmost control on the pane, and it points the right
   * way. Two carton-closes was the surplus; the right one survived.
   *
   * **The cursor is NOT rail-scoped** (same ruling, reversing the gate written
   * the day before). `↑ ↓` step the CARTON, which is on screen whether or not a
   * column is. They were only ever gated on `railOpen` because they shared a
   * component with the panel-shaped `→|`; with it gone the gate was hiding
   * prev/next behind "open a display first" for no reason an operator could
   * infer. Always mounted when the host passes prev/next.
   *
   * Honest absence: a host that passes no cursor mounts nothing here.
   */
  const showCartonCursor = Boolean(onPrevCarton || onNextCarton);

  const paneUtilityRow = showCartonCursor ? (
    <div className="flex items-center">
      {/* One TIGHT pair, not two loose buttons. `xs` (24px) with no gap puts
          ~8px between glyphs; `sm` + `gap-0.5` put ~14px there, which read as
          unrelated controls rather than one cursor group.

          **`↑` is NEXT and `↓` is PREVIOUS** (inverted 2026-08-02). The queue
          behind the carton reads top-to-bottom with the newest work at the top,
          so advancing through it moves the cursor UP the list — the chevron
          points the way the operator is travelling, not the way the array index
          counts. Aria label, tooltip and testid all follow the ACTION; only the
          glyph is positional. */}
      <div className="flex items-center gap-0">
        {onNextCarton ? (
          <HoverTooltip label="Next carton" asChild>
            <IconButton
              size="xs"
              tone="neutral"
              ariaLabel="Next carton"
              icon={<ChevronUp className="h-4 w-4" />}
              onClick={onNextCarton}
              data-testid="unbox-carton-next"
            />
          </HoverTooltip>
        ) : null}
        {onPrevCarton ? (
          <HoverTooltip label="Previous carton" asChild>
            <IconButton
              size="xs"
              tone="neutral"
              ariaLabel="Previous carton"
              icon={<ChevronDown className="h-4 w-4" />}
              onClick={onPrevCarton}
              data-testid="unbox-carton-prev"
            />
          </HoverTooltip>
        ) : null}
      </div>
    </div>
  ) : null;

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
          // `top-0` and drops the carton identity below the header hairline.
          showRightPushChrome && TICKET_PUSH_HOST_PAD_CLASS,
        )}
        data-unbox-pane-host
      >
        {/* Pane-anchored carton cursor (↑↓) — top-right. */}
        {paneUtilityRow ? (
          <div className={stationMoreDetailsPaneHostClass}>{paneUtilityRow}</div>
        ) : null}
        {/* `unbox-station-center`: Phase 5 flush E2E measures this column — not
            `receiving-workspace`, which wraps center + station push and would
            report a false workspace|push seam equal to the push width. */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          data-testid="unbox-station-center"
        >
          <StationPanelRoot>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              {stationContextBar}
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                // Notes composer floats over the canvas — reserve composer
                // clearance (not procedure-pager height).
                reserveScrollClearance
                // Unbox identity is the two-row family face (32px taller than
                // the retired one-row bar), so the body needs the matching
                // stacked top clearance.
                reserveIdentityClearance="stacked"
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
                // footer left null — ReceiveFeedbackRegion rides in the absolute
                // dock float stack above the notes shell (an absolute dock would
                // cover an in-flow footer).
                dock={
                  // ONE elevated shell floating over the canvas — notes + Print ·
                  // Receive. Placement SoT = slicedActionDockWrapperClass({ docked: false }).
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
                      <div className="mb-1.5 flex justify-end">{scanProgressControl}</div>
                      {showReceiveFeedback ? (
                        <div className="mb-1.5">
                          <ReceiveFeedbackRegion
                            receiving={c.receiving}
                            receiveResult={c.receiveResult}
                            responseExpanded={c.responseExpanded}
                            setResponseExpanded={c.setResponseExpanded}
                            onDismiss={() => {
                              c.setReceiveResult(null);
                              c.setResponseExpanded(false);
                            }}
                            onPhotoPolicyOverride={(code) => {
                              const blocked =
                                c.receiveResult?.kind === 'diagnostic'
                                  ? c.receiveResult.intent
                                  : 'zoho_receive';
                              void c.handleReceive(blocked, { photoPolicyOverride: code });
                            }}
                          />
                        </div>
                      ) : null}
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
        ) : null}
      </div>
    </>
  );
}
