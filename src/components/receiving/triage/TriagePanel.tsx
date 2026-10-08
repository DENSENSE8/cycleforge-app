'use client';

/** TriagePanel — the standalone right-pane editor for the **Receiving (Arrival / triage)** mode: */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import {
  StationPanelRoot,
  StationWorkbench,
  StationScanPaneHost,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { StationContextBar } from '@/components/station/entity-context';
import { resolveTriageTerminal } from './terminal/triage-terminal';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import { WorkspaceActionFeedbackSlot } from '../workspace/WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from '../workspace/InlineActionFeedbackCard';
import { LineEditModals } from '../workspace/line-edit/LineEditModals';
import { LineCartonContextSection } from '../workspace/line-edit/LineCartonContextSection';
import { POUnboxingSection } from '../workspace/line-edit/POUnboxingSection';
import {
  CartonDisplaysActionFloor,
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
} from '@/components/station/displays';
import { useUnboxLineController } from '../workspace/line-edit/hooks/useUnboxLineController';
import { useWorkspaceTicketDraft } from '../workspace/line-edit/hooks/useWorkspaceTicketDraft';
import { StationTicketPane } from '@/components/composer';
import { StationPhotosTask } from '@/components/station/StationPhotosTask';
import { useStationTaskController } from '@/components/station/useStationTaskController';
import { useStationHasPhotos } from '@/components/station/useStationHasPhotos';
import { SCAN_STATION_TONES } from '@/lib/sidebar-navigation';
import { PackageCheck } from '@/components/Icons';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { markTriageCompleted, hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
import { useTriageStaging } from './useTriageStaging';
import { ArrivalCartonNotesEntry } from './ArrivalCartonNotesEntry';
import { deriveTriageFocusFacts, resolveTriageFocus } from '@/lib/receiving/triage-focus';
import { buildTriageDisplayTabs, type TriageDisplayTab } from './build-triage-displays';
import { buildTriageDisplayIndexRows } from './triage-display-index';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import {
  dispatchStationDeskOccupantClose,
  STATION_DISPLAYS_CLOSE_EVENT,
} from '@/utils/events';
import {
  DISPLAYS_FLUSH_HOST,
} from '@/design-system/shells/detail-stack';
import { STATION_SCAN_WELL_CLASS } from '@/components/station/scan-depth';
import { cn } from '@/utils/_cn';

export function TriagePanel({
  row,
  staffId,
  onClose,
}: {
  row: ReceivingLineRow;
  staffId: string;
  onClose: () => void;
}) {
  const staging = useTriageStaging(row);
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  const queryClient = useQueryClient();
  const [savingTriage, setSavingTriage] = useState(false);
  const [triageSaved, setTriageSaved] = useState(false);

  const hasPhotos = useStationHasPhotos(row.receiving_id, row.photo_count);
  const {
    activeTask,
    activeDisplay: activeSideTab,
    ticketActive,
    photosActive,
    displaysActive,
    selectTask,
    openDisplay,
    closeDisplays,
  } = useStationTaskController({
    owner: 'arrival',
    workLabel: 'Arrival',
    workIcon: PackageCheck,
    workTone: SCAN_STATION_TONES.triage,
    scopeKey: row.receiving_id ?? row.id,
    context: {
      hasPhotos,
      hasTicket: Boolean(String(row.zendesk_ticket ?? '').trim()),
    },
  });
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);

  const claimDisplays = useCallback(
    (tab: string) => {
      dispatchStationDeskOccupantClose();
      openDisplay(tab);
    },
    [openDisplay],
  );
  const openDisplays = useCallback(
    (tab: TriageDisplayTab) => claimDisplays(tab),
    [claimDisplays],
  );

  useEffect(() => {
    const onAddClaimsEdge = () => closeDisplays();
    window.addEventListener(STATION_DISPLAYS_CLOSE_EVENT, onAddClaimsEdge);
    return () => window.removeEventListener(STATION_DISPLAYS_CLOSE_EVENT, onAddClaimsEdge);
  }, [closeDisplays]);

  const onOpenClaim = useCallback(
    (_mode: 'create' | 'link' = 'create') => {
      selectTask('ticket');
    },
    [selectTask],
  );
  const c = useUnboxLineController(row, staffId, { onOpenClaim });
  const claimTicketId = c.providerTicketId ?? null;

  const openPoPairing = useCallback(() => {
    openDisplays('linkage');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, [openDisplays]);

  const openDisplaysIndex = useCallback(() => {
    selectTask('displays');
  }, [selectTask]);

  const toggleTicketView = useCallback(() => {
    selectTask(ticketActive ? 'work' : 'ticket');
  }, [selectTask, ticketActive]);

  const openClaimView = useCallback(() => {
    selectTask(ticketActive && claimTicketId == null ? 'work' : 'ticket');
  }, [claimTicketId, selectTask, ticketActive]);

  const openTimelineDisplay = useCallback(() => {
    openDisplays('timeline');
  }, [openDisplays]);

  const openFindTicketDisplay = useCallback(() => {
    selectTask('ticket');
  }, [selectTask]);


  const onClaimTicketCreated = useCallback(
    (ticketNumber: string) => {
      toast.success(`Claim filed — ${ticketNumber}`);
      void c.invalidateSupportTicket();
      invalidateSupportContextCaches(queryClient);
      if (row.receiving_id != null) {
        patchReceivingRailTicketByCarton(queryClient, row.receiving_id, ticketNumber);
      }
      dispatchLineUpdated({ id: row.id, zendesk_ticket: ticketNumber, notes: row.notes });
      invalidateReceivingFeeds(queryClient);
      selectTask('ticket');
    },
    [c, queryClient, row.id, row.notes, row.receiving_id, selectTask],
  );
  const ticketDraftModel = useWorkspaceTicketDraft({
    row,
    ticketId: claimTicketId,
    onTicketCreated: onClaimTicketCreated,
  });

  useEffect(() => {
    setActionFeedback(null);
    setTriageSaved(false);
    c.setReturnClaimPrefill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per carton open
  }, [row.id]);

  // On open, tell the operator when there is nothing left to do — the carton is already staged.
  useEffect(() => {
    const facts = deriveTriageFocusFacts(
      row,
      row.triage_complete === true || hasTriageBeenCompleted(row.receiving_id),
    );
    if (resolveTriageFocus(facts) === 'already-staged') {
      toast.success('Already staged for unbox', {
        description: 'Nothing left to do here — open it in Unbox when ready.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per carton
  }, [row.id]);

  const handleSaveForUnbox = useCallback(async () => {
    if (row.receiving_id == null) {
      toast.error('This carton has no receiving id yet — try again after it resolves.');
      return;
    }
    setSavingTriage(true);
    try {
      const res = await fetch('/api/receiving/triage/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiving_id: row.receiving_id,
          client_event_id: safeRandomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not save for unbox');
        return;
      }
      markTriageCompleted(row.receiving_id);
      dispatchLineUpdated({ id: row.id, triage_complete: true });
      invalidateReceivingFeeds(queryClient);
      setTriageSaved(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      toast.error('Could not save for unbox');
    } finally {
      setSavingTriage(false);
    }
  }, [row.receiving_id, row.id, queryClient, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      if (savingTriage || triageSaved) return;
      e.preventDefault();
      void handleSaveForUnbox();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveForUnbox, savingTriage, triageSaved]);

  const triageDisplayTabs = useMemo(
    () =>
      buildTriageDisplayTabs({
        row,
        staffId,
        providerTicketId: claimTicketId,
        pairingFocus,
        onFindTicket: openFindTicketDisplay,
        staging,
        onLocationPlaced: closeDisplays,
        activeTab:
          activeSideTab === 'linkage' ||
          activeSideTab === 'location' ||
          activeSideTab === 'timeline'
            ? activeSideTab
            : null,
      }),
    [
      activeSideTab,
      row,
      staffId,
      claimTicketId,
      pairingFocus,
      closeDisplays,
      openFindTicketDisplay,
      staging,
    ],
  );

  const triageDisplayIndexRows = useMemo(
    () =>
      buildTriageDisplayIndexRows(
        triageDisplayTabs.map((t) => t.id as TriageDisplayTab),
        {
          linkagePaired: Boolean(String(row.zoho_purchaseorder_id ?? '').trim()),
          isUnfound: shouldUseUnmatchedItemsSurface(row),
        },
      ),
    [triageDisplayTabs, row],
  );


  const buildTerminal = useCallback(
    (kind: string) =>
      resolveTriageTerminal(kind, {
        triageSaved,
        savingTriage,
        onSaveForUnbox: handleSaveForUnbox,
      }),
    [triageSaved, savingTriage, handleSaveForUnbox],
  );

  // Terminal is carton-scoped (Save for unbox), never tab-scoped — a stable id
  // so opening a Displays tab never re-labels the dock (triage resolves every
  // kind to `mode-default`).
  const terminalVm = useStationTerminalAction({
    surface: 'triage',
    mode: 'triage',
    tabId: 'arrival',
    build: buildTerminal,
  });

  // The composer's bottom-right CTA — same shape Unbox mounts (`bubbleTerminal`
  // in LineEditPanel): an embedded pill on the notes card's trailing edge, never
  // a separate full-width terminal strip above the dock.
  const bubbleTerminal = terminalVm ? (
    <div className="shrink-0" data-arrival-dock-terminal>
      <StationTerminalDock embedded embeddedChrome="pill" vm={terminalVm} />
    </div>
  ) : null;


  return (
    <>
      <StationScanPaneHost
        displaysOpen={displaysActive}
        hostDataAttrs={{ 'data-arrival-pane-host': true }}
        centerTestId="arrival-station-center"
        center={
          <StationPanelRoot>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              <StationContextBar
                placement="flow"
                identity={
                  <LineCartonContextSection
                    row={row}
                    staffId={staffId}
                    c={c}
                    expandClassifyWhenPending={false}
                    // Classify (urgency · platform · type) lives HERE, on the identity header, and nowhere else on this station.
                    showClassifyControls
                    classifyInteractive
                    onEditPo={openPoPairing}
                    onSendToTicketExternal={() => c.setPhotoNoteOpen(true)}
                    poEditOpen={activeSideTab === 'linkage'}
                    onToggleClaimView={openClaimView}
                    claimViewActive={ticketActive && claimTicketId == null}
                    onToggleTicketView={toggleTicketView}
                    ticketViewActive={ticketActive && claimTicketId != null}
                    // Triage is the ARRIVAL pass — the one surface that owns this
                    // stage. Explicit so its correctness doesn't ride on a default.
                    photoStage="arrival_package"
                  />
                }
              />
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                // Same dock as Unbox now (raised notes card, no staging band),
                // so the same clearance: `pb-32`, not the `pb-56` pager reserve
                // the two-band flush floor needed.
                bodyFill={ticketActive || photosActive}
                reserveScrollClearance
                // Identity is in-flow (`StationContextBar placement="flow"`)
                // above this workbench — no guessed stacked pt clearance.
                reserveIdentityClearance={false}
                // Flat data floor — no vertical air between centre surfaces.
                bodyGap="none"
                // `tabs` is deliberately EMPTY: Pairing and Locations are
                // Displays; Classify is the identity header; the centre is the
                // carton's items and nothing else.
                feedback={
                  <WorkspaceActionFeedbackSlot
                    feedback={actionFeedback}
                    onDismiss={() => setActionFeedback(null)}
                  />
                }
                dock={
                  // The Unbox floor, exactly:
                  <div
                    className={slicedActionDockWrapperClass({ docked: false })}
                    data-arrival-dock-float
                  >
                    <div className={`pointer-events-auto w-full min-w-0 ${STATION_WORKBENCH_COLUMN}`}>
                      {terminalVm?.disabled && terminalVm.disabledReason ? (
                        <p
                          role="status"
                          className="mb-1 text-right text-role-caption font-semibold text-amber-700"
                        >
                          {terminalVm.disabledReason}
                        </p>
                      ) : null}
                      {terminalVm ? (
                        <ArrivalCartonNotesEntry
                          row={row}
                          ticketDraftModel={ticketDraftModel}
                          providerTicketId={claimTicketId}
                          trailingAction={bubbleTerminal}
                          onPrimaryAction={() => void handleSaveForUnbox()}
                          primaryActionDisabled={Boolean(terminalVm.disabled)}
                          onOpenStatusHistory={openTimelineDisplay}
                        />
                      ) : null}
                    </div>
                  </div>
                }
              >
                {ticketActive ? (
                  <StationTicketPane
                    row={row}
                    ticketId={claimTicketId}
                    draft={ticketDraftModel}
                  />
                ) : photosActive ? (
                  <StationPhotosTask
                    receivingId={row.receiving_id ?? null}
                    staffId={staffId}
                    poRef={row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || null}
                    photoStage="arrival_package"
                    onSendToTicket={() => c.setPhotoNoteOpen(true)}
                  />
                ) : (
                  <div
                    className={cn(
                      DISPLAYS_FLUSH_HOST,
                      STATION_SCAN_WELL_CLASS,
                      'min-h-0 flex-1 overflow-y-auto',
                    )}
                    data-testid="arrival-door-flow"
                    data-active-arrival-task={activeTask}
                  >
                    <div className="space-y-0">
                      <POUnboxingSection
                        row={row}
                        staffId={staffId}
                        suppressItemsHeader
                        poItems
                        matching
                        openInUnbox={false}
                        editLines
                        serialScan={false}
                        unitsChrome={false}
                        c={c}
                      />
                    </div>
                  </div>
                )}
              </StationWorkbench>
            </div>
          </StationPanelRoot>
        }
        displays={
          displaysActive ? (
            <StationDisplaysPushStack
              ariaLabel="Arrival displays"
              storageKey="arrival-displays-push-width"
              testId="arrival-displays-push"
              resizeTestId="arrival-displays-push-resize"
              tabs={triageDisplayTabs}
              indexRows={triageDisplayIndexRows}
              activeTab={activeSideTab ?? STATION_DISPLAY_INDEX}
              onTabChange={claimDisplays}
              onClose={closeDisplays}
              headerActions={
                <CartonDisplaysActionFloor
                  testIdPrefix="arrival"
                  receivingId={row.receiving_id}
                  isUnfound={shouldUseUnmatchedItemsSurface(row)}
                  onDeleted={closeDisplays}
                  editSelected={activeSideTab === 'linkage'}
                  deleteIdentity={{
                    tracking: row.tracking_number,
                    poNumber: row.zoho_purchaseorder_number,
                  }}
                  onEdit={() => openDisplays('linkage')}
                  onLink={() => openDisplays('linkage')}
                  sync={{
                    onInventorySync: () => c.refreshInventoryDossier(),
                    inventorySyncing: Boolean(c.inventoryRefreshing),
                    canInventorySync:
                      row.receiving_id != null &&
                      Boolean((row.zoho_purchaseorder_id || '').trim()),
                  }}
                />
              }
            />
          ) : null
        }
      />

      <LineEditModals row={row} c={c} />
    </>
  );
}
