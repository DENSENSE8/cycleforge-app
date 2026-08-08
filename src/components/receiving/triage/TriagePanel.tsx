'use client';

/**
 * TriagePanel — the standalone right-pane editor for the **Receiving (Arrival /
 * triage)** mode: the fast "identify the carton before unbox" pass.
 *
 * Station column anatomy (Arrival carve-out of the Unbox-family host):
 *   - CENTRE is the door flow — identity ({@link StationContextBar}
 *     `placement="flow"`) → one white door-flow plane (`DISPLAYS_FLUSH_HOST` +
 *     `appSurfaceFillClass('chrome')`) holding PO / unfound **items** (no units
 *     chrome) → **Classify** → **Staging**. Identity abuts items with zero air
 *     (`reserveIdentityClearance={false}`, `bodyGap="none"`).
 *   - The bottom **dock** floats the internal item-note composer
 *     (`WorkspaceNotesCard` → `receiving_line.notes`) + the Save-for-unbox CTA.
 *     The note is not printed on Arrival; it carries to Unbox and displays there
 *     as the item's internal note.
 *   - Pairing/Linkage is the right-edge **Displays** push
 *     ({@link StationDisplaysPushStack} + {@link buildTriageDisplayTabs}),
 *     never a centre `SectionTabsSlider` strip.
 *   - {@link ScanStationUtilityRail} (slim white trailing chrome) carries the
 *     **carton cursor** (`↑` / `↓`) at the top and, when Displays is closed, the
 *     **`←|` expand** toggle in the **bottom** footer (left-dock twin). Not
 *     carton identity — a separate scan-station rail.
 *
 * The identity classify pills expand the centre Classify section; the `# ----`
 * PO chip opens the Linkage display and hands the PO avenue over as DATA
 * (`setPairingFocus` → the hub's `focusTab`), read on mount — never a timed
 * event (mirrors Unbox).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { StationDisplaysPushStack, STATION_DISPLAY_INDEX } from '@/components/station/displays';
import { UnboxDisplaysUtilityRailBody } from '../workspace/UnboxDisplaysUtilityRailBody';
import { useUnboxLineController } from '../workspace/line-edit/hooks/useUnboxLineController';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { markTriageCompleted, hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
import { useTriageStaging } from './useTriageStaging';
import { WorkflowRecommendationsStrip } from '../WorkflowRecommendationsStrip';
import { TriageClassifySection } from './TriageClassifySection';
import { StagingSection } from './StagingSection';
import { deriveTriageFocusFacts, resolveTriageFocus } from '@/lib/receiving/triage-focus';
import { buildTriageDisplayTabs, type TriageDisplayTab } from './build-triage-displays';
import { buildTriageDisplayIndexRows } from './triage-display-index';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import {
  dispatchIncomingAddInboundClose,
  dispatchReceivingOpenIncomingDetails,
  STATION_DISPLAYS_CLOSE_EVENT,
} from '@/utils/events';
import {
  DISPLAYS_FLUSH_HOST,
} from '@/design-system/shells/detail-stack';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';

export function TriagePanel({
  row,
  staffId,
  onClose,
  onPrevCarton,
  onNextCarton,
  prevCartonDisabled = false,
  nextCartonDisabled = false,
}: {
  row: ReceivingLineRow;
  staffId: string;
  onClose: () => void;
  /** Carton cursor — ↑ prev / ↓ next (same as left sidebar / DeskRailChromeRow). */
  onPrevCarton?: () => void;
  onNextCarton?: () => void;
  prevCartonDisabled?: boolean;
  nextCartonDisabled?: boolean;
}) {
  const c = useUnboxLineController(row, staffId, {});
  const staging = useTriageStaging(row);
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  const queryClient = useQueryClient();
  const [savingTriage, setSavingTriage] = useState(false);
  const [triageSaved, setTriageSaved] = useState(false);

  // The right-edge Displays push (Pairing only). `null` IS closed; `index` is
  // Root Index; a leaf id is the open body. No second `pairingOpen` flag.
  const [activeSideTab, setActiveSideTab] = useState<
    TriageDisplayTab | typeof STATION_DISPLAY_INDEX | null
  >(null);
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);
  const [classifyExpand, setClassifyExpand] = useState<{
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null>(null);

  const classifySectionRef = useRef<HTMLDivElement | null>(null);
  const stagingSectionRef = useRef<HTMLDivElement | null>(null);

  const claimDisplays = useCallback(
    (tab: TriageDisplayTab | typeof STATION_DISPLAY_INDEX) => {
      // One right-edge wrapper — Add inbound (RightRailHost) yields to Displays.
      dispatchIncomingAddInboundClose();
      setActiveSideTab(tab);
    },
    [],
  );
  const openDisplays = useCallback(
    (tab: TriageDisplayTab) => claimDisplays(tab),
    [claimDisplays],
  );
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);

  useEffect(() => {
    const onAddClaimsEdge = () => closeDisplays();
    window.addEventListener(STATION_DISPLAYS_CLOSE_EVENT, onAddClaimsEdge);
    return () => window.removeEventListener(STATION_DISPLAYS_CLOSE_EVENT, onAddClaimsEdge);
  }, [closeDisplays]);

  // The `# ----` PO chip → open Pairing on the PO avenue. The intent travels as
  // DATA (`pairingFocus` → the hub's `focusTab`, read on mount); a dispatched
  // event fires before the display's hub is listening (Unbox learned this).
  const openPoPairing = useCallback(() => {
    openDisplays('linkage');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, [openDisplays]);

  const openClassifyFromHeader = useCallback(
    (picker: 'urgency' | 'platform' | 'type') => {
      setClassifyExpand((prev) => ({
        dimension: picker,
        requestId: (prev?.requestId ?? 0) + 1,
      }));
      classifySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    [],
  );

  // The pane "expand" toggle: unmet Pairing → open Displays; unmet Classify /
  // Staging → scroll the centre door-flow section (those live under items now).
  // Already-done / none → open Pairing (the only Displays body).
  const openDisplaysForExpand = useCallback(() => {
    const facts = deriveTriageFocusFacts(
      row,
      row.triage_complete === true || hasTriageBeenCompleted(row.receiving_id),
    );
    const target = resolveTriageFocus(facts);
    if (target === 'classify') {
      classifySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (target === 'stage') {
      stagingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    openDisplays('linkage');
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
  // already staged. Pairing opens on demand (PO chip / the pane expand toggle);
  // Classify · Staging live in the centre, so the Displays push is not
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

  const triageDisplayTabs = useMemo(
    () =>
      buildTriageDisplayTabs({
        row,
        staffId,
        pairingFocus,
      }),
    [row, staffId, pairingFocus],
  );

  const triageDisplayIndexRows = useMemo(
    () =>
      buildTriageDisplayIndexRows({
        linkagePaired: Boolean(String(row.zoho_purchaseorder_id ?? '').trim()),
        isUnfound: shouldUseUnmatchedItemsSurface(row),
      }),
    [row],
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

  // Scan-station chrome: utility rail when Displays closed (`←|` bottom
  // footer); ↑↓ on details panel top-right when open.
  const showCartonCursor = Boolean(onPrevCarton || onNextCarton);
  const utilityRailBody = !activeSideTab ? (
    <UnboxDisplaysUtilityRailBody
      onOpenDisplays={openDisplaysForExpand}
      cartonCursor={
        showCartonCursor ? (
          <ScanStationCartonCursor
            onPrev={onPrevCarton}
            onNext={onNextCarton}
            prevDisabled={prevCartonDisabled}
            nextDisabled={nextCartonDisabled}
            orientation="vertical"
            prevTestId="arrival-carton-prev"
            nextTestId="arrival-carton-next"
            groupTestId="arrival-carton-cursor"
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
      prevTestId="arrival-carton-prev"
      nextTestId="arrival-carton-next"
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
                // `tabs` is deliberately EMPTY: Pairing is Displays; Classify ·
                // Staging stack under items in the centre door flow.
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
                <div
                  className={cn(
                    DISPLAYS_FLUSH_HOST,
                    appSurfaceFillClass('chrome'),
                    'min-h-0 flex-1 overflow-y-auto',
                  )}
                  data-testid="arrival-door-flow"
                >
                  <div className="space-y-0">
                    <POUnboxingSection
                      row={row}
                      staffId={staffId}
                      // Door-flow items: matched → PoLinesAccordion; unfound →
                      // interactive UnmatchedAccordionSurface without units
                      // chrome (no condition · serial / Units). No "Open in
                      // unbox" — save for unbox from the dock. Suppress the
                      // "PO items · N" eyebrow — identity abuts the lines.
                      suppressItemsHeader
                      poItems
                      matching
                      openInUnbox={false}
                      editLines
                      serialScan={false}
                      unitsChrome={false}
                      c={c}
                    />
                    <div ref={classifySectionRef}>
                      <TriageClassifySection
                        row={row}
                        c={c}
                        expandDimension={classifyExpand?.dimension ?? null}
                        expandRequestId={classifyExpand?.requestId ?? 0}
                      />
                    </div>
                    <div ref={stagingSectionRef}>
                      <StagingSection staging={staging} eyebrow="Staging" />
                    </div>
                  </div>
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
            <StationDisplaysPushStack
              ariaLabel="Arrival displays"
              storageKey="arrival-displays-push-width"
              testId="arrival-displays-push"
              resizeTestId="arrival-displays-push-resize"
              tabs={triageDisplayTabs}
              indexRows={triageDisplayIndexRows}
              activeTab={activeSideTab}
              onTabChange={(id) => {
                if (id === STATION_DISPLAY_INDEX) {
                  claimDisplays(STATION_DISPLAY_INDEX);
                  return;
                }
                claimDisplays(id as TriageDisplayTab);
              }}
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
