'use client';

/**
 * Right-pane workspace editor for a single receiving line — the UNBOX display,
 * and the MASTER/anchor for the workspace UX. All form state, effects, and
 * handlers live in `useUnboxLineController` (which composes the mode-agnostic
 * `useReceivingLineCore`); this file is pure composition — it lays out the
 * toolbar → scroll body → tab-aware terminal dock from shared section components.
 *
 * Triage (the identify-before-unbox pass) is its own lean panel
 * ({@link TriagePanel}); the two no longer share a JSX shell or a capability
 * matrix. The testing display (/tech) composes the SAME core + cards with its
 * own controller, so the carton/identity logic lives in exactly one place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  staggerRevealContainer,
  STAGGER_REVEAL_STEP,
} from '@/design-system/primitives/StaggerReveal';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { useReceivingTicketView } from './line-edit/hooks/useReceivingTicketView';
import { isReceivingInlineTicketEditorEnabled } from '@/lib/receiving/inline-ticket-editor-flag';
import { toast } from '@/lib/toast';
import { ReceiveFeedbackRegion } from './ReceiveFeedbackRegion';
import { WorkspaceActionFeedbackSlot } from './WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from './InlineActionFeedbackCard';
import { ReceivingPhotoPeek } from './line-edit/ReceivingPhotoPeek';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';
import { LineCartonContextSection } from './line-edit/LineCartonContextSection';
import { useSyncedPoNote } from './line-edit/hooks/useSyncedPoNote';
import { LineEditModals } from './line-edit/LineEditModals';
import { useUnboxLineController } from './line-edit/hooks/useUnboxLineController';
import { dispatchLineUpdated, type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { useReturnOrderLinkage } from './line-edit/hooks/useReturnOrderLinkage';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { useReceivingPhotoCount } from '@/hooks/useReceivingPhotoCount';
import { activeReceivingStepKey } from './ReceivingProgressStepper';
import {
  StationContextBar,
  StationHeaderToolbar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  StationPanelRoot,
  PairingTogglePill,
  ExternalLinkPill,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { usePoNoteTabState } from './line-edit/terminal/usePoNoteTabState';
import { resolveUnboxTerminal } from './line-edit/terminal/unbox-terminal';
import { buildUnboxTabs, UnboxSectionTabs } from './line-edit/terminal/unbox-tabs';
import { WorkspaceNotesCard } from './line-edit/WorkspaceNotesCard';
import type { UnboxView } from './line-edit/terminal/types';
import type {
  ChecklistTabBridge,
  ConversationTabBridge,
  UnitsTabBridge,
} from './line-edit/terminal/unbox-tab-bridges';

const LABEL_PRINTED_KEY = (lineId: number) => `receiving-label-printed:${lineId}`;

function readLabelPrinted(lineId: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.localStorage.getItem(LABEL_PRINTED_KEY(lineId));
  } catch {
    return false;
  }
}

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
  /**
   * Snapshot of `receiving.accordionExpand` at carton open — `'all'` keeps the
   * active PO-line body expanded and suppresses inactive fake chevrons.
   */
  accordionBootstrap?: 'default' | 'all';
}) {
  // All state, effects, and handlers live in the controller — this panel is pure
  // composition. See useUnboxLineController / useReceivingLineCore.
  const c = useUnboxLineController(row, staffId, { itemTotal });
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  // Shared PO-note save (overwrite + push to inventory) — used by the notes
  // composer's push button and the standalone inventory-notes tab dock.
  const { saveOverallNote } = useSyncedPoNote(row, setActionFeedback);
  // Print step reads the durable `label_printed_at` stamp (receiving_line_testing)
  // OR the localStorage optimistic hint — so the step survives a refresh / other
  // device, while still flipping instantly on print before the refetch lands.
  const [labelPrinted, setLabelPrinted] = useState(
    () => !!row.label_printed_at || readLabelPrinted(row.id),
  );

  useEffect(() => {
    setLabelPrinted(!!row.label_printed_at || readLabelPrinted(row.id));
  }, [row.id, row.label_printed_at]);

  useEffect(() => {
    const onLabel = (e: Event) => {
      const detail = (e as CustomEvent<{ line_id?: number }>).detail;
      if (detail?.line_id === row.id) setLabelPrinted(true);
    };
    window.addEventListener('receiving-label-printed', onLabel);
    return () => window.removeEventListener('receiving-label-printed', onLabel);
  }, [row.id]);

  // Live per-carton photo count (shared cache with the camera ×N badge), so the
  // active-step logic agrees with the stepper and doesn't regress to Photos when
  // a Condition update clobbers the denormalized `row.photo_count` snapshot.
  const photoCount = useReceivingPhotoCount(
    row.receiving_id,
    Math.max(0, Number(row.photo_count ?? 0)),
  );
  const rowSerials = Array.isArray(row.serials) ? row.serials : [];
  const serialCount = rowSerials.length;
  // Resolve the returned unit's OUTBOUND order (closed-loop linkage) from the
  // live scan input, falling back to the newest serial already on the line so
  // the identity persists after the scan bar clears. The resolved order# lands
  // in the top-row PO#/order chip (last-4) instead of a separate LINKAGE panel.
  const latestRowSerial = String(rowSerials[rowSerials.length - 1]?.serial_number ?? '').trim();
  const linkedOrder = useReturnOrderLinkage(c.serialInput.trim() || latestRowSerial);
  const activeStep = useMemo(
    () =>
      activeReceivingStepKey({
        photoCount,
        serialCount,
        serialAbsent: !!row.serial_absent,
        quantityExpected: row.quantity_expected ?? 0,
        labelPrinted,
      }),
    [photoCount, serialCount, row.serial_absent, row.quantity_expected, labelPrinted],
  );

  const [unboxView, setUnboxView] = useState<UnboxView>('overview');
  const [classifyExpand, setClassifyExpand] = useState<{
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null>(null);

  const openClassifyFromHeader = (picker: 'urgency' | 'platform' | 'type') => {
    setUnboxView('classify');
    setClassifyExpand((prev) => ({
      dimension: picker,
      requestId: (prev?.requestId ?? 0) + 1,
    }));
  };
  const hasUnits = serialCount > 0;
  const trackingNumber = String(row.tracking_number ?? '').trim();
  const poIdForTracking = String(row.zoho_purchaseorder_id ?? '').trim();
  const hasTimelineTab =
    trackingNumber.length > 0 || hasUnits || row.receiving_id != null;
  const hasPoNoteTab = !c.isUnfound && row.receiving_id != null;
  const isLocalPickup = isLocalPickupFulfillment(row);
  const hasTrackingTab = !isLocalPickup;
  // Classification: checklist tab only (header pill row removed — DS SoT).
  // Unfound → strip order 2 (replaces Listings). Matched → ⋯ overflow.
  const hasClassifyTab = true;
  const classifyOnStrip = c.isUnfound;
  const hasListingsTab = !c.isUnfound;
  const activeUnboxView: UnboxView =
    unboxView === 'checklist' ||
    (unboxView === 'po-note' && hasPoNoteTab) ||
    (unboxView === 'units' && hasUnits) ||
    (unboxView === 'tracking' && hasTrackingTab) ||
    (unboxView === 'listings' && hasListingsTab) ||
    (unboxView === 'classify' && hasClassifyTab) ||
    (unboxView === 'timeline' && hasTimelineTab) ||
    unboxView === 'ticket' ||
    unboxView === 'support'
      ? unboxView
      : 'overview';

  const poNote = usePoNoteTabState({
    overallZohoNotes: row.receiving_zoho_notes ?? null,
    active: activeUnboxView === 'po-note',
    onSaveOverallNote: saveOverallNote,
    onLoadZohoNotes: () => c.syncCartonFromZoho(),
  });

  // Tab bodies register imperative bridges (checkAll, openPrebox, …). Keep the
  // latest snapshot in refs so callback identity churn doesn't loop setState;
  // bump the tick only when dock-visible fields change.
  const checklistBridgeRef = useRef<ChecklistTabBridge | null>(null);
  const [checklistBridgeTick, setChecklistBridgeTick] = useState(0);
  const unitsBridgeRef = useRef<UnitsTabBridge | null>(null);
  const [unitsBridgeTick, setUnitsBridgeTick] = useState(0);
  const supportBridgeRef = useRef<ConversationTabBridge | null>(null);
  const [supportBridgeTick, setSupportBridgeTick] = useState(0);

  const onChecklistBridge = useCallback((bridge: ChecklistTabBridge | null) => {
    const prev = checklistBridgeRef.current;
    checklistBridgeRef.current = bridge;
    if (
      Boolean(prev) !== Boolean(bridge) ||
      prev?.allDone !== bridge?.allDone ||
      prev?.itemCount !== bridge?.itemCount
    ) {
      setChecklistBridgeTick((t) => t + 1);
    }
  }, []);
  const onUnitsBridge = useCallback((bridge: UnitsTabBridge | null) => {
    const prev = unitsBridgeRef.current;
    unitsBridgeRef.current = bridge;
    if (Boolean(prev) !== Boolean(bridge) || prev?.serialCount !== bridge?.serialCount) {
      setUnitsBridgeTick((t) => t + 1);
    }
  }, []);
  const onConversationBridge = useCallback((bridge: ConversationTabBridge | null) => {
    const prev = supportBridgeRef.current;
    supportBridgeRef.current = bridge;
    if (
      Boolean(prev) !== Boolean(bridge) ||
      prev?.hasDraft !== bridge?.hasDraft ||
      prev?.isPublic !== bridge?.isPublic ||
      prev?.submitting !== bridge?.submitting ||
      prev?.canPost !== bridge?.canPost
    ) {
      setSupportBridgeTick((t) => t + 1);
    }
  }, []);

  const buildTerminal = useCallback(
    (kind: string) =>
      resolveUnboxTerminal(kind, {
        row,
        poNote,
        bridges: {
          checklist: checklistBridgeRef.current,
          units: unitsBridgeRef.current,
          support: supportBridgeRef.current,
          conversation: supportBridgeRef.current,
        },
        focusSerialScan: () => {
          const focus = () => {
            const el =
              c.serialRef?.current ??
              document.querySelector<HTMLInputElement>('[data-unbox-serial-input]');
            el?.focus({ preventScroll: true });
            el?.select?.();
          };
          focus();
          globalThis.setTimeout(focus, 0);
        },
        setUnboxView: (view) => setUnboxView(view),
        focusTicketReply: () => {
          setUnboxView('ticket');
          globalThis.setTimeout(() => {
            const el = document.querySelector<HTMLElement>(
              '[role="tabpanel"]:not([hidden]) textarea, [role="tabpanel"]:not([hidden]) [contenteditable="true"]',
            );
            el?.focus();
          }, 0);
        },
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
          receiveMenuLabel: c.receiveMenuLabel,
          receiveMenuTitle: c.receiveMenuTitle,
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
    [row, poNote, c, checklistBridgeTick, unitsBridgeTick, supportBridgeTick],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'unbox',
    mode: 'unbox',
    tabId: activeUnboxView,
    build: buildTerminal,
  });

  // Package Pairing state lifted here so its "Edit PO" pencil can live on the tab
  // row (context slot) instead of the removed "PO items · N" header.
  const [pairingOpen, setPairingOpen] = useState(false);
  const togglePairing = useCallback(() => setPairingOpen((v) => !v), []);
  const editPoControl = <PairingTogglePill open={pairingOpen} onToggle={togglePairing} />;
  const ticketTabLink =
    activeUnboxView === 'ticket' && c.zendeskHref ? (
      <ExternalLinkPill href={c.zendeskHref} label="Open ticket in Zendesk" />
    ) : null;

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

  const inlineTicketEditorEnabled = isReceivingInlineTicketEditorEnabled();
  const { ticketView, setTicketView } = useReceivingTicketView(row.id);
  const ticketId = c.providerTicketId;
  const showTicketEditor = inlineTicketEditorEnabled && ticketView && ticketId != null;
  const toggleTicketView = inlineTicketEditorEnabled
    ? () => setTicketView(!ticketView)
    : undefined;

  useEffect(() => {
    if (
      ticketView &&
      inlineTicketEditorEnabled &&
      !c.supportTicketLoading &&
      ticketId == null
    ) {
      setTicketView(false);
      toast('No linked ticket to edit on this carton.');
    }
  }, [ticketView, inlineTicketEditorEnabled, c.supportTicketLoading, ticketId, setTicketView]);

  const paneTransition = useMotionTransition(framerTransition.workbenchPaneMount);
  const ticketPanePresence = useMotionPresence(framerPresence.workbenchPane);

  const unboxTabs = useMemo(
    () =>
      buildUnboxTabs({
        row,
        staffId,
        c,
        activeUnboxView,
        hasUnits,
        serialCount,
        hasTimelineTab,
        hasTrackingTab,
        hasListingsTab,
        hasClassifyTab,
        classifyOnStrip,
        poIdForTracking,
        hasPoNoteTab,
        poNote,
        pairingOpen,
        onPairingToggle: togglePairing,
        onItemDescFeedback: handleItemDescFeedback,
        onItemDescSaved: handleItemDescSaved,
        onChecklistBridge,
        onUnitsBridge,
        onConversationBridge,
        accordionBootstrap,
        classifyExpandDimension: classifyExpand?.dimension ?? null,
        classifyExpandRequestId: classifyExpand?.requestId ?? 0,
      }),
    [
      row,
      staffId,
      c,
      accordionBootstrap,
      activeUnboxView,
      hasUnits,
      serialCount,
      hasTimelineTab,
      hasTrackingTab,
      hasListingsTab,
      hasClassifyTab,
      classifyOnStrip,
      poIdForTracking,
      hasPoNoteTab,
      poNote,
      pairingOpen,
      togglePairing,
      handleItemDescFeedback,
      handleItemDescSaved,
      onChecklistBridge,
      onUnitsBridge,
      onConversationBridge,
      classifyExpand,
    ],
  );

  const moreDetails = (
    <StationMoreDetails>
      <StationHeaderToolbar
        mode="unbox"
        embedded
        receivingId={row.receiving_id ?? null}
        zohoSyncing={c.zohoSyncing}
        busy={c.saving || c.platformSaving}
        copyingAll={c.copyingAll}
        handlers={{
          refresh: () => void c.syncWithZoho(),
          share: () => void c.handleShare(),
          audit: () => c.setAuditOpen(true),
          copy: () => void c.handleCopyAll(),
          movePhotos: () => c.openMovePhotos(),
        }}
      />
    </StationMoreDetails>
  );

  const stationContextBar = (
    <StationContextBar
      identity={
        <LineCartonContextSection
          row={row}
          staffId={staffId}
          c={c}
          linkedOrderNumber={linkedOrder?.orderId ?? null}
          onToggleTicketView={toggleTicketView}
          ticketViewActive={false}
          density="bar"
          onEditTracking={hasTrackingTab ? () => setUnboxView('tracking') : undefined}
          onEditListing={hasListingsTab ? () => setUnboxView('listings') : undefined}
          onClassifyPillOpen={openClassifyFromHeader}
          trackingEditOpen={activeUnboxView === 'tracking'}
          listingEditOpen={activeUnboxView === 'listings'}
          photoStage="unbox_carton"
        />
      }
      moreDetails={moreDetails}
    />
  );

  return (
    <>
      <StationPanelRoot>
        <AnimatePresence mode="wait" initial={false}>
          {showTicketEditor ? (
            <motion.div
              key="ticket-editor"
              initial={ticketPanePresence.initial}
              animate={ticketPanePresence.animate}
              exit={ticketPanePresence.exit}
              transition={paneTransition}
              className="relative flex min-h-0 flex-1 flex-col overflow-visible"
            >
              <StationContextBar
                identity={
                  <LineCartonContextSection
                    row={row}
                    staffId={staffId}
                    c={c}
                    linkedOrderNumber={linkedOrder?.orderId ?? null}
                    onToggleTicketView={toggleTicketView}
                    ticketViewActive
                    density="bar"
                    onEditTracking={hasTrackingTab ? () => setUnboxView('tracking') : undefined}
                    onEditListing={hasListingsTab ? () => setUnboxView('listings') : undefined}
                    onClassifyPillOpen={openClassifyFromHeader}
                    trackingEditOpen={activeUnboxView === 'tracking'}
                    listingEditOpen={activeUnboxView === 'listings'}
                    photoStage="unbox_carton"
                  />
                }
                moreDetails={moreDetails}
              />
              <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
                <SupportTicketDetail
                  ticketId={ticketId!}
                  onBack={() => setTicketView(false)}
                  receivingId={row.receiving_id ?? undefined}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="line-body"
              initial={ticketPanePresence.initial}
              animate={ticketPanePresence.animate}
              exit={ticketPanePresence.exit}
              transition={paneTransition}
              className="relative flex min-h-0 flex-1 flex-col overflow-visible"
            >
              {stationContextBar}
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                tabs={
                  <motion.div
                    initial={false}
                    animate="show"
                    variants={revealContainer}
                  >
                    <motion.div variants={revealItem}>
                      <UnboxSectionTabs
                        tabs={unboxTabs}
                        value={activeUnboxView}
                        onChange={(id) => setUnboxView(id as UnboxView)}
                        rightSlot={
                          activeUnboxView === 'overview'
                            ? editPoControl
                            : (ticketTabLink ?? undefined)
                        }
                      />
                    </motion.div>
                  </motion.div>
                }
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
                  // Overview: ONE elevated shell — the receive split-CTA rides
                  // inside the notes composer footer (no second dock row).
                  // Other tabs keep the full-width terminal band.
                  activeUnboxView === 'overview' ? (
                    <div className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
                      <div className={STATION_WORKBENCH_COLUMN}>
                        {terminalVm?.disabled && terminalVm.disabledReason ? (
                          <p
                            role="status"
                            className="mb-1.5 text-right text-role-caption font-semibold text-amber-700"
                          >
                            {terminalVm.disabledReason}
                          </p>
                        ) : null}
                        <WorkspaceNotesCard
                          row={row}
                          c={c}
                          onActionFeedback={setActionFeedback}
                          activeStep={activeStep}
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
                  ) : (
                    <StationTerminalDock
                      vm={terminalVm}
                      assignedTechId={row.assigned_tech_id}
                    />
                  )
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!showTicketEditor && row.receiving_id != null ? (
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
          />
        ) : null}
      </StationPanelRoot>

      <LineEditModals row={row} c={c} />
    </>
  );
}
