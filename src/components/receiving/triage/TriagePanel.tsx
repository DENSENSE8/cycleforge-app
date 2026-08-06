'use client';

/**
 * TriagePanel — the standalone right-pane editor for the **Receiving (Arrival /
 * triage)** mode: the fast "identify the carton before unbox" pass.
 *
 * Station column anatomy, same grammar as Unbox ({@link LineEditPanel}):
 *   - CENTRE is the carton's WORK — identity ({@link StationContextBar}
 *     `placement="flow"`) → the PO / unfound **lines** (`POUnboxingSection` →
 *     `LinePoItemsSection`, which routes matched vs unmatched). Identity abuts
 *     lines with zero air (`reserveIdentityClearance={false}`, `bodyGap="none"`).
 *   - The bottom **dock** floats the internal item-note composer
 *     (`WorkspaceNotesCard` → `receiving_line.notes`) + the Save-for-unbox CTA.
 *     The note is not printed on Arrival; it carries to Unbox and displays there
 *     as the item's internal note.
 *   - The reference tools — Classify · Staging · Pairing/Linkage — are the
 *     right-edge **Displays** push ({@link ReceivingDisplaysPushStack} +
 *     {@link buildTriageDisplayTabs}), never a centre `SectionTabsSlider` strip.
 *   - {@link ScanStationUtilityRail} (slim white trailing chrome) carries the
 *     **carton cursor** (`↑` next / `↓` prev) and, when Displays is closed, the
 *     **`←|` expand** toggle. Not carton identity — a separate scan-station rail.
 *
 * The identity classify pills open the Classify display; the `# ----` PO chip
 * opens the Linkage display and hands the PO avenue over as DATA (`setPairingFocus`
 * → the hub's `focusTab`), read on mount — never a timed event (mirrors Unbox).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationPanelRoot,
  StationWorkbench,
  StationScanPaneHost,
  ScanStationCartonCursor,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { StationContextBar } from '@/components/station/entity-context';
import { slicedActionDockWrapperClass } from '@/design-system/primitives';
import { resolveTriageTerminal } from './terminal/triage-terminal';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { WorkspaceActionFeedbackSlot } from '../workspace/WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from '../workspace/InlineActionFeedbackCard';
import { ReceivingPhotoPeek } from '../workspace/line-edit/ReceivingPhotoPeek';
import { LineEditModals } from '../workspace/line-edit/LineEditModals';
import { LineCartonContextSection } from '../workspace/line-edit/LineCartonContextSection';
import { POUnboxingSection } from '../workspace/line-edit/POUnboxingSection';
import { WorkspaceNotesCard } from '../workspace/line-edit/WorkspaceNotesCard';
import { ReceivingDisplaysPushStack } from '../workspace/ReceivingDisplaysPushStack';
import { UnboxDisplaysEdgeToggle } from '../workspace/UnboxDisplaysEdgeToggle';
import { useUnboxLineController } from '../workspace/line-edit/hooks/useUnboxLineController';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { markTriageCompleted, hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { useTriageStaging } from './useTriageStaging';
import { WorkflowRecommendationsStrip } from '../WorkflowRecommendationsStrip';
import { UnfoundTodoStrip } from './UnfoundTodoStrip';
import { deriveTriageFocusFacts, resolveTriageFocus } from '@/lib/receiving/triage-focus';
import { buildTriageDisplayTabs, type TriageDisplayTab } from './build-triage-displays';
import { dispatchReceivingOpenIncomingDetails } from '@/utils/events';

export function TriagePanel({
  row,
  staffId,
  onClose,
  onPrevCarton,
  onNextCarton,
}: {
  row: ReceivingLineRow;
  staffId: string;
  onClose: () => void;
  /** Carton cursor — the queue reads newest-at-top, so `↑` NEXT / `↓` PREV. */
  onPrevCarton?: () => void;
  onNextCarton?: () => void;
}) {
  const c = useUnboxLineController(row, staffId, {});
  const staging = useTriageStaging(row);
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  const queryClient = useQueryClient();
  const [savingTriage, setSavingTriage] = useState(false);
  const [triageSaved, setTriageSaved] = useState(false);

  // The right-edge Displays push. `null` IS closed — the selected tab's
  // selected-ness is the open state, so there is no second `pairingOpen` flag.
  const [activeSideTab, setActiveSideTab] = useState<TriageDisplayTab | null>(null);
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);
  const [classifyExpand, setClassifyExpand] = useState<{
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null>(null);

  const openDisplays = useCallback((tab: TriageDisplayTab) => setActiveSideTab(tab), []);
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);

  // The `# ----` PO chip → open Pairing on the PO avenue. The intent travels as
  // DATA (`pairingFocus` → the hub's `focusTab`, read on mount); a dispatched
  // event fires before the display's hub is listening (Unbox learned this).
  const openPoPairing = useCallback(() => {
    openDisplays('linkage');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, [openDisplays]);

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

  // The pane "expand" toggle opens the Displays on the carton's first UNMET
  // triage step — unfound → Pairing, unclassified → Classify, unstaged →
  // Staging — so one click lands on what needs doing (not always the leftmost
  // tab). The identity chips still open a specific tool directly.
  const openDisplaysForExpand = useCallback(() => {
    const facts = deriveTriageFocusFacts(
      row,
      row.triage_complete === true || hasTriageBeenCompleted(row.receiving_id),
    );
    const target = resolveTriageFocus(facts);
    openDisplays(
      target === 'pair' ? 'linkage' : target === 'stage' ? 'staging' : 'classify',
    );
  }, [row, openDisplays]);

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
    setTriageSaved(false);
    setActiveSideTab(null);
  }, [row.id]);

  // On open, tell the operator when there is nothing left to do — the carton is
  // already staged. Reference tools open on demand (identity chips / the pane
  // expand toggle); the centre lines are the work, so the Displays push is not
  // auto-opened on focus (matches Unbox).
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

  const triageDisplayTabs = useMemo(
    () =>
      buildTriageDisplayTabs({
        row,
        staffId,
        c,
        staging,
        classifyExpand,
        pairingFocus,
      }),
    [row, staffId, c, staging, classifyExpand, pairingFocus],
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

  const isReturn = isReturnIntake(row);
  const unfoundMessage = isReturn
    ? "No claim hint on the label — that's fine (C6). Save for unbox any time; it stays on Unfound until paired."
    : 'Still unfound — pairing will retry. Save for unbox is allowed while it works.';

  // Scan-station chrome: utility rail when Displays closed; ↑↓ on details
  // panel top-right when open.
  const showCartonCursor = Boolean(onPrevCarton || onNextCarton);
  const utilityRailBody = !activeSideTab ? (
    <div className="flex flex-col items-center gap-0 pt-0">
      <UnboxDisplaysEdgeToggle variant="pane-open" onClick={openDisplaysForExpand} />
      {showCartonCursor ? (
        <ScanStationCartonCursor
          onNext={onNextCarton}
          onPrev={onPrevCarton}
          orientation="vertical"
          nextTestId="arrival-carton-next"
          prevTestId="arrival-carton-prev"
          groupTestId="arrival-carton-cursor"
        />
      ) : null}
    </div>
  ) : null;

  const displaysCartonCursor = showCartonCursor ? (
    <ScanStationCartonCursor
      onNext={onNextCarton}
      onPrev={onPrevCarton}
      orientation="horizontal"
      size="sm"
      nextTestId="arrival-carton-next"
      prevTestId="arrival-carton-prev"
      groupTestId="arrival-carton-cursor"
    />
  ) : null;

  return (
    <>
      <StationScanPaneHost
        displaysOpen={Boolean(activeSideTab)}
        hostDataAttrs={{ 'data-arrival-pane-host': true }}
        centerTestId="arrival-station-center"
        utilityRail={utilityRailBody}
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
                    showClassifyControls
                    classifyInteractive
                    onClassifyPillOpen={openClassifyFromHeader}
                    onEditPo={openPoPairing}
                    onOrderDetails={openOrderConnectionDetails}
                    poEditOpen={activeSideTab === 'linkage'}
                    // Triage is the ARRIVAL pass — the one surface that owns this
                    // stage. Explicit so its correctness doesn't ride on a default.
                    photoStage="arrival_package"
                  />
                }
              />
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance
                // Identity is in-flow (`StationContextBar placement="flow"`)
                // above this workbench — no guessed stacked pt clearance.
                reserveIdentityClearance={false}
                // Flat data floor — no vertical air between centre surfaces.
                bodyGap="none"
                entityContext={<WorkflowRecommendationsStrip row={row} surface="triage" />}
                // `tabs` is deliberately EMPTY: the reference tools (Classify ·
                // Staging · Pairing) moved to the right-edge Displays column, so
                // the carton's lines own the centre.
                feedback={
                  <WorkspaceActionFeedbackSlot
                    feedback={actionFeedback}
                    onDismiss={() => setActionFeedback(null)}
                  />
                }
                dock={
                  // ONE elevated shell floating over the canvas — the internal
                  // item-note composer + Save for unbox. The note (`receiving_line.
                  // notes`) is not printed here; it carries to Unbox and displays
                  // there as the item's internal note. Placement SoT =
                  // slicedActionDockWrapperClass({ docked: false }).
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
                      <WorkspaceNotesCard
                        row={row}
                        c={c}
                        onActionFeedback={setActionFeedback}
                        // Enter in the notes field commits Save for unbox.
                        onPrimaryAction={
                          terminalVm ? () => void terminalVm.onClick() : undefined
                        }
                        primaryActionDisabled={Boolean(terminalVm?.disabled)}
                        trailingAction={<StationTerminalDock embedded vm={terminalVm} />}
                      />
                    </div>
                  </div>
                }
              >
                <div className="space-y-0">
                  <POUnboxingSection
                    row={row}
                    staffId={staffId}
                    // Triage READS the lines (no serial capture, no accordion
                    // edit); `LinePoItemsSection` routes matched (PO items) vs
                    // unfound (unmatched surface) internally. No "Open in unbox"
                    // here — the operator saves for unbox from the dock.
                    poItems
                    matching={false}
                    openInUnbox={false}
                    editLines={false}
                    serialScan={false}
                    c={c}
                    onItemDescFeedback={handleItemDescFeedback}
                    onItemDescSaved={handleItemDescSaved}
                  />
                  {row.receiving_source === 'unmatched' ? (
                    <UnfoundTodoStrip message={unfoundMessage} />
                  ) : null}
                </div>
              </StationWorkbench>
            </div>

            {row.receiving_id != null ? (
              /* Triage is the ARRIVAL pass — the peek shows package (door) evidence
                 only; unbox carton/item shots belong to the unbox surfaces. */
              <ReceivingPhotoPeek
                receivingId={row.receiving_id}
                staffId={Number(staffId) || 0}
                poRef={row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || null}
                photoIntent="package"
              />
            ) : null}
          </StationPanelRoot>
        }
        displays={
          activeSideTab ? (
            <ReceivingDisplaysPushStack
              ariaLabel="Arrival displays"
              storageKey="arrival-displays-push-width"
              testId="arrival-displays-push"
              resizeTestId="arrival-displays-push-resize"
              tabs={triageDisplayTabs}
              activeTab={activeSideTab}
              onTabChange={(id) => setActiveSideTab(id as TriageDisplayTab)}
              onClose={closeDisplays}
              headerTrailing={displaysCartonCursor}
            />
          ) : null
        }
      />

      <LineEditModals row={row} c={c} />
    </>
  );
}
