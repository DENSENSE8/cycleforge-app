'use client';

/** Selected-carton Unbox workspace with inline tasks and an optional fallback Displays column. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  staggerRevealContainer,
  STAGGER_REVEAL_STEP,
} from '@/design-system/primitives/StaggerReveal';
import { Button } from '@/design-system/primitives';
import { WorkspaceCard, type SectionTab } from '@/design-system/components';
import { History, PackageOpen } from '@/components/Icons';
import { ReceiveFeedbackRegion } from './ReceiveFeedbackRegion';
import { ReceivingAuditPanel } from './ReceivingAuditPanel';
import type { ReceiveResult } from './line-edit/hooks/useReceiveAction';
import { StationPhotosTask } from '@/components/station/StationPhotosTask';
import { TrackingNumbersEditor } from './line-edit/TrackingNumbersEditor';
import { LineCartonContextSection } from './line-edit/LineCartonContextSection';
import { useUnboxLineController } from './line-edit/hooks/useUnboxLineController';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from '@/components/station/receiving-lines-table-helpers';
import { useReturnOrderLinkage } from './line-edit/hooks/useReturnOrderLinkage';
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
  STATION_WORKBENCH_COLUMN,
  WorkspaceTimelineTab,
} from '@/components/station/workbench';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';

import { resolveUnboxTerminal } from './line-edit/terminal/unbox-terminal';
import { buildUnboxOverview } from './line-edit/terminal/unbox-overview';
import { WorkspaceNotesCard } from './line-edit/WorkspaceNotesCard';
import { useWorkspaceTicketDraft } from './line-edit/hooks/useWorkspaceTicketDraft';
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
import { StationTicketPane } from '@/components/composer';
import { UnboxReturnCallout } from '@/components/receiving/unbox/UnboxReturnCallout';
import { AsListedBlock } from './line-edit/AsListedBlock';
import { StationDisplaysPushStack } from '@/components/station/displays/StationDisplaysPushStack';
import { useStationTaskController } from '@/components/station/useStationTaskController';
import { STATION_DISPLAY_INDEX } from '@/components/station/displays/display-index';


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
  const bands = useBandCollapse(bandCollapse, { label: false });
  const lineCollapse = useLineCollapse(row.id ?? null);
  const {
    activeTask,
    activeDisplay: activeDisplayTab,
    ticketActive: ticketMode,
    photosActive: photosMode,
    displaysActive: displaysOpen,
    selectTask,
    openDisplay,
    closeDisplays,
  } = useStationTaskController({
    owner: 'unbox',
    workLabel: 'Unbox',
    workIcon: PackageOpen,
    scopeKey: row.receiving_id ?? row.id,
  });
  const [trackingEditorOpen, setTrackingEditorOpen] = useState(false);
  const trackingTriggerRef = useRef<HTMLElement | null>(null);
  const ticketLinkedRef = useRef(false);
  const previousScanDrivenRef = useRef(false);

  useEffect(() => {
    bands.close('label');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the active line changes
  }, [row.id]);

  const onOpenClaim = useCallback(
    (_mode: 'create' | 'link') => {
      selectTask('ticket');
    },
    [selectTask],
  );
  const c = useUnboxLineController(row, staffId, { itemTotal, onOpenClaim });
  const { focusStep, activeKey, steps: procedureSteps } = useUnboxProcedureSteps(row);
  useUnboxProcedureArrowKeys(row);
  const procedurePercent = useMemo(() => {
    const total = procedureSteps.length;
    if (total === 0) return 0;
    const done = procedureSteps.reduce((n, step) => n + (step.state === 'done' ? 1 : 0), 0);
    return Math.round((done / total) * 100);
  }, [procedureSteps]);

  const rowSerials = Array.isArray(row.serials) ? row.serials : [];
  const latestRowSerial = String(
    rowSerials[rowSerials.length - 1]?.serial_number ?? '',
  ).trim();
  const linkedOrder = useReturnOrderLinkage(c.serialInput.trim() || latestRowSerial);
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
  useEffect(() => {
    setTrackingEditorOpen(false);
    trackingTriggerRef.current = null;
    ticketLinkedRef.current = hasTicketId;
    previousScanDrivenRef.current = scanDriven;
    selectTask(scanDriven && hasTicketId ? 'ticket' : 'work');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carton gate
  }, [row.receiving_id ?? row.id]);

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

  const openTrackingEditor = useCallback(() => {
    const activeElement = document.activeElement;
    trackingTriggerRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    selectTask('work');
    setTrackingEditorOpen(true);
  }, [selectTask]);

  const closeTrackingEditor = useCallback(() => {
    setTrackingEditorOpen(false);
    window.setTimeout(() => trackingTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!trackingEditorOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeTrackingEditor();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [closeTrackingEditor, trackingEditorOpen]);

  const openInlineSerialEditor = useCallback(
    (lineId: number) => {
      selectTask('work');
      bands.open('items');
      lineCollapse.expand(lineId);
      scheduleFocusUnboxCaptureSerial(60);
    },
    [bands, lineCollapse, selectTask],
  );

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
        onEditFilledSerial: (serial) => {
          c.setHeaderSerialEdit(serial);
          openInlineSerialEditor(row.id);
        },
        onViewAllUnits: (line) => {
          if (line.id !== row.id) dispatchSelectLine(line);
          openInlineSerialEditor(line.id);
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
      openInlineSerialEditor,
      bands,
      bandCollapse.collapseAll,
      lineCollapse,
    ],
  );
  const fallbackDisplayTabs = useMemo<SectionTab[]>(() => {
    if (row.receiving_id == null) return [];
    return [
      {
        id: 'timeline',
        label: 'Timeline',
        icon: History,
        content: (
          <div className="space-y-4">
            <WorkspaceTimelineTab
              poId={row.zoho_purchaseorder_id || null}
              tracking={row.tracking_number ?? null}
              receivingId={row.receiving_id}
            />
            <ReceivingAuditPanel
              open
              receivingId={row.receiving_id}
              onClose={closeDisplays}
              hideHeader
            />
          </div>
        ),
      },
    ];
  }, [
    closeDisplays,
    row.receiving_id,
    row.tracking_number,
    row.zoho_purchaseorder_id,
  ]);


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
            else onOpenClaim('link');
          }}
          claimViewActive={claimViewActive}
          draftTicketNumber={draftTicketNumber}
          onEditTracking={openTrackingEditor}
          trackingEditOpen={trackingEditorOpen}
          photoStage="unbox_carton"
          onSendToTicketExternal={() => selectTask('ticket')}
        />
      }
    />
  );
  const fallbackDisplays = displaysOpen ? (
    <StationDisplaysPushStack
      ariaLabel="Unbox fallback displays"
      storageKey="unbox-fallback-displays-push-width"
      testId="unbox-fallback-displays-push"
      resizeTestId="unbox-fallback-displays-resize"
      tabs={fallbackDisplayTabs}
      activeTab={activeDisplayTab ?? STATION_DISPLAY_INDEX}
      onTabChange={openDisplay}
      onClose={closeDisplays}
      historyScopeKey={row.receiving_id ?? row.id}
    />
  ) : null;
  return (
    <StationScanPaneHost
      displaysOpen={displaysOpen}
      displays={fallbackDisplays}
      hostDataAttrs={{ 'data-unbox-pane-host': true }}
      centerTestId="unbox-station-center"
      center={
        <StationPanelRoot>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
            {stationContextBar}
            <StationWorkbench
              ambientWash={false}
              className="relative z-0 flex-1 bg-transparent"
              reserveScrollClearance="pager"
              reserveIdentityClearance={false}
              bodyFill={ticketMode || photosMode}

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
                        onNoteTyped={() => bands.open('label')}
                        row={row}
                        c={c}
                        chrome="raised"
                        reaction={receiveFeedback}
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
                        onOpenStatusHistory={() => openDisplay('timeline')}
                        onTicketDraftFilledChange={setTicketDraftFilled}
                        progressPercent={procedurePercent}
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
                  ticketMode || photosMode ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'
                }
                data-active-unbox-task={activeTask}
              >
                {ticketMode ? (
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
                ) : (
                <>
                  <AsListedBlock line={row} className="mx-2 mt-2" />
                  <UnboxReturnCallout row={row} />
                  <motion.div initial={false} animate="show" variants={revealContainer}>
                    <motion.div variants={revealItem}>{unboxOverview}</motion.div>
                  </motion.div>

                  {trackingEditorOpen ? (
                    <WorkspaceCard
                      label="Tracking"
                      actions={
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={closeTrackingEditor}
                        >
                          Done
                        </Button>
                      }
                      overflow="visible"
                    >
                      <TrackingNumbersEditor
                        autoFocus
                        trackingEdit={c.trackingEdit}
                        setTrackingEdit={c.setTrackingEdit}
                        onCommitTracking={(value) => {
                          const trimmed = value.trim();
                          if (trimmed !== (row.tracking_number || '').trim()) {
                            c.patch({ zoho_reference_number: trimmed || null });
                          }
                        }}
                        extraTrackings={c.extraTrackings}
                        setExtraTrackings={c.setExtraTrackings}
                        onCommitExtraTracking={(value, index) =>
                          void c.attachExtraBox(value, index)
                        }
                        primaryTrackingTrimmed={c.primaryTrackingTrimmed}
                      />
                    </WorkspaceCard>
                  ) : null}

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
