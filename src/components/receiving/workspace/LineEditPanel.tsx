'use client';

/** Selected-carton Unbox workspace: header tasks plus the right-edge Displays column. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  staggerRevealContainer,
  STAGGER_REVEAL_STEP,
} from '@/design-system/primitives/StaggerReveal';
import { PackageOpen } from '@/components/Icons';
import { ReceiveFeedbackRegion } from './ReceiveFeedbackRegion';
import type { ReceiveResult } from './line-edit/hooks/useReceiveAction';
import { LineCartonContextSection } from './line-edit/LineCartonContextSection';
import { useUnboxLineController } from './line-edit/hooks/useUnboxLineController';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from '@/components/station/receiving-lines-table-helpers';
import { useReturnOrderLinkage } from './line-edit/hooks/useReturnOrderLinkage';
import { useFulfilledReturnOrder } from './line-edit/hooks/useFulfilledReturnOrder';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import { StationContextBar, StationNextActionHeadline } from '@/components/station/entity-context';
import { UnboxLabelPreview } from './line-edit/UnboxLabelPreview';
import { StationLabelPeek } from '@/components/station/label-peek/StationLabelPeek';
import { UnboxPutawayLinkControl } from './line-edit/UnboxPutawayLinkControl';
import { UnboxReceivedByBubble } from './line-edit/UnboxReceivedByBubble';
import { putawayKindForType, unboxNextAction } from '@/lib/station/next-action/receiving';
import { usePutawayTargets } from '@/hooks/usePutawayTargets';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkspaceSkeleton,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import { PHONE_CARD_COLUMN } from '@/design-system/tokens/phone-card';

import { resolveUnboxTerminal } from './line-edit/terminal/unbox-terminal';
import { buildUnboxOverview } from './line-edit/terminal/unbox-overview';
import { WorkspaceNotesCard } from './line-edit/WorkspaceNotesCard';
import { useWorkspaceTicketDraft } from './line-edit/hooks/useWorkspaceTicketDraft';
import { useUnboxDisplays } from './line-edit/hooks/useUnboxDisplays';
import { useZendeskNextTicketNumber } from '@/hooks/useZendeskQueries';
import { formatDraftTicketNumber } from '@/lib/support/next-ticket-number';
import { useUnboxProcedureArrowKeys } from './line-edit/useUnboxProcedureArrowKeys';
import { useUnboxProcedureSteps } from './line-edit/useUnboxProcedureSteps';
import { useUnboxMiddleCartonNav } from './line-edit/useUnboxMiddleCartonNav';
import { nudgeUnboxPrintReceive } from '@/lib/keyboard/shortcut-nudge';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { scheduleFocusUnboxCaptureSerial } from './line-edit/focus-unbox-capture-serial';
import {
  useAutoCollapse,
  useBandCollapse,
  useLineCollapse,
} from '@/components/station/collapse';
import { UnboxReturnCheck } from '@/components/receiving/unbox/UnboxReturnCheck';
import { useStationHasPhotos } from '@/components/station/useStationHasPhotos';
import { SCAN_STATION_TONES } from '@/lib/sidebar-navigation';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { UnboxPairTask } from './line-edit/UnboxPairTask';
import { UnboxReturnFoundToast } from './line-edit/UnboxReturnOrder';
import { useStationTaskController } from '@/components/station/useStationTaskController';
import type { StationTask } from '@/components/station/station-header-tasks';

// Task panes paint the station skeleton while their chunk loads, never blank.
const paneLoading = () => <StationWorkspaceSkeleton header="none" bodyColumnClassName="" />;
const StationPhotosTask = dynamic(
  () => import('@/components/station/StationPhotosTask').then((m) => m.StationPhotosTask),
  { ssr: false, loading: paneLoading },
);
const StationTicketPane = dynamic(
  () => import('@/components/composer/StationTicketPane').then((m) => m.StationTicketPane),
  { ssr: false, loading: paneLoading },
);
const UnboxFulfilledOrderTask = dynamic(
  () => import('./line-edit/UnboxFulfilledOrderTask').then((m) => m.UnboxFulfilledOrderTask),
  { ssr: false, loading: paneLoading },
);
const AsListedBlock = dynamic(
  () => import('./line-edit/AsListedBlock').then((m) => m.AsListedBlock),
  { ssr: false },
);
const StationDisplaysPushStack = dynamic(
  () => import('@/components/station/displays/StationDisplaysPushStack').then((m) => m.StationDisplaysPushStack),
  { ssr: false },
);


const UNBOX_MIDDLE_NAV_LABELS = [
  ['scan', 'Scan'],
  ['serial', 'Serial'],
  ['condition', 'Condition'],
  ['photos', 'Photos'],
  ['cta', 'Act'],
  ['print', 'Print'],
  ['receive', 'Receive'],
] as const;

export function LineEditPanel({
  row,
  staffId,
  itemTotal,
  accordionBootstrap = 'default',
  scanDriven = false,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Total number of items in the PO — drives the "Receive" vs "Receive all" labels. */
  itemTotal?: number;
  /** Snapshot of `receiving.accordionExpand` at carton open — expands PO lines. */
  accordionBootstrap?: 'default' | 'all';
  /** A station scan opened this carton; a linked-ticket result selects Ticket. */
  scanDriven?: boolean;
}) {
  // The domain controller owns mutations; the shared task controller owns the
  // global switcher, composer mode, and display rail as one state machine.
  const qc = useQueryClient();
  const bandCollapse = useAutoCollapse();
  const bands = useBandCollapse(bandCollapse);
  const lineCollapse = useLineCollapse(row.id ?? null);
  const hasPhotos = useStationHasPhotos(row.receiving_id, row.photo_count);
  const unmatched = shouldUseUnmatchedItemsSurface(row);
  // Claim / Link existing ticket selects the Ticket tab. The line controller
  // runs before the task controller (its serial drives the Return order
  // tab), so it reaches `selectTask` through the latest-ref below.
  const selectTaskRef = useRef<(task: StationTask) => void>(() => undefined);
  const onOpenClaim = useCallback((_mode: 'create' | 'link') => {
    selectTaskRef.current('ticket');
  }, []);
  const c = useUnboxLineController(row, staffId, { itemTotal, onOpenClaim });
  // A scanned serial that traces to an order we packed / shipped: the unit is
  // coming back, so its Return order tab shows (who packed it, how it left),
  // the return-found toast fires, and Pair — with its link / unlink — stands down.
  const rowSerials = Array.isArray(row.serials) ? row.serials : [];
  const latestRowSerial = String(
    rowSerials[rowSerials.length - 1]?.serial_number ?? '',
  ).trim();
  const linkedOrder = useReturnOrderLinkage(c.serialInput.trim() || latestRowSerial);
  const returnOrder = useFulfilledReturnOrder(linkedOrder?.orderPk, row.received_at ?? row.created_at);
  const returnOrderFound = returnOrder != null;
  const {
    activeTask,
    activeDisplay: activeDisplayTab,
    ticketActive: ticketMode,
    fulfilledActive: fulfilledMode,
    photosActive: photosMode,
    pairActive: pairMode,
    displaysActive: displaysOpen,
    selectTask,
    revealTask,
    openDisplay,
    closeDisplays,
  } = useStationTaskController({
    owner: 'unbox',
    workLabel: 'Unbox',
    workIcon: PackageOpen,
    workTone: SCAN_STATION_TONES.receive,
    scopeKey: row.receiving_id ?? row.id,
    context: {
      hasPhotos,
      hasTicket: Boolean(String(row.zendesk_ticket ?? '').trim()),
      // A found return already names its order: no Pair tab, no pairing link / unlink.
      pair: returnOrderFound ? undefined : { needed: unmatched },
      fulfilledOrder: { found: returnOrderFound },
    },
  });
  selectTaskRef.current = selectTask;
  const viewReturnOrder = useCallback(() => selectTask('fulfilled'), [selectTask]);
  // Pair was open when the return resolved: its tab is gone, so land on the order it found.
  useEffect(() => {
    if (returnOrderFound && pairMode) selectTask('fulfilled');
  }, [returnOrderFound, pairMode, selectTask]);
  const {
    activeLeaf: activeDisplayLeaf,
    gates: displayGates,
    openLeaf: openDisplayLeaf,
    toggleLeaf: toggleDisplayLeaf,
    feedback: displaysFeedback,
    stackProps: displaysStackProps,
  } = useUnboxDisplays({
    row,
    staffId,
    c,
    activeDisplay: activeDisplayTab,
    displaysOpen,
    openDisplay,
    closeDisplays,
    selectTask,
    returnOrderFound,
  });
  const ticketLinkedRef = useRef(false);
  const previousScanDrivenRef = useRef(false);

  const { focusStep, activeKey, steps: procedureSteps } = useUnboxProcedureSteps(row);
  useUnboxProcedureArrowKeys(row);
  const procedurePercent = useMemo(() => {
    const total = procedureSteps.length;
    if (total === 0) return 0;
    const done = procedureSteps.reduce((n, step) => n + (step.state === 'done' ? 1 : 0), 0);
    return Math.round((done / total) * 100);
  }, [procedureSteps]);
  const hasTicketId = c.providerTicketId != null;
  const ticketViewActive = ticketMode && hasTicketId;
  const claimViewActive = ticketMode && !hasTicketId;

  // Fetch a draft number only after the operator has entered a claim body.
  const [ticketDraftFilled, setTicketDraftFilled] = useState(false);
  const draftingClaim = claimViewActive && ticketDraftFilled;
  const nextTicketNumber = useZendeskNextTicketNumber(draftingClaim);
  const draftTicketNumber = draftingClaim
    ? formatDraftTicketNumber(nextTicketNumber.data ?? null)
    : null;

  // Browse navigation defaults to work. A scan-opened carton with a linked
  // ticket selects Ticket so the scan result has one immediate destination.
  const cartonGateRef = useRef({ hasTicketId, scanDriven, selectTask });
  cartonGateRef.current = { hasTicketId, scanDriven, selectTask };
  // Carton key: a sibling line (or the stub → hydrated swap) keeps the tab.
  const cartonKey = row.receiving_id ?? row.id;
  useEffect(() => {
    const gate = cartonGateRef.current;
    ticketLinkedRef.current = gate.hasTicketId;
    previousScanDrivenRef.current = gate.scanDriven;
    gate.selectTask(gate.scanDriven && gate.hasTicketId ? 'ticket' : 'work');
  }, [cartonKey]);

  // Ticket pairing can settle after a scan-opened carton renders. Promote that
  // new result once, without auto-opening tickets during browse navigation.
  useEffect(() => {
    const scanJustOpened = scanDriven && !previousScanDrivenRef.current;
    if (scanDriven && hasTicketId && (!ticketLinkedRef.current || scanJustOpened)) {
      selectTask('ticket');
    }
    ticketLinkedRef.current = hasTicketId;
    previousScanDrivenRef.current = scanDriven;
  }, [hasTicketId, scanDriven, selectTask]);

  const toggleTicketView = useCallback(() => {
    selectTask(ticketMode ? 'work' : 'ticket');
  }, [selectTask, ticketMode]);

  const closeClaimView = useCallback(() => {
    c.setReturnClaimPrefill(null);
    selectTask(hasTicketId ? 'ticket' : 'work');
  }, [c, hasTicketId, selectTask]);

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
      selectTask('ticket');
    },
    [c, qc, row.id, row.notes, row.receiving_id, selectTask],
  );
  const ticketDraftModel = useWorkspaceTicketDraft({
    row,
    ticketId: c.providerTicketId,
    // Template fetch waits for a claim surface: the Ticket tab, or a body
    // typed into the bottom composer (which files with the same subject).
    previewClaim: claimViewActive || ticketDraftFilled,
    onTicketCreated: onClaimTicketCreated,
  });



  // Carton terminal stays welded to the notes composer: Print · Receive.
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
      selectTask('work');
      focusStep(key);
      if (key === 'serial') {
        // Centre capture owns serial entry after a PO scan — not the dock wedge.
        scheduleFocusUnboxCaptureSerial(60);
        return;
      }
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    },
    [focusStep, selectTask],
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
  // Welded onto the composer's top edge through its `reaction` slot — one
  // silhouette with the dock, framed on top only.
  const receiveFeedback = showReceiveFeedback ? (
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
  ) : null;

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
        activeStep: activeKey,
        onFocusCaptureStep,
        // Edit-in-Displays: a FILLED serial opens Displays › Units for this
        // line, seeded so the Units leaf lands on that serial in edit.
        onEditFilledSerial: (serial) => {
          c.setHeaderSerialEdit(serial);
          openDisplayLeaf('units');
        },
        onViewAllUnits: (line) => {
          if (line.id !== row.id) dispatchSelectLine(line);
          openDisplayLeaf('units');
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
      openDisplayLeaf,
      bands,
      bandCollapse.collapseAll,
      lineCollapse,
    ],
  );
  // The Type pill drives the step; the org's linked rack for that Type rides it (no request on a pill change).
  const putawayTargets = usePutawayTargets().data ?? null;
  const putawayKind = putawayKindForType(c.receivingType);
  const stationContextBar = (
    <StationContextBar
      placement="flow"
      bubbles={{
        nextStep: (
          <StationNextActionHeadline
            action={unboxNextAction(c.receivingType, putawayTargets)}
            trailing={<UnboxReturnCheck row={row} />}
            hoverAction={
              <UnboxPutawayLinkControl kind={putawayKind} linked={putawayTargets?.[putawayKind] ?? null} />
            }
          />
        ),
        summary: <UnboxReceivedByBubble row={row} />,
      }}
      identity={
        <LineCartonContextSection
          row={row}
          staffId={staffId}
          c={c}
          linkedOrderNumber={linkedOrder?.orderId ?? null}
          onToggleTicketView={toggleTicketView}
          ticketViewActive={ticketViewActive}
          onEditPo={returnOrderFound ? undefined : () => selectTask('pair')}
          poEditOpen={pairMode}
          onToggleClaimView={() => {
            if (claimViewActive) closeClaimView();
            else onOpenClaim('link');
          }}
          claimViewActive={claimViewActive}
          draftTicketNumber={draftTicketNumber}
          onEditTracking={displayGates.hasTrackingTab ? () => openDisplayLeaf('tracking') : undefined}
          trackingEditOpen={activeDisplayLeaf === 'tracking'}
          onEditListing={displayGates.hasListingsTab ? () => openDisplayLeaf('listings') : undefined}
          photoStage="unbox_carton"
          onSendToTicketExternal={() => selectTask('ticket')}
        />
      }
    />
  );
  const displays = displaysOpen ? (
    <StationDisplaysPushStack
      ariaLabel="Unbox displays"
      storageKey="unbox-displays-push-width"
      testId="unbox-displays-push"
      resizeTestId="unbox-displays-push-resize"
      {...displaysStackProps}
      onClose={closeDisplays}
      historyScopeKey={row.receiving_id ?? row.id}
    />
  ) : null;
  return (
    <StationScanPaneHost
      displaysOpen={displaysOpen}
      displays={displays}
      hostDataAttrs={{ 'data-unbox-pane-host': true }}
      centerTestId="unbox-station-center"
      center={
        <StationPanelRoot>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
            {stationContextBar}
            <UnboxReturnFoundToast
              cartonKey={row.receiving_id ?? row.id}
              order={returnOrder}
              row={row}
              onView={viewReturnOrder}
            />
            <StationWorkbench
              ambientWash={false}
              className="relative z-0 flex-1 bg-transparent"
              reserveScrollClearance="pager"
              reserveIdentityClearance={false}
              bodyFill={ticketMode || photosMode || fulfilledMode}
              bodyGap="none"
              feedback={showReceiveFeedback ? null : displaysFeedback}
              dock={
                <div
                  className={`${slicedActionDockWrapperClass({ docked: false })} !px-0 sm:!px-0`}
                  data-unbox-dock-float
                >
                  <div
                    className={`pointer-events-auto w-full min-w-0 ${STATION_WORKBENCH_COLUMN}`}
                  >
                    {middleNavArmed ? (
                      <div
                        className="mb-1 flex flex-wrap items-center justify-end gap-2 px-2"
                        data-testid="unbox-middle-nav-keycaps"
                        aria-hidden
                      >
                        {UNBOX_MIDDLE_NAV_LABELS.map(([id, label]) => {
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
                    {terminalVm ? (
                      <WorkspaceNotesCard
                        ticketDraftModel={ticketDraftModel}
                        row={row}
                        c={c}
                        chrome="raised"
                        reaction={receiveFeedback}
                        trailingAction={bubbleTerminal}
                        labelPeek={
                          <StationLabelPeek
                            key={row.id}
                            signal={`${c.itemNote ?? ''}|${row.condition_grade ?? ''}|${c.activeLabelKind ?? ''}|${c.labelEditorRequestId ?? 0}`}
                            testId="unbox-label-peek"
                          >
                            {({ reveal }) => <UnboxLabelPreview row={row} c={c} onReveal={reveal} />}
                          </StationLabelPeek>
                        }
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
                        onOpenStatusHistory={() => openDisplayLeaf('timeline')}
                        onOpenLocations={() => toggleDisplayLeaf('locations')}
                        onTicketDraftFilledChange={setTicketDraftFilled}
                        onTicketLinked={onClaimTicketCreated}
                        onLinkTicketOpen={() => revealTask('ticket')}
                        progressPercent={procedurePercent}
                        progressTone={activeDisplayLeaf === 'checklist' ? 'selected' : 'idle'}
                        onProgressClick={() => toggleDisplayLeaf('checklist')}
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
                    ) : (
                      receiveFeedback
                    )}
                  </div>
                </div>
              }
            >
              <div
                className={
                  ticketMode || photosMode || fulfilledMode ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'
                }
                data-active-unbox-task={activeTask}
              >
                {pairMode ? (
                  <UnboxPairTask
                    row={row}
                    staffId={staffId}
                    unmatched={unmatched}
                    onFindTicket={() => selectTask('ticket')}
                    onDone={() => selectTask('work')}
                  />
                ) : ticketMode ? (
                  <StationTicketPane
                    row={row}
                    ticketId={c.providerTicketId}
                    draft={ticketDraftModel}
                  />
                ) : photosMode ? (
                  <StationPhotosTask
                    receivingId={row.receiving_id ?? null}
                    staffId={staffId}
                    poRef={String(row.zoho_purchaseorder_number ?? row.zoho_purchaseorder_id ?? '') || null}
                    photoStage="unbox_carton"
                    onSendToTicket={() => selectTask('ticket')}
                  />
                ) : fulfilledMode ? (
                  <UnboxFulfilledOrderTask order={returnOrder} />
                ) : (
                <>
                  <AsListedBlock line={row} className={`${PHONE_CARD_COLUMN} mt-2`} />
                  <motion.div initial={false} animate="show" variants={revealContainer}>
                    <motion.div variants={revealItem}>{unboxOverview}</motion.div>
                  </motion.div>
                </>
              )}
              </div>
            </StationWorkbench>
          </div>
        </StationPanelRoot>
      }
    />
  );
}
