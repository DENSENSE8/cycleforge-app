'use client';

/**
 * Right-pane workspace editor for a single receiving line — the UNBOX display,
 * and the MASTER/anchor for the workspace UX. All form state, effects, and
 * handlers live in `useUnboxLineController` (which composes the mode-agnostic
 * `useReceivingLineCore`); this file is pure composition.
 *
 * **The centre is the carton.** There is no tab strip in the workbench body:
 * `overview` (PO lines with condition + serial → label preview) IS the body, and
 * every other display — Ticket, Photos, Linkage, Claim included — lives in the
 * right-edge {@link ReceivingDisplaysPushStack}. Not a `RightRailHost` occupant
 * (`detail:receiving` keeps the float host).
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
import { ReceiveFeedbackRegion } from './ReceiveFeedbackRegion';
import { WorkspaceActionFeedbackSlot } from './WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from './InlineActionFeedbackCard';
import { ReceivingPhotoPeek } from './line-edit/ReceivingPhotoPeek';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';
import { LineCartonContextSection } from './line-edit/LineCartonContextSection';
import { useSyncedPoNote } from './line-edit/hooks/useSyncedPoNote';
import { useUnboxLineController } from './line-edit/hooks/useUnboxLineController';
import { useUnboxDisplayView } from './line-edit/hooks/useUnboxDisplayView';
import {
  clearAllUnboxRightEdgeParams,
  yieldUnboxStationPushesOnAssistantOpen,
} from './line-edit/unbox-right-edge';
import { TICKET_PUSH_HOST_PAD_CLASS } from './UnboxPushColumn';
import { useAssistantDockOpen } from '@/components/assistant/AssistantProvider';
import {
  ASSISTANT_DOCK_OPEN_EVENT,
  dispatchReceivingOpenIncomingDetails,
} from '@/utils/events';
import { ReceivingDisplaysPushStack } from './ReceivingDisplaysPushStack';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated, dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { useReturnOrderLinkage } from './line-edit/hooks/useReturnOrderLinkage';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import { StationContextBar } from '@/components/station/entity-context';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  StationPanelRoot,
  StationScanPaneHost,
  ScanStationCartonCursor,
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
  type UnboxLinkageAction,
  type UnboxPhotoAction,
  type UnboxSideTab,
  type UnboxUnitsAction,
} from './line-edit/unbox-side-tabs';
import { UnboxDisplaysEdgeToggle } from './UnboxDisplaysEdgeToggle';

export function LineEditPanel({
  row,
  staffId,
  itemTotal,
  accordionBootstrap = 'default',
  onPrevCarton,
  onNextCarton,
  prevCartonDisabled = false,
  nextCartonDisabled = false,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Total number of items in the PO — drives the "Receive" vs "Receive all" labels. */
  itemTotal?: number;
  /** Snapshot of `receiving.accordionExpand` at carton open — expands PO lines. */
  accordionBootstrap?: 'default' | 'all';
  /**
   * Carton cursor — same mapping as the left sidebar / DeskRailChromeRow:
   * ↑ previous · ↓ next via `receiving-navigate-table`.
   */
  onPrevCarton?: () => void;
  onNextCarton?: () => void;
  prevCartonDisabled?: boolean;
  nextCartonDisabled?: boolean;
}) {
  // All state, effects, and handlers live in the controller — this panel is pure
  // composition. See useUnboxLineController / useReceivingLineCore.
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    requestedDisplay: requestedSideTab,
    setDisplay: setRequestedSideTab,
    photoAction,
    claimMode,
    resolveLinkageAction,
    resolveTicketAction,
    resolveUnitsAction,
  } = useUnboxDisplayView(row.id ?? null);

  const onOpenClaim = useCallback(
    (mode: 'create' | 'link') => {
      setRequestedSideTab('ticket', { ticketAction: 'claim', claimMode: mode });
    },
    [setRequestedSideTab],
  );
  const c = useUnboxLineController(row, staffId, { itemTotal, onOpenClaim });
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  const { saveOverallNote } = useSyncedPoNote(row, setActionFeedback);
  const rowSerials = Array.isArray(row.serials) ? row.serials : [];
  const serialCount = rowSerials.length;
  const latestRowSerial = String(rowSerials[rowSerials.length - 1]?.serial_number ?? '').trim();
  const linkedOrder = useReturnOrderLinkage(c.serialInput.trim() || latestRowSerial);

  const [classifyExpand, setClassifyExpand] = useState<{
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null>(null);
  /** Carton `# ----` handoff — which pairing avenue Linkage opens on. */
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po';
    requestId: number;
  } | null>(null);

  const hasUnits = serialCount > 0 || (row.quantity_expected ?? 0) > 0;
  const trackingNumber = String(row.tracking_number ?? '').trim();
  const poIdForTracking = String(row.zoho_purchaseorder_id ?? '').trim();
  const hasTimelineTab =
    trackingNumber.length > 0 || hasUnits || row.receiving_id != null;
  const hasPoNoteTab = !c.isUnfound && row.receiving_id != null;
  const isLocalPickup = isLocalPickupFulfillment(row);
  const hasTrackingTab = !isLocalPickup;
  const hasClassifyTab = true;
  const classifyOnStrip = c.isUnfound;
  const hasListingsTab = !c.isUnfound;
  const hasLinkageTab = row.receiving_id != null;
  const sideGates = {
    hasClassifyTab,
    hasLinkageTab,
    hasListingsTab,
    hasUnits,
    hasPoNoteTab,
    hasTrackingTab,
    hasTimelineTab,
  };
  const activeSideTab = resolveUnboxSideTab(requestedSideTab, sideGates);
  const linkageAction = resolveLinkageAction(sideGates);
  const hasTicketId = c.providerTicketId != null;
  const ticketAction = resolveTicketAction(hasTicketId);
  const hasPrebox = serialCount > 0;
  const unitsAction = resolveUnitsAction({ hasPrebox });
  const showDisplays = activeSideTab != null;
  const ticketViewActive = activeSideTab === 'ticket';
  const claimViewActive = ticketViewActive && ticketAction === 'claim';

  const poNote = usePoNoteTabState({
    overallZohoNotes: row.receiving_zoho_notes ?? null,
    active: activeSideTab === 'linkage' && linkageAction === 'note',
    onSaveOverallNote: saveOverallNote,
    onLoadZohoNotes: () => c.syncCartonFromZoho(),
  });

  const clearDisplaysUrl = useCallback(() => {
    const seed =
      typeof window !== 'undefined' ? window.location.search : searchParams.toString();
    const next = new URLSearchParams(seed);
    clearAllUnboxRightEdgeParams(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
  }, [router, pathname, searchParams]);

  // AI open → yield Displays (one details column).
  const assistantOpen = useAssistantDockOpen();
  const yieldPeersRef = useRef({
    clearAllUrl: clearDisplaysUrl,
    clearDisplay: () => setRequestedSideTab(null),
  });
  yieldPeersRef.current = {
    clearAllUrl: clearDisplaysUrl,
    clearDisplay: () => setRequestedSideTab(null),
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

  const closeDisplays = useCallback(
    () => setRequestedSideTab(null),
    [setRequestedSideTab],
  );

  const openDisplays = useCallback(
    (tab: UnboxSideTab, opts?: Parameters<typeof setRequestedSideTab>[1]) => {
      setRequestedSideTab(tab, opts);
    },
    [setRequestedSideTab],
  );

  const onPhotoActionChange = useCallback(
    (action: UnboxPhotoAction) => {
      setRequestedSideTab('photos', { photoAction: action });
    },
    [setRequestedSideTab],
  );

  const onLinkageActionChange = useCallback(
    (action: UnboxLinkageAction) => {
      setRequestedSideTab('linkage', { linkageAction: action });
    },
    [setRequestedSideTab],
  );

  const onUnitsActionChange = useCallback(
    (action: UnboxUnitsAction) => {
      setRequestedSideTab('units', { unitsAction: action });
    },
    [setRequestedSideTab],
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

  const openMovePhotosDisplay = useCallback(() => {
    openDisplays('photos', { photoAction: 'move' });
  }, [openDisplays]);

  const openSendPhotoNoteDisplay = useCallback(() => {
    openDisplays('photos', { photoAction: 'send' });
  }, [openDisplays]);

  const toggleTicketView = useCallback(() => {
    if (ticketViewActive && ticketAction === 'chat') closeDisplays();
    else openDisplays('ticket', { ticketAction: hasTicketId ? 'chat' : 'claim' });
  }, [ticketViewActive, ticketAction, hasTicketId, closeDisplays, openDisplays]);

  /** Auto-match "Find ticket" → Ticket display as the main surface (claim · link). */
  const openFindTicketDisplay = useCallback(() => {
    if (hasTicketId) openDisplays('ticket', { ticketAction: 'chat' });
    else openDisplays('ticket', { ticketAction: 'claim', claimMode: 'link' });
  }, [hasTicketId, openDisplays]);

  const closeClaimView = useCallback(() => {
    c.setReturnClaimPrefill(null);
    // Stay on Ticket → Chat when a ticket exists; otherwise close Displays.
    if (hasTicketId) openDisplays('ticket', { ticketAction: 'chat' });
    else closeDisplays();
  }, [c, hasTicketId, openDisplays, closeDisplays]);

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
      // Presence-only: linked ticket → Chat (no sticky Claim / Chat·Claim tabs).
      openDisplays('ticket', { ticketAction: 'chat' });
    },
    [c, qc, row.id, row.notes, row.receiving_id, openDisplays],
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
          requestLabelEditor: () => c.requestLabelEditor(),
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
   * Carton `# ----` / Link PO → open Linkage (Link) with its PO avenue selected.
   * Click again while Linkage/Link is showing closes Displays.
   */
  const openPoPairing = useCallback(() => {
    if (activeSideTab === 'linkage' && linkageAction === 'link') {
      closeDisplays();
      return;
    }
    openDisplays('linkage', { linkageAction: 'link' });
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, [activeSideTab, linkageAction, openDisplays, closeDisplays]);

  /** Order-chip Details → Incoming connection panel on RightRailHost. */
  const openOrderConnectionDetails = useCallback(() => {
    const poId = (row.zoho_purchaseorder_id || '').trim();
    const inboundSource = (row.inbound_source_type || '').trim().toLowerCase();
    const inboundOrderId = (row.source_order_id || '').trim();
    const isInbound =
      !poId && inboundSource !== '' && inboundSource !== 'zoho' && inboundOrderId !== '';
    const shipmentId =
      typeof row.shipment_ref === 'number' && Number.isFinite(row.shipment_ref) && row.shipment_ref > 0
        ? row.shipment_ref
        : null;
    if (!poId && !isInbound && shipmentId == null) {
      // No connection identity yet — fall through to Package Pairing to link one.
      openPoPairing();
      return;
    }
    dispatchReceivingOpenIncomingDetails({
      poId: poId || null,
      poNumber: row.zoho_purchaseorder_number ?? null,
      shipmentId: poId ? null : shipmentId,
      inboundSourceType: isInbound ? inboundSource : null,
      inboundSourceOrderId: isInbound ? inboundOrderId : null,
      receivingId: row.receiving_id ?? null,
      receivingLineId: row.id ?? null,
    });
  }, [
    row.zoho_purchaseorder_id,
    row.zoho_purchaseorder_number,
    row.inbound_source_type,
    row.source_order_id,
    row.shipment_ref,
    row.receiving_id,
    row.id,
    openPoPairing,
  ]);

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
        onEditFilledSerial: (serial) => {
          openDisplays('units');
          c.setHeaderSerialEdit(serial);
        },
        onViewAllUnits: (line) => {
          if (line.id !== row.id) {
            dispatchSelectLine(line);
          }
          openDisplays('units');
        },
      }),
    [row, staffId, c, handleItemDescFeedback, handleItemDescSaved, accordionBootstrap, openDisplays],
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
        hasLinkageTab,
        poIdForTracking,
        hasPoNoteTab,
        poNote,
        photoAction,
        onPhotoActionChange,
        linkageAction,
        onLinkageActionChange,
        unitsAction,
        onUnitsActionChange,
        hasPrebox,
        claimMode,
        onCloseClaim: closeClaimView,
        onCloseTicket: closeDisplays,
        onClaimTicketCreated,
        onClaimTicketUnlinked,
        onItemDescFeedback: handleItemDescFeedback,
        onItemDescSaved: handleItemDescSaved,
        accordionBootstrap,
        classifyExpandDimension: classifyExpand?.dimension ?? null,
        classifyExpandRequestId: classifyExpand?.requestId ?? 0,
        pairingFocusTab: pairingFocus?.tab ?? null,
        pairingFocusRequestId: pairingFocus?.requestId ?? 0,
        onFindTicket: openFindTicketDisplay,
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
      hasLinkageTab,
      poIdForTracking,
      hasPoNoteTab,
      poNote,
      photoAction,
      onPhotoActionChange,
      linkageAction,
      onLinkageActionChange,
      unitsAction,
      onUnitsActionChange,
      hasPrebox,
      claimMode,
      closeClaimView,
      closeDisplays,
      onClaimTicketCreated,
      onClaimTicketUnlinked,
      handleItemDescFeedback,
      handleItemDescSaved,
      accordionBootstrap,
      classifyExpand,
      pairingFocus,
      openFindTicketDisplay,
    ],
  );

  const showRightPushChrome = showDisplays;

  const openChecklistDisplay = useCallback(
    () => openDisplays('checklist'),
    [openDisplays],
  );

  /**
   * Ring mounts on the Displays strip (`rightSlot`) — only while Displays is
   * open — so hover peek stays suppressed (`railOpen` always true at mount).
   */
  const scanProgressControl = (
    <UnboxScanProgressControl
      row={row}
      railOpen
      checklistActive={activeSideTab === 'checklist'}
      onOpenChecklist={openChecklistDisplay}
      onCloseDisplays={closeDisplays}
    />
  );

  /**
   * Scan-station chrome for Displays `←|` + carton `↑ ↓`.
   *
   * **Closed:** {@link ScanStationUtilityRail} — `←|` on top, then vertical `↑↓`.
   * **Open:** cursor on {@link UnboxPushColumn} top-right (`headerTrailing`);
   * utility rail unmounts. `→|` lives on the column band.
   *
   * Cursor mapping matches left sidebar / DeskRailChromeRow: ↑ prev · ↓ next.
   */
  const showCartonCursor = Boolean(onPrevCarton || onNextCarton);

  const utilityRailBody = !showDisplays ? (
    <div className="flex flex-col items-center gap-0 pt-0">
      <UnboxDisplaysEdgeToggle
        variant="pane-open"
        onClick={() =>
          openDisplays('ticket', {
            ticketAction: hasTicketId ? 'chat' : 'claim',
          })
        }
      />
      {showCartonCursor ? (
        <ScanStationCartonCursor
          onPrev={onPrevCarton}
          onNext={onNextCarton}
          prevDisabled={prevCartonDisabled}
          nextDisabled={nextCartonDisabled}
          orientation="vertical"
          prevTestId="unbox-carton-prev"
          nextTestId="unbox-carton-next"
          groupTestId="unbox-carton-cursor"
        />
      ) : null}
    </div>
  ) : null;

  const displaysCartonCursor = showCartonCursor ? (
    <ScanStationCartonCursor
      onPrev={onPrevCarton}
      onNext={onNextCarton}
      prevDisabled={prevCartonDisabled}
      nextDisabled={nextCartonDisabled}
      orientation="horizontal"
      size="sm"
      prevTestId="unbox-carton-prev"
      nextTestId="unbox-carton-next"
      groupTestId="unbox-carton-cursor"
    />
  ) : null;

  // TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1
  // (`docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md`). Unbox has no free
  // slot for it: the left context column already renders the Queue/Viewed/
  // History rail, and the right edge is Displays ∪ `detail:receiving` ∪ AI.
  // In-flow identity — hairline abuts PO lines (no absolute float + pt-16 air).
  const stationContextBar = (
    <StationContextBar
      placement="flow"
      identity={
        <LineCartonContextSection
          row={row}
          staffId={staffId}
          c={c}
          linkedOrderNumber={linkedOrder?.orderId ?? null}
          onToggleTicketView={toggleTicketView}
          ticketViewActive={ticketViewActive}
          onToggleClaimView={() => {
            if (claimViewActive) closeClaimView();
            else openDisplays('ticket', { ticketAction: 'claim', claimMode: 'create' });
          }}
          claimViewActive={claimViewActive}
          onOpenMovePhotosExternal={openMovePhotosDisplay}
          onSendToTicketExternal={openSendPhotoNoteDisplay}
          // Identity pills open the Displays column on their own tab — the
          // editors moved right, so the header route follows them.
          onEditTracking={hasTrackingTab ? () => openDisplays('tracking') : undefined}
          onEditListing={hasListingsTab ? () => openDisplays('listings') : undefined}
          onEditPo={openPoPairing}
          onOrderDetails={openOrderConnectionDetails}
          onClassifyPillOpen={openClassifyFromHeader}
          trackingEditOpen={activeSideTab === 'tracking'}
          listingEditOpen={activeSideTab === 'listings'}
          poEditOpen={activeSideTab === 'linkage' && linkageAction === 'link'}
          photoStage="unbox_carton"
        />
      }
    />
  );

  return (
    <>
      <StationScanPaneHost
        displaysOpen={showDisplays}
        hostPadClass={showRightPushChrome ? TICKET_PUSH_HOST_PAD_CLASS : undefined}
        hostDataAttrs={{ 'data-unbox-pane-host': true }}
        centerTestId="unbox-station-center"
        utilityRail={utilityRailBody}
        center={
          <StationPanelRoot>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              {stationContextBar}
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                // Notes composer floats over the canvas — reserve composer
                // clearance (not procedure-pager height).
                reserveScrollClearance
                // Identity is in-flow (`StationContextBar placement="flow"`)
                // above this workbench — no guessed stacked pt clearance.
                reserveIdentityClearance={false}
                // Flat data floor — no vertical air between centre surfaces.
                bodyGap="none"
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
                onOpenMovePhotosExternal={openMovePhotosDisplay}
              />
            ) : null}
          </StationPanelRoot>
        }
        displays={
          activeSideTab ? (
            <ReceivingDisplaysPushStack
              tabs={unboxSideTabs}
              activeTab={activeSideTab}
              onTabChange={(id) => {
                const tab = id as UnboxSideTab;
                if (tab === 'ticket') {
                  setRequestedSideTab('ticket', {
                    ticketAction: hasTicketId ? 'chat' : 'claim',
                  });
                  return;
                }
                setRequestedSideTab(tab);
              }}
              onClose={closeDisplays}
              headerTrailing={displaysCartonCursor}
              rightSlot={scanProgressControl}
            />
          ) : null
        }
      />
    </>
  );
}
