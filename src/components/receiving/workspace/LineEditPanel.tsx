'use client';

/** Right-pane workspace editor for a single receiving line — the UNBOX display, and the MASTER/anchor for the workspace UX. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  staggerRevealContainer,
  STAGGER_REVEAL_STEP,
} from '@/design-system/primitives/StaggerReveal';
import { ReceiveFeedbackRegion } from './ReceiveFeedbackRegion';
import { WeldedStack } from './WeldedFeedbackPanel';
import type { ReceiveResult } from './line-edit/hooks/useReceiveAction';
import { WorkspaceActionFeedbackSlot } from './WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from './InlineActionFeedbackCard';
import { ReceivingPhotoPeek } from './line-edit/ReceivingPhotoPeek';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import { LineCartonContextSection } from './line-edit/LineCartonContextSection';
import { useSyncedPoNote } from './line-edit/hooks/useSyncedPoNote';
import { useUnboxLineController } from './line-edit/hooks/useUnboxLineController';
import { CLAIM_RENDERS_IN_BOTH } from './claim/claim-surfaces';
import { useUnboxDisplayView } from './line-edit/hooks/useUnboxDisplayView';
import { resolveUnboxTicketContextOpen } from './line-edit/unbox-ticket-context';
import {
  shouldCockpitYieldToDisplaysIndex,
  shouldItemPhotosCompareAutoOpen,
} from './line-edit/unbox-displays-nav';
import {
  StationDisplaysParkedRail,
  StationDisplaysPushStack,
  STATION_DISPLAYS_HOST_PAD_CLASS,
  isDisplaysHostedLeaf,
  type DisplaysVisitFrame,
} from '@/components/station/displays';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchLineUpdated, dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { useReturnOrderLinkage } from './line-edit/hooks/useReturnOrderLinkage';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import { stationComposerArrivalMode } from '@/lib/composer/station-composer-mode';
import { StationContextBar } from '@/components/station/entity-context';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  StationPanelRoot,
  StationScanPaneHost,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import { usePoNoteTabState } from './line-edit/terminal/usePoNoteTabState';
import { resolveUnboxTerminal } from './line-edit/terminal/unbox-terminal';
import {
  buildUnboxOverview,
  buildUnboxSideTabs,
  preloadUnboxDisplayLeafChunks,
} from './line-edit/terminal/unbox-tabs';
import { WorkspaceNotesCard } from './line-edit/WorkspaceNotesCard';
import { useZendeskNextTicketNumber } from '@/hooks/useZendeskQueries';
import { formatDraftTicketNumber } from '@/lib/support/next-ticket-number';
import { UnboxDisplaysActionFloor } from './line-edit/UnboxDisplaysActionFloor';
import { useUnboxProcedureArrowKeys } from './line-edit/useUnboxProcedureArrowKeys';
import { useUnboxProcedureSteps } from './line-edit/useUnboxProcedureSteps';
import { useUnboxMiddleCartonNav } from './line-edit/useUnboxMiddleCartonNav';
import { nudgeUnboxPrintReceive } from '@/lib/keyboard/shortcut-nudge';
import { stationDisplaysOpenWouldParkRail } from '@/lib/right-rail/frame';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { scheduleFocusUnboxCaptureSerial } from './line-edit/focus-unbox-capture-serial';
import {
  UNBOX_DISPLAY_INDEX,
  resolveUnboxDisplayNav,
  type UnboxDisplayNav,
  type UnboxLinkageAction,
  type UnboxPhotoAction,
  type UnboxSideTab,
  type UnboxTicketAction,
} from './line-edit/unbox-side-tabs';
import { buildUnboxDisplayIndexRows } from './line-edit/unbox-display-index';
import { StationDisplaysUtilityRail } from '@/components/station/displays';
import {
  useAutoCollapse,
  useBandCollapse,
  useLineCollapse,
} from '@/components/station/collapse';
import {
  StationTicketPane,
  useStationComposerMode,
} from '@/components/composer';
import { UnboxReturnCallout } from '@/components/receiving/unbox/UnboxReturnCallout';

export function LineEditPanel({
  row,
  staffId,
  itemTotal,
  accordionBootstrap = 'default',
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
}) {
  // All state, effects, and handlers live in the controller — this panel is pure
  // composition. See useUnboxLineController / useReceivingLineCore.
  const qc = useQueryClient();
  const {
    requestedDisplay: requestedSideTab,
    setDisplay: setRequestedSideTab,
    photoAction,
    claimMode,
    resolveLinkageAction,
    resolveTicketAction,
    // Key the Displays column on the CARTON, not the active child line — switching
    // between sibling PO lines of the same parent carton must not close+reopen the
    // column (the right-rail flash). A genuinely different carton still clears it.
  } = useUnboxDisplayView(row.receiving_id ?? row.id ?? null);

  const bandCollapse = useAutoCollapse();
  // Which BAND is open, layered on the centre-wide rule above — so the operator
  // can open Items alone out of a fully collapsed stack. Label starts shut:
  // the row IS show / hide for the sticker.
  const bands = useBandCollapse(bandCollapse, { label: false });
  // Per-LINE disclosure inside the Items band. Same module as the band rules,
  // one altitude down: the line the operator is working is open, its siblings
  // are identity faces, and "Collapse all" reaches both.
  const lineCollapse = useLineCollapse(row.id ?? null);
  const { mode: composerMode, setMode: setComposerMode } = useStationComposerMode();
  const ticketMode = composerMode === 'ticket';
  const [ticketClaimMode, setTicketClaimMode] = useState<'create' | 'link'>('link');

  /* The composer no longer collapses the context blocks — operator ruling, 2026-08-30. */

  // New line → sticker hidden again (the Label row starts shut).
  useEffect(() => {
    bands.close('label');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close is stable enough; only the line flips
  }, [row.id]);

  /** Filing a claim opens it in BOTH surfaces — the transitional rule and its end date live in {@link CLAIM_RENDERS_IN_BOTH}, shared with… */
  const onOpenClaim = useCallback(
    (mode: 'create' | 'link') => {
      // Centre — where the claim is going.
      setTicketClaimMode(mode);
      setComposerMode('ticket');
      // Right rail — where the floor still looks for it.
      if (CLAIM_RENDERS_IN_BOTH) {
        setRequestedSideTab('ticket', { ticketAction: 'claim', claimMode: mode });
      }
    },
    [setComposerMode, setRequestedSideTab],
  );
  const c = useUnboxLineController(row, staffId, { itemTotal, onOpenClaim });
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  const { saveOverallNote } = useSyncedPoNote(row, setActionFeedback);
  const {
    focusStep,
    activeKey,
    railLeaf,
    settled: procedureSettled,
    steps: procedureSteps,
  } = useUnboxProcedureSteps(row);
  useUnboxProcedureArrowKeys(row);
  const procedurePercent = useMemo(() => {
    const total = procedureSteps.length;
    if (total === 0) return 0;
    const done = procedureSteps.reduce((n, s) => n + (s.state === 'done' ? 1 : 0), 0);
    return Math.round((done / total) * 100);
  }, [procedureSteps]);
  const rowSerials = Array.isArray(row.serials) ? row.serials : [];
  const serialCount = rowSerials.length;
  const latestRowSerial = String(rowSerials[rowSerials.length - 1]?.serial_number ?? '').trim();
  const linkedOrder = useReturnOrderLinkage(c.serialInput.trim() || latestRowSerial);

  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po';
    requestId: number;
  } | null>(null);
  /** Photo Link handoff — PO item and/or carton aspect for Photos → Link leaf. */
  const [photoLinkTarget, setPhotoLinkTarget] = useState<{
    lineId?: number | null;
    cartonAspect?: PhotoAspect | null;
    requestId: number;
  } | null>(null);

  const hasUnits = serialCount > 0 || (row.quantity_expected ?? 0) > 0;
  const trackingNumber = String(row.tracking_number ?? '').trim();
  const hasPoNoteTab = !c.isUnfound && row.receiving_id != null;
  const isLocalPickup = isLocalPickupFulfillment(row);
  const hasTrackingTab = !isLocalPickup;
  const hasListingsTab = !c.isUnfound;
  const hasLinkageTab = row.receiving_id != null;
  const hasInventoryTab = row.receiving_id != null;
  const sideGates = {
    hasLinkageTab,
    hasInventoryTab,
    hasListingsTab,
    hasUnits,
    hasPoNoteTab,
    hasTrackingTab,
  };
  const { open: showDisplays, leaf: activeSideTab } = resolveUnboxDisplayNav(
    requestedSideTab,
    sideGates,
  );
  /** Carton leaf is null on Look — pass the hosted id through so PushStack paints skins, not the index. */
  const displaysActiveTab =
    requestedSideTab != null && isDisplaysHostedLeaf(requestedSideTab)
      ? requestedSideTab
      : (activeSideTab ?? UNBOX_DISPLAY_INDEX);
  const checklistSelected = showDisplays && activeSideTab === 'checklist';

  // Warm deferred Photos / Ticket chunks while the
  // operator is on the index — cold dynamic() otherwise paints leaf ← with an
  // empty body until the import lands (mouse/keyboard triage lag).
  useEffect(() => {
    if (!showDisplays) return;
    preloadUnboxDisplayLeafChunks();
  }, [showDisplays]);

  const linkageAction = resolveLinkageAction(sideGates);
  const hasTicketId = c.providerTicketId != null;
  const ticketAction = resolveTicketAction(hasTicketId);
  const ticketViewActive = ticketMode && hasTicketId;
  const claimViewActive = ticketMode && !hasTicketId;

  // DRAFT TICKET NUMBER. Only `WorkspaceNotesCard` knows whether the claim body has
  // been typed, so it reports up and the number is fetched only once there is
  // something to file — never on every carton an operator merely opens.
  const [ticketDraftFilled, setTicketDraftFilled] = useState(false);
  const draftingClaim = claimViewActive && ticketDraftFilled;
  const nextTicketNumber = useZendeskNextTicketNumber(draftingClaim);
  const draftTicketNumber = draftingClaim
    ? formatDraftTicketNumber(nextTicketNumber.data ?? null)
    : null;

  /** Carton open → the composer is on UNBOX. */
  useEffect(() => {
    const hasTicket = c.providerTicketId != null;
    const ctx = resolveUnboxTicketContextOpen(row, hasTicket);
    if (ctx.open) setTicketClaimMode(ctx.claimMode);
    setComposerMode(stationComposerArrivalMode());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carton gate
  }, [row.receiving_id ?? row.id]);

  /** Visit snapshot for Displays ← → — nest verbs ride with the leaf tab. */
  const displaysVisitFrame = useMemo((): DisplaysVisitFrame => {
    const tab = displaysActiveTab;
    if (tab === UNBOX_DISPLAY_INDEX || isDisplaysHostedLeaf(tab)) return { tab };
    const nest: Record<string, string> = {};
    if (tab === 'photos') nest.photoAction = photoAction;
    if (tab === 'linkage') nest.linkageAction = linkageAction;
    if (tab === 'ticket') {
      nest.ticketAction = ticketAction;
      if (ticketAction === 'claim') nest.claimMode = claimMode;
    }
    return { tab, nest };
  }, [
    displaysActiveTab,
    photoAction,
    linkageAction,
    ticketAction,
    claimMode,
  ]);

  const onDisplaysVisitNavigate = useCallback(
    (frame: DisplaysVisitFrame) => {
      if (frame.tab === UNBOX_DISPLAY_INDEX) {
        setRequestedSideTab(UNBOX_DISPLAY_INDEX);
        return;
      }
      if (isDisplaysHostedLeaf(frame.tab)) {
        setRequestedSideTab(frame.tab as UnboxDisplayNav);
        return;
      }
      const nest = frame.nest ?? {};
      const tab = frame.tab as UnboxSideTab;
      setRequestedSideTab(tab, {
        photoAction: nest.photoAction as UnboxPhotoAction | undefined,
        linkageAction: nest.linkageAction as UnboxLinkageAction | undefined,
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
  const linkagePaired =
    Boolean(String(row.zoho_purchaseorder_id ?? '').trim()) ||
    Boolean(String(row.source_order_id ?? '').trim());
  const inventoryReceived =
    typeof row.quantity_received === 'number' ? row.quantity_received : null;
  const inventoryExpected =
    typeof row.quantity_expected === 'number' ? row.quantity_expected : null;
  const displayIndexRows = useMemo(
    () =>
      buildUnboxDisplayIndexRows(sideGates, {
        hasTicketId,
        photoCount: typeof row.photo_count === 'number' ? row.photo_count : null,
        serialCount,
        linkagePaired,
        isUnfound: Boolean(c.isUnfound),
        trackingPresent: trackingNumber.length > 0,
        inventoryReceived,
        inventoryExpected,
      }),
    [
      sideGates,
      hasTicketId,
      row.photo_count,
      serialCount,
      linkagePaired,
      c.isUnfound,
      trackingNumber,
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
    // Full Inventory pull (mirror sync-one + carton inventory-sync) so PO header
    // notes land in receiving_carton.zoho_notes — not carton-only sync.
    onLoadZohoNotes: async () => {
      const result = await c.refreshInventoryDossier();
      return result.ok ? result.zohoNotes : null;
    },
    syncKey: row.receiving_id ?? row.id,
  });

  // Cockpit auto-follow yields to an EXPLICIT close (per CARTON — the parent, not the active child line).
  const cartonKey = row.receiving_id ?? row.id ?? null;
  const cockpitClosedForCartonRef = useRef<number | null>(null);
  const closeDisplays = useCallback(() => {
    cockpitClosedForCartonRef.current = row.receiving_id ?? row.id ?? null;
    setRequestedSideTab(null);
  }, [row.receiving_id, row.id, setRequestedSideTab]);

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

  // Deep Link (PO-line strip / arrival·carton dock) → open Photos → Link leaf.
  // `lineId` and/or `cartonAspect` default the leaf's "Link to" combobox.
  useReceivingEvents({
    'receiving-open-photo-link': ({ lineId, cartonAspect }) => {
      setPhotoLinkTarget((prev) => ({
        lineId: lineId ?? null,
        cartonAspect: cartonAspect ?? null,
        requestId: (prev?.requestId ?? 0) + 1,
      }));
      openDisplays('photos', { photoAction: 'link' });
    },
  });

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
    if (
      !shouldItemPhotosCompareAutoOpen({
        requestedDisplay: requestedSideTab,
        activeLeaf: activeSideTab,
      })
    ) {
      return;
    }
    itemPhotosCompareOpenedRef.current = row.id;
    openDisplays('photos', { photoAction: 'compare' });
  }, [
    procedureSettled,
    activeKey,
    activeSideTab,
    photoAction,
    requestedSideTab,
    row.id,
    openDisplays,
  ]);

  // Cockpit auto-follow — the right rail is the CURRENT step's reference (`display/scan-cockpit.md`, DO/KNOW split).
  const prevCockpitActiveKeyRef = useRef<string | null>(null);
  const prevCockpitCartonRef = useRef<number | null>(null);
  useEffect(() => {
    if (activeKey == null || activeKey === 'item_photos') return;

    const stepChanged = prevCockpitActiveKeyRef.current !== activeKey;
    const cartonChanged = prevCockpitCartonRef.current !== cartonKey;
    prevCockpitActiveKeyRef.current = activeKey;
    prevCockpitCartonRef.current = cartonKey;

    if (cockpitClosedForCartonRef.current === cartonKey) return;
    if (!railLeaf) return; // reference-less step — its reference is the work plane
    if (shouldCockpitYieldToDisplaysIndex(requestedSideTab, cartonChanged)) return;

    // Cold-load CLS gate: auto-opening Displays that would park the left rail
    // shifts the surface ~328px after paint. Skip the open when the frame store
    // says it won't fit beside an open rail.
    if (cartonChanged && !showDisplays && stationDisplaysOpenWouldParkRail()) {
      return;
    }

    const ticketCtx = resolveUnboxTicketContextOpen(row, hasTicketId);
    if (ticketCtx.open) {
      // Exception carton — leave the rail where the operator put it rather than driving it to this beat's reference.
      return;
    }

    if (activeSideTab === 'ticket') return; // never yank claim/chat
    if (
      activeSideTab === 'photos' &&
      (photoAction === 'move' || photoAction === 'send')
    ) {
      return; // never interrupt a Move/Send drill
    }
    if (showDisplays && activeSideTab === railLeaf) return; // already showing it Operator browse — Index (Back/Esc) OR a leaf that is not this beat's reference (picked Photos while railLeaf is Units).
    if (showDisplays && activeSideTab !== railLeaf && !stepChanged && !cartonChanged) {
      return;
    }
    openDisplays(railLeaf);
  }, [
    activeKey,
    railLeaf,
    cartonKey,
    activeSideTab,
    showDisplays,
    photoAction,
    openDisplays,
    row,
    hasTicketId,
    requestedSideTab,
    setComposerMode,
  ]);

  const onLinkageActionChange = useCallback(
    (action: UnboxLinkageAction) => {
      setRequestedSideTab('linkage', { linkageAction: action });
    },
    [setRequestedSideTab],
  );

  const openMovePhotosDisplay = useCallback(() => {
    openDisplays('photos', { photoAction: 'move' });
  }, [openDisplays]);

  const openSendPhotoNoteDisplay = useCallback(() => {
    openDisplays('photos', { photoAction: 'send' });
  }, [openDisplays]);

  /** Identity Photos pill double-click — Actions list (clears any photoAction drill). */
  const openPhotosDisplay = useCallback(() => {
    openDisplays('photos');
  }, [openDisplays]);

  /** OPEN-only, never a toggle (2026-08-19). */
  const openTicketView = useCallback(() => {
    setComposerMode('ticket');
  }, [setComposerMode]);

  /** Auto-match "Find ticket" → the Ticket surface. */
  const openFindTicketDisplay = useCallback(() => {
    if (hasTicketId) {
      setComposerMode('ticket');
      return;
    }
    onOpenClaim('link');
  }, [hasTicketId, onOpenClaim, setComposerMode]);

  const closeClaimView = useCallback(() => {
    c.setReturnClaimPrefill(null);
    if (hasTicketId) setComposerMode('ticket');
    else setComposerMode('unbox');
  }, [c, hasTicketId, setComposerMode]);

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
      setComposerMode('ticket');
    },
    [c, qc, row.id, row.notes, row.receiving_id, setComposerMode],
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
          unreceiveMenuDisabled: c.unreceiveMenuDisabled,
          handlePrintAndReceive: () => {
            void c.handlePrintAndReceive();
            nudgeUnboxPrintReceive('cta');
          },
          runPrintLabel: () => {
            c.runPrintLabel();
            nudgeUnboxPrintReceive('print');
          },
          printKind: (kind) => c.printKind(kind),
          labelSelectOptions: c.labelSelectOptions,
          selectedLabelKind: c.selectedLabelKind,
          setSelectedLabelKind: c.setSelectedLabelKind,
          activeLabelKind: c.activeLabelKind,
          requestLabelEditor: () => c.requestLabelEditor(),
          handleReceive: (mode) => {
            void c.handleReceive(mode);
          },
        },
      }),
    [row, c],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'unbox',
    mode: 'unbox',
    build: buildTerminal,
  });

  // Middle nav-keys while carton open (Band 3 nulls Middle in UnboxWorkspaceView).
  const { armed: middleNavArmed, navKeyCap: middleNavKeyCap } =
    useUnboxMiddleCartonNav(row, {
      runPrintLabel: () => c.runPrintLabel(),
      handleReceive: () => void c.handleReceive('zoho_receive'),
      canPrint: c.canPrintReview,
      canReceive: c.canReceiveReview || c.canZohoReceive,
      terminalVm,
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
   * Notes-footer location pill → Displays → Locations (browse · reprint · mint).
   * Toggles like the other leaf openers, so a second click on New location
   * closes the column rather than re-opening what is already showing.
   */
  const openLocationsDisplay = useCallback(() => {
    if (activeSideTab === 'locations') {
      closeDisplays();
      return;
    }
    openDisplays('locations');
  }, [activeSideTab, closeDisplays, openDisplays]);

  useEffect(() => {
    setActionFeedback(null);
  }, [row.id]);

  // Scan-theme tint = operating staff (same SoT as ThemedStationScanBar),
  // falling back to the carton's assigned tech when staffId is absent.
  const terminalThemeStaffId =
    Number(staffId) || row.assigned_tech_id || null;

  const bubbleTerminal = terminalVm ? (
    <div className="shrink-0" data-unbox-dock-terminal>
      <StationTerminalDock
        embedded
        embeddedChrome="pill"
        vm={terminalVm}
        assignedTechId={terminalThemeStaffId}
      />
    </div>
  ) : null;

  const onFocusCaptureStep = useCallback(
    (key: 'serial' | 'condition' | 'item_photos') => {
      focusStep(key);
      if (key === 'serial') {
        // Centre capture owns serial entry after a PO scan — not the dock wedge.
        scheduleFocusUnboxCaptureSerial(60);
        return;
      }
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    },
    [focusStep],
  );

  /* ── Replay the last receive (the composer's ⓘ) ──────────────────────────── Dismissing the receive panel used to destroy the only record… */
  const [remembered, setRemembered] = useState<{
    lineId: number;
    result: ReceiveResult;
  } | null>(null);
  const [replayFor, setReplayFor] = useState<number | null>(null);

  useEffect(() => {
    if (!c.receiveResult) return;
    setRemembered({ lineId: row.id, result: c.receiveResult });
  }, [c.receiveResult, row.id]);

  // The line guard, not a reset effect: switching cartons makes the remembered
  // verdict unreadable rather than racing an effect to clear it.
  const recentVerdict = remembered?.lineId === row.id ? remembered : null;
  const liveReceiveFeedback = Boolean(c.receiving || c.receiveResult);
  const replaying = replayFor === row.id && recentVerdict != null && !liveReceiveFeedback;

  const feedbackResult = c.receiveResult ?? (replaying ? recentVerdict.result : null);
  const showReceiveFeedback = Boolean(c.receiving || feedbackResult);

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
        // The ONE derivation drives both the dock action and the in-line moving
        // outline (scan-cockpit DO plane) — no second store.
        activeStep: activeKey,
        onFocusCaptureStep,
        onEditFilledSerial: (serial) => {
          // Edit-in-Displays (ruled): clicking a FILLED serial opens the Units
          // Displays leaf for this line, never the in-row/dock field. Seed the
          // edit target so the Units display lands on that serial.
          c.setHeaderSerialEdit(serial);
          openDisplays('units');
        },
        onViewAllUnits: (line) => {
          if (line.id !== row.id) {
            dispatchSelectLine(line);
          }
          openDisplays('units');
        },
        collapse: {
          bands,
          collapseAll: bandCollapse.collapseAll,
        },
        lineCollapse,
      }),
    [
      row,
      staffId,
      c,
      accordionBootstrap,
      activeKey,
      onFocusCaptureStep,
      openDisplays,
      bands,
      bandCollapse.collapseAll,
      lineCollapse,
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
        hasTrackingTab,
        hasListingsTab,
        hasLinkageTab,
        hasInventoryTab,
        hasPoNoteTab,
        poNote,
        photoAction,
        onPhotoActionChange,
        photoLinkTargetLineId: photoLinkTarget?.lineId ?? null,
        photoLinkTargetCartonAspect: photoLinkTarget?.cartonAspect ?? null,
        photoLinkTargetRequestId: photoLinkTarget?.requestId ?? 0,
        linkageAction,
        onLinkageActionChange,
        onInventoryChangePo: openPoPairing,
        onInventorySync: () => c.refreshInventoryDossier(),
        inventorySyncing: Boolean(c.inventoryRefreshing),
        claimMode,
        onCloseClaim: closeClaimView,
        onCloseTicket: openDisplaysIndex,
        onClaimTicketCreated,
        onClaimTicketUnlinked,
        accordionBootstrap,
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
      hasTrackingTab,
      hasListingsTab,
      hasLinkageTab,
      hasInventoryTab,
      hasPoNoteTab,
      poNote,
      photoAction,
      onPhotoActionChange,
      linkageAction,
      onLinkageActionChange,
      openPoPairing,
      claimMode,
      closeClaimView,
      openDisplaysIndex,
      onClaimTicketCreated,
      onClaimTicketUnlinked,
      accordionBootstrap,
      pairingFocus,
      photoLinkTarget,
      openFindTicketDisplay,
    ],
  );

  const showRightPushChrome = showDisplays;

  /** Scan-station chrome for Displays `←|` + carton `↑ ↓`. */

  const utilityRailBody = !showDisplays ? (
    <StationDisplaysUtilityRail
      onOpenDisplays={openDisplaysIndex}
      indexRail={
        <StationDisplaysParkedRail
          rows={displayIndexRows}
          tabs={unboxSideTabs}
          activeId={activeSideTab ?? null}
          // Same contract as the parked strip: a cell names a leaf, so land
          // that leaf rather than the index the operator would then re-pick.
          onOpenLeaf={(id) => {
            if (isDisplaysHostedLeaf(id)) {
              openDisplays(id as UnboxDisplayNav);
              return;
            }
            openDisplays(id as UnboxSideTab);
          }}
        />
      }
    />
  ) : null;

  // TODO(daily-triage F0→F1):
  // TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1
  const stationContextBar = (
    <StationContextBar
      placement="flow"
      identity={
        <LineCartonContextSection
          row={row}
          staffId={staffId}
          c={c}
          linkedOrderNumber={linkedOrder?.orderId ?? null}
          onToggleTicketView={openTicketView}
          ticketViewActive={ticketViewActive}
          onToggleClaimView={() => {
            // One door: `onOpenClaim` is what lights BOTH surfaces.
            if (claimViewActive) closeClaimView();
            else onOpenClaim('link');
          }}
          claimViewActive={claimViewActive}
          draftTicketNumber={draftTicketNumber}
          onOpenMovePhotosExternal={openMovePhotosDisplay}
          onSendToTicketExternal={openSendPhotoNoteDisplay}
          // Hover = PhotoLauncher action dropdown (View · Upload · Move · …).
          // Move / Send rows open Displays (right rail). Click = phone;
          // double-click = Displays → Photos Actions list.
          onOpenPhotosDisplay={openPhotosDisplay}
          // Identity pills open the Displays column on their own tab — the
          // editors moved right, so the header route follows them.
          onEditTracking={hasTrackingTab ? () => openDisplays('tracking') : undefined}
          onEditListing={hasListingsTab ? () => openDisplays('listings') : undefined}
          onEditPo={openPoPairing}
          trackingEditOpen={activeSideTab === 'tracking'}
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
                // Notes bubble + Print · Receive, plus the Label band when it
                // is open — pager clearance lets the sticker scroll above the
                // dock instead of sitting under it.
                reserveScrollClearance="pager"
                // Identity is in-flow (`StationContextBar placement="flow"`)
                // above this workbench — no guessed stacked pt clearance.
                reserveIdentityClearance={false}
                // Flat data floor — no vertical air between centre surfaces.
                bodyGap="none"
                bodyFill={ticketMode}
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
                // dock float stack above the notes bubble (an absolute dock would
                // cover an in-flow footer).
                dock={
                  // Raised Omnichannel notes bubble + divided Print · Receive.
                  // Float uses the shared sliced-action gutters (pre–flush-floor).
                  <div
                    className={slicedActionDockWrapperClass({ docked: false })}
                    data-unbox-dock-float
                  >
                    <div className={`pointer-events-auto w-full min-w-0 ${STATION_WORKBENCH_COLUMN}`}>
                      {middleNavArmed ? (
                        <div
                          className="mb-1 flex flex-wrap items-center justify-end gap-2 px-2"
                          data-testid="unbox-middle-nav-keycaps"
                          aria-hidden
                        >
                          {(
                            [
                              ['scan', 'Scan'],
                              ['serial', 'Serial'],
                              ['condition', 'Condition'],
                              ['photos', 'Photos'],
                              ['cta', 'Act'],
                              ['print', 'Print'],
                              ['receive', 'Receive'],
                            ] as const
                          ).map(([id, label]) => {
                            const cap = middleNavKeyCap(id);
                            if (!cap) return null;
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 text-role-micro text-text-muted"
                              >
                                {cap}
                                <span>{label}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                      {terminalVm?.disabled && terminalVm.disabledReason ? (
                        <p
                          role="status"
                          className="mb-1 text-right text-role-caption font-semibold text-amber-700"
                        >
                          {terminalVm.disabledReason}
                        </p>
                      ) : null}
                      {/* One box for the pair. */}
                      <WeldedStack welded={showReceiveFeedback}>
                      {showReceiveFeedback ? (
                        <ReceiveFeedbackRegion
                          receiving={c.receiving}
                          receiveResult={feedbackResult}
                          replay={replaying}
                          responseExpanded={c.responseExpanded}
                          setResponseExpanded={c.setResponseExpanded}
                          onDismiss={() => {
                            // Clears what is SHOWN, never the memory — that is
                            // what makes the ⓘ able to bring it back.
                            setReplayFor(null);
                            c.setReceiveResult(null);
                            c.setResponseExpanded(false);
                          }}
                          onRetry={() => {
                            // Replay the SAME intent the failed attempt used —
                            // a retry must never silently upgrade a scan-only
                            // or local receive into an inventory push.
                            const attempted =
                              feedbackResult?.kind === 'diagnostic'
                                ? feedbackResult.intent
                                : feedbackResult?.kind === 'success'
                                  ? feedbackResult.summary.intent
                                  : 'zoho_receive';
                            void c.handleReceive(attempted);
                          }}
                          onPhotoPolicyOverride={(code) => {
                            const blocked =
                              feedbackResult?.kind === 'diagnostic'
                                ? feedbackResult.intent
                                : 'zoho_receive';
                            void c.handleReceive(blocked, { photoPolicyOverride: code });
                          }}
                        />
                      ) : null}
                      {terminalVm ? (
                        <WorkspaceNotesCard
                          onTicketCreated={onClaimTicketCreated}
                          onNoteTyped={() => bands.open('label')}
                          row={row}
                          c={c}
                          chrome="raised"
                          weldTop={showReceiveFeedback}
                          trailingAction={bubbleTerminal}
                          onPrimaryAction={() => {
                            if (c.isReceived) {
                              c.runPrintLabel();
                              nudgeUnboxPrintReceive('print');
                              return;
                            }
                            void c.handlePrintAndReceive();
                            nudgeUnboxPrintReceive('cta');
                          }}
                          primaryActionDisabled={Boolean(terminalVm.disabled)}
                          onTicketDraftFilledChange={setTicketDraftFilled}
                          onOpenLocations={openLocationsDisplay}
                          progressPercent={procedurePercent}
                          progressTone={checklistSelected ? 'selected' : 'idle'}
                          onProgressClick={() => {
                            if (checklistSelected) {
                              closeDisplays();
                              return;
                            }
                            openDisplays('checklist');
                          }}
                          // The corner is ONE slot.
                          headerAction={
                            recentVerdict && !liveReceiveFeedback
                              ? {
                                  label: replaying
                                    ? 'Hide the last receive result'
                                    : 'Show the last receive result',
                                  pressed: replaying,
                                  onClick: () => setReplayFor(replaying ? null : row.id),
                                }
                              : undefined
                          }
                        />
                      ) : null}
                      </WeldedStack>
                    </div>
                  </div>
                }
              >
                {/* RETURN lines only: what to check for + listing, above the line record. */}
                <UnboxReturnCallout row={row} />
                <motion.div initial={false} animate="show" variants={revealContainer}>
                  <motion.div variants={revealItem}>{unboxOverview}</motion.div>
                </motion.div>
                {/* A FILED ticket is part of this carton's record, so it shows whenever one exists — Unbox mode included (operator ruling 2026-08-31). */}
                {hasTicketId ? (
                  <StationTicketPane
                    row={row}
                    ticketId={c.providerTicketId}
                    claimMode={ticketClaimMode}
                    onCloseClaim={() => setComposerMode('unbox')}
                    onClaimTicketCreated={onClaimTicketCreated}
                    onClaimTicketUnlinked={onClaimTicketUnlinked}
                    returnClaimPrefill={c.returnClaimPrefill}
                  />
                ) : null}
              </StationWorkbench>
            </div>

            {row.receiving_id != null ? (
              /* Carton evidence fan — the carton's whole evidence set (arrival package + unbox-carton + legacy), so a carton whose photos predate the… */
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
              activeTab={displaysActiveTab}
              indexRows={displayIndexRows}
              visitFrame={displaysVisitFrame}
              onVisitNavigate={onDisplaysVisitNavigate}
              historyScopeKey={displaysHistoryScopeKey}
              onTabChange={(id) => {
                if (id === UNBOX_DISPLAY_INDEX) {
                  setRequestedSideTab(UNBOX_DISPLAY_INDEX);
                  return;
                }
                if (isDisplaysHostedLeaf(id)) {
                  setRequestedSideTab(id as UnboxDisplayNav);
                  return;
                }
                const tab = id as UnboxSideTab;
                if (tab === 'ticket') {
                  // TRANSITIONAL — Ticket renders in BOTH surfaces, so this row OPENS the leaf instead of forwarding.
                  if (!hasTicketId) {
                    onOpenClaim('link');
                    return;
                  }
                  setComposerMode('ticket');
                  setRequestedSideTab(
                    CLAIM_RENDERS_IN_BOTH ? 'ticket' : UNBOX_DISPLAY_INDEX,
                  );
                  return;
                }
                setRequestedSideTab(tab);
              }}
              onClose={closeDisplays}
              headerActions={
                <UnboxDisplaysActionFloor
                  receivingId={row.receiving_id}
                  isUnfound={c.isUnfound}
                  canPrint={c.canPrintReview}
                  runPrintLabel={() => {
                    c.runPrintLabel();
                    nudgeUnboxPrintReceive('print');
                  }}
                  openDisplays={(tab, opts) => openDisplays(tab, opts)}
                  onDeleted={closeDisplays}
                  editSelected={activeSideTab === 'linkage'}
                  deleteIdentity={{
                    tracking: trackingNumber,
                    poNumber: row.zoho_purchaseorder_number,
                  }}
                  onInventorySync={() => c.refreshInventoryDossier()}
                  inventorySyncing={Boolean(c.inventoryRefreshing)}
                  canInventorySync={
                    row.receiving_id != null &&
                    Boolean((row.zoho_purchaseorder_id || '').trim())
                  }
                />
              }
            />
          ) : null
        }
      />
    </>
  );
}
