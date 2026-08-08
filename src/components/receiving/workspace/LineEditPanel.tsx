'use client';

/**
 * Right-pane workspace editor for a single receiving line — the UNBOX display,
 * and the MASTER/anchor for the workspace UX. All form state, effects, and
 * handlers live in `useUnboxLineController` (which composes the mode-agnostic
 * `useReceivingLineCore`); this file is pure composition.
 *
 * **The centre is the carton.** There is no tab strip in the workbench body:
 * `overview` (PO-line ledger → label preview) IS the body, and every other
 * display — Ticket, Photos, Linkage, Inventory, Claim included — lives in the
 * right-edge {@link StationDisplaysPushStack}. Not a `RightRailHost` occupant
 * (`detail:receiving` keeps the float host).
 *
 * Centre `ProcedureDeck` stays parked. Capture lives in {@link UnboxDockHost}
 * as a polymorphic flush floor: Active Step Studio XOR Resolution Terminal
 * (Print·Receive only when `activeKey === null` && not received).
 *
 * The bottom dock trailing is **carton-terminal** on settle only: Print · Receive
 * never co-mounts with an active step prompt, and never re-labels with the
 * Displays selection.
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
import {
  StationDisplaysPushStack,
  STATION_DISPLAYS_HOST_PAD_CLASS,
  type DisplaysVisitFrame,
} from '@/components/station/displays';
import { useAssistantDockOpen } from '@/components/assistant/AssistantProvider';
import { ASSISTANT_DOCK_OPEN_EVENT } from '@/utils/events';
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
import { usePoNoteTabState } from './line-edit/terminal/usePoNoteTabState';
import { resolveUnboxTerminal } from './line-edit/terminal/unbox-terminal';
import {
  buildUnboxOverview,
  buildUnboxSideTabs,
  buildUnboxStepDock,
} from './line-edit/terminal/unbox-tabs';
import { UnboxDockHost } from './line-edit/UnboxDockHost';
import { UnboxDockNotesEntry } from './line-edit/UnboxDockNotesEntry';
import { UnboxProcedurePager } from './line-edit/UnboxProcedurePager';
import { useUnboxProcedureArrowKeys } from './line-edit/useUnboxProcedureArrowKeys';
import { useUnboxProcedureSteps } from './line-edit/useUnboxProcedureSteps';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { UnboxScanProgressControl } from './UnboxScanProgressControl';
import {
  UNBOX_DISPLAY_INDEX,
  resolveUnboxDisplayNav,
  type UnboxDisplayNav,
  type UnboxLinkageAction,
  type UnboxPhotoAction,
  type UnboxSideTab,
  type UnboxTicketAction,
  type UnboxUnitsAction,
} from './line-edit/unbox-side-tabs';
import { buildUnboxDisplayIndexRows } from './line-edit/unbox-display-index';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { effectiveIntakeKind } from '@/lib/receiving/kinds/registry';
import { UnboxDisplaysUtilityRailBody } from './UnboxDisplaysUtilityRailBody';

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
  const [notesOpen, setNotesOpen] = useState(false);
  const { saveOverallNote } = useSyncedPoNote(row, setActionFeedback);
  const { focusStep, activeKey, settled: procedureSettled } = useUnboxProcedureSteps(row);
  useUnboxProcedureArrowKeys(row);
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
  const hasInventoryTab = row.receiving_id != null;
  const sideGates = {
    hasClassifyTab,
    hasLinkageTab,
    hasInventoryTab,
    hasListingsTab,
    hasUnits,
    hasPoNoteTab,
    hasTrackingTab,
    hasTimelineTab,
  };
  const { open: showDisplays, leaf: activeSideTab } = resolveUnboxDisplayNav(
    requestedSideTab,
    sideGates,
  );
  const linkageAction = resolveLinkageAction(sideGates);
  const hasTicketId = c.providerTicketId != null;
  const ticketAction = resolveTicketAction(hasTicketId);
  const hasPrebox = serialCount > 0;
  const unitsAction = resolveUnitsAction({ hasPrebox });
  const ticketViewActive = activeSideTab === 'ticket';
  const claimViewActive = ticketViewActive && ticketAction === 'claim';

  /** Visit snapshot for Displays ← → — nest verbs ride with the leaf tab. */
  const displaysVisitFrame = useMemo((): DisplaysVisitFrame => {
    const tab = activeSideTab ?? UNBOX_DISPLAY_INDEX;
    if (tab === UNBOX_DISPLAY_INDEX) return { tab: UNBOX_DISPLAY_INDEX };
    const nest: Record<string, string> = {};
    if (tab === 'photos') nest.photoAction = photoAction;
    if (tab === 'linkage') nest.linkageAction = linkageAction;
    if (tab === 'units') nest.unitsAction = unitsAction;
    if (tab === 'ticket') {
      nest.ticketAction = ticketAction;
      if (ticketAction === 'claim') nest.claimMode = claimMode;
    }
    return { tab, nest };
  }, [
    activeSideTab,
    photoAction,
    linkageAction,
    unitsAction,
    ticketAction,
    claimMode,
  ]);

  const onDisplaysVisitNavigate = useCallback(
    (frame: DisplaysVisitFrame) => {
      if (frame.tab === UNBOX_DISPLAY_INDEX) {
        setRequestedSideTab(UNBOX_DISPLAY_INDEX);
        return;
      }
      const nest = frame.nest ?? {};
      const tab = frame.tab as UnboxSideTab;
      setRequestedSideTab(tab, {
        photoAction: nest.photoAction as UnboxPhotoAction | undefined,
        linkageAction: nest.linkageAction as UnboxLinkageAction | undefined,
        unitsAction: nest.unitsAction as UnboxUnitsAction | undefined,
        ticketAction: nest.ticketAction as UnboxTicketAction | undefined,
        claimMode:
          nest.claimMode === 'link' || nest.claimMode === 'create'
            ? nest.claimMode
            : undefined,
      });
    },
    [setRequestedSideTab],
  );

  const displaysHistoryScopeKey = row.receiving_id ?? row.id;
  const returnIntake = isReturnIntake(row);
  const linkagePaired =
    Boolean(String(row.zoho_purchaseorder_id ?? '').trim()) ||
    Boolean(String(row.source_order_id ?? '').trim());
  const classifyLabel = (() => {
    const kind = effectiveIntakeKind(
      row.intake_type || row.receiving_type,
      row.carton_intake_type,
    );
    const bits: string[] = [];
    if (row.is_priority) bits.push('Priority');
    if (kind) bits.push(kind);
    return bits.length > 0 ? bits.join(' · ') : null;
  })();
  const inventoryReceived =
    typeof row.quantity_received === 'number' ? row.quantity_received : null;
  const inventoryExpected =
    typeof row.quantity_expected === 'number' ? row.quantity_expected : null;
  const displayIndexRows = useMemo(
    () =>
      buildUnboxDisplayIndexRows(sideGates, {
        hasTicketId,
        photoCount: typeof row.photo_count === 'number' ? row.photo_count : null,
        classifyLabel,
        serialCount,
        linkagePaired,
        isUnfound: Boolean(c.isUnfound),
        trackingPresent: trackingNumber.length > 0,
        isReturnIntake: returnIntake,
        inventoryReceived,
        inventoryExpected,
      }),
    [
      sideGates,
      hasTicketId,
      row.photo_count,
      classifyLabel,
      serialCount,
      linkagePaired,
      c.isUnfound,
      trackingNumber,
      returnIntake,
      inventoryReceived,
      inventoryExpected,
    ],
  );

  const poNote = usePoNoteTabState({
    overallZohoNotes: row.receiving_zoho_notes ?? null,
    active:
      (activeSideTab === 'linkage' && linkageAction === 'note') ||
      activeSideTab === 'inventory',
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
    (tab: UnboxDisplayNav, opts?: Parameters<typeof setRequestedSideTab>[1]) => {
      setRequestedSideTab(tab, opts);
    },
    [setRequestedSideTab],
  );

  /** `←|` Open displays — Root Index (contextual jumps pass a leaf id). */
  const openDisplaysIndex = useCallback(
    () => openDisplays(UNBOX_DISPLAY_INDEX),
    [openDisplays],
  );

  const onPhotoActionChange = useCallback(
    (action: UnboxPhotoAction) => {
      setRequestedSideTab('photos', { photoAction: action });
    },
    [setRequestedSideTab],
  );

  // Item-photos step → open listing vs bench Compare on Displays. Never yank
  // Ticket (claim/chat) or interrupt a Move/Send drill-down.
  const itemPhotosCompareOpenedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!procedureSettled || activeKey !== 'item_photos') {
      if (activeKey !== 'item_photos') itemPhotosCompareOpenedRef.current = null;
      return;
    }
    if (itemPhotosCompareOpenedRef.current === row.id) return;
    if (activeSideTab === 'ticket') return;
    if (activeSideTab === 'photos' && (photoAction === 'move' || photoAction === 'send')) {
      return;
    }
    itemPhotosCompareOpenedRef.current = row.id;
    openDisplays('photos', { photoAction: 'compare' });
  }, [
    procedureSettled,
    activeKey,
    activeSideTab,
    photoAction,
    row.id,
    openDisplays,
  ]);

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

  /**
   * Order-chip Details → Unbox Displays Inventory dossier (not Incoming
   * RightRailHost / external Zoho). Unpaired cartons still open Inventory so
   * Pair inventory CTA is one click away.
   */
  const openOrderConnectionDetails = useCallback(() => {
    if (activeSideTab === 'inventory') {
      closeDisplays();
      return;
    }
    openDisplays('inventory');
  }, [activeSideTab, closeDisplays, openDisplays]);

  useEffect(() => {
    setActionFeedback(null);
    setNotesOpen(false);
  }, [row.id]);

  const hasItemNote = Boolean((c.itemNote || row.notes || '').trim());

  const embeddedTerminal = (
    <StationTerminalDock
      embedded
      vm={terminalVm}
      assignedTechId={row.assigned_tech_id}
    />
  );

  const openNotes = useCallback(() => {
    setNotesOpen(true);
  }, []);

  const closeNotes = useCallback(() => {
    setNotesOpen(false);
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  }, []);

  const onFocusCaptureStep = useCallback(
    (key: 'serial' | 'condition' | 'item_photos') => {
      focusStep(key);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    },
    [focusStep],
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
        accordionBootstrap,
        onFocusCaptureStep,
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
        onOpenReturnHistory: () => openDisplays('timeline'),
      }),
    [
      row,
      staffId,
      c,
      accordionBootstrap,
      onFocusCaptureStep,
      openDisplays,
    ],
  );

  const stepDock = useMemo(
    () => buildUnboxStepDock({ row, staffId, c }),
    [row, staffId, c],
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
        hasInventoryTab,
        poIdForTracking,
        hasPoNoteTab,
        poNote,
        photoAction,
        onPhotoActionChange,
        linkageAction,
        onLinkageActionChange,
        onInventoryChangePo: openPoPairing,
        onInventorySync: async () => {
          await c.refreshInventoryDossier();
        },
        inventorySyncing: Boolean(c.inventoryRefreshing),
        unitsAction,
        onUnitsActionChange,
        hasPrebox,
        claimMode,
        onCloseClaim: closeClaimView,
        onCloseTicket: closeDisplays,
        onClaimTicketCreated,
        onClaimTicketUnlinked,
        accordionBootstrap,
        classifyExpandDimension: classifyExpand?.dimension ?? null,
        classifyExpandRequestId: classifyExpand?.requestId ?? 0,
        pairingFocusTab: pairingFocus?.tab ?? null,
        pairingFocusRequestId: pairingFocus?.requestId ?? 0,
        onFindTicket: openFindTicketDisplay,
        onOpenReturnHistory: () => openDisplays('timeline'),
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
      hasInventoryTab,
      poIdForTracking,
      hasPoNoteTab,
      poNote,
      photoAction,
      onPhotoActionChange,
      linkageAction,
      onLinkageActionChange,
      openPoPairing,
      unitsAction,
      onUnitsActionChange,
      hasPrebox,
      claimMode,
      closeClaimView,
      closeDisplays,
      onClaimTicketCreated,
      onClaimTicketUnlinked,
      accordionBootstrap,
      classifyExpand,
      pairingFocus,
      openFindTicketDisplay,
      openDisplays,
    ],
  );

  const showRightPushChrome = showDisplays;

  const openChecklistDisplay = useCallback(
    () => openDisplays('checklist'),
    [openDisplays],
  );

  /**
   * Live procedure % — under-dock bottom-right. Opens the Checklist Displays
   * leaf in-station (never a route hop).
   */
  const scanProgressControl = (
    <UnboxScanProgressControl
      row={row}
      railOpen={showDisplays}
      checklistActive={showDisplays && activeSideTab === 'checklist'}
      onOpenChecklist={openChecklistDisplay}
      onCloseDisplays={closeDisplays}
    />
  );

  /**
   * Scan-station chrome for Displays `←|` + carton `↑ ↓`.
   *
   * **Closed:** {@link ScanStationUtilityRail} — vertical `↑↓` top, `←|` in the
   * bottom footer (left-dock expand twin).
   * **Open:** cursor on {@link UnboxPushColumn} top-right (`headerTrailing`);
   * utility rail unmounts. `→|` lives on the Displays footer search trailing
   * track (left-rail filter-collapse twin).
   *
   * Cursor mapping matches left sidebar / DeskRailChromeRow: ↑ prev · ↓ next.
   */
  const showCartonCursor = Boolean(onPrevCarton || onNextCarton);

  const utilityRailBody = !showDisplays ? (
    <UnboxDisplaysUtilityRailBody
      onOpenDisplays={openDisplaysIndex}
      cartonCursor={
        showCartonCursor ? (
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
        ) : null
      }
    />
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
  // In-flow identity — hairline abuts PO lines (no absolute float + clearance air).
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
          // Pill click stays send-to-phone; multi-verbs live in Displays Actions.
          suppressPhotoHoverGallery
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
        hostPadClass={showRightPushChrome ? STATION_DISPLAYS_HOST_PAD_CLASS : undefined}
        hostDataAttrs={{ 'data-unbox-pane-host': true }}
        centerTestId="unbox-station-center"
        utilityRail={utilityRailBody}
        center={
          <StationPanelRoot density="floor">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              {stationContextBar}
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                // Host + under-dock pager is taller than notes-only —
                // pager clearance keeps PO lines / label above the float.
                reserveScrollClearance="pager"
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
                // dock float stack above UnboxDockHost (an absolute dock would
                // cover an in-flow footer).
                dock={
                  // Flush floor instrument — step studio XOR Print·Receive.
                  // Float is Unbox-owned: inset-x-0, safe-area floor only.
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-fab pb-[env(safe-area-inset-bottom,0px)] pt-0" // ds-allow-spacing: fixed-overlay safe-area geometry
                    data-unbox-dock-float
                  >
                    <div className={`pointer-events-auto w-full min-w-0 ${STATION_WORKBENCH_COLUMN}`}>
                      {terminalVm?.disabled && terminalVm.disabledReason && !activeKey ? (
                        <p
                          role="status"
                          className="mb-1 text-right text-role-caption font-semibold text-amber-700"
                        >
                          {terminalVm.disabledReason}
                        </p>
                      ) : null}
                      {showReceiveFeedback ? (
                        <div className="mb-1">
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
                      <UnboxDockHost
                        mode={notesOpen ? 'notes' : 'entry'}
                        onOpenNotes={openNotes}
                        onCloseNotes={closeNotes}
                        hasItemNote={hasItemNote}
                        showNotesToggle={false}
                        expandBand={activeKey === 'classify'}
                        stepContext={<UnboxProcedurePager row={row} />}
                        leading={stepDock}
                        trailing={!activeKey ? embeddedTerminal : null}
                        progress={scanProgressControl}
                        notesEntry={
                          <UnboxDockNotesEntry
                            value={c.itemNote}
                            onChange={c.setItemNote}
                            onSave={() => {
                              const next = c.itemNote;
                              if (next === (row.notes || '')) return false;
                              void c.patch({ notes: next });
                              return true;
                            }}
                            onDone={closeNotes}
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
          showDisplays ? (
            <StationDisplaysPushStack
              tabs={unboxSideTabs}
              activeTab={activeSideTab ?? UNBOX_DISPLAY_INDEX}
              indexRows={displayIndexRows}
              visitFrame={displaysVisitFrame}
              onVisitNavigate={onDisplaysVisitNavigate}
              historyScopeKey={displaysHistoryScopeKey}
              onTabChange={(id) => {
                if (id === UNBOX_DISPLAY_INDEX) {
                  setRequestedSideTab(UNBOX_DISPLAY_INDEX);
                  return;
                }
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
            />
          ) : null
        }
      />
    </>
  );
}
