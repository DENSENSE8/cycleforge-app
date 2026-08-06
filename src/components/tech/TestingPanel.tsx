'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveTestingLineTitle } from '@/lib/print/printProductLabel';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  StationPanelRoot,
  StationScanPaneHost,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { ReceivingDisplaysPushStack } from '@/components/receiving/workspace/ReceivingDisplaysPushStack';
import { UnboxDisplaysEdgeToggle } from '@/components/receiving/workspace/UnboxDisplaysEdgeToggle';
import { UnboxLabelPreview } from '@/components/receiving/workspace/line-edit/UnboxLabelPreview';
import { WorkspaceNotesCard } from '@/components/receiving/workspace/line-edit/WorkspaceNotesCard';
import { StationContextBar } from '@/components/station/entity-context';
import {
  TESTING_OPEN_SKU_PAIRING_EVENT,
  useSkuTestingData,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { useTestingLineController } from '@/components/tech/hooks/useTestingLineController';
import { resolveTestingTerminal } from './testing-panel/terminal/testing-terminal';
import { useTestingPrimaryAction } from './testing-panel/useTestingPrimaryAction';
import { TestingCartonHeader } from './testing-panel/TestingCartonHeader';
import { TestingScanSessionFeedback } from './testing-panel/TestingScanSessionFeedback';
import {
  sessionMatchesLine,
  useTestingScanSession,
} from '@/lib/testing/testing-scan-session-bridge';
import { TestingPoUnboxingSection } from './testing-panel/TestingPoUnboxingSection';
import { TestingPanelModals } from './testing-panel/TestingPanelModals';
import { UnitPackPhotoPeek } from '@/components/packer/UnitPackPhotoPeek';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import {
  buildTestingDisplayTabs,
  type TestingDisplayTab,
} from './testing-panel/build-testing-displays';

/**
 * Right-pane TESTING display — Unbox SoT anatomy.
 *
 * Centre = flush PO lines + {@link UnboxLabelPreview}. Dock = **label / item
 * notes** (`receiving_line.notes` via {@link WorkspaceNotesCard}) + Pass ·
 * Print — always, never swapped for ticket reply. Ticket replies live in the
 * Ticket Displays body (inline composer), same grain split as Unbox.
 * Reference tools (Ticket · Pairing · Checklist · Manuals · Timeline ·
 * Linkage) live on Displays push. Operator copy: Open displays / Hide right
 * panel.
 */

export function TestingPanel({
  row,
  staffId,
  onBackToBrowse,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Clear the open line and return to the tested-lines browse. */
  onBackToBrowse?: () => void;
}) {
  const productTitle = resolveTestingLineTitle(row);

  const c = useTestingLineController(row, staffId);
  const { primaryDisabled, primaryLabel, primaryTitle } = useTestingPrimaryAction(c, row);
  const claimTicketId = c.providerTicketId ?? null;

  const hasSkuTabs = Boolean(row.sku && row.id != null);
  const skuTestingData = useSkuTestingData(
    row.id,
    row.sku ?? '',
    productTitle,
    c.activeSerial?.id ?? null,
  );

  const timelineSerials = useMemo(
    () =>
      (row.serials ?? [])
        .map((s) => String(s.serial_number || '').trim())
        .filter(Boolean),
    [row.serials],
  );
  const poIdForTimeline = String(row.zoho_purchaseorder_id ?? '').trim();
  const trackingForTimeline = String(row.tracking_number ?? '').trim();
  const hasTimelineTab =
    trackingForTimeline.length > 0 ||
    row.receiving_id != null ||
    timelineSerials.length > 0;

  // Displays push — `null` IS closed (no separate open flag).
  const [activeSideTab, setActiveSideTab] = useState<TestingDisplayTab | null>(null);
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  const openDisplays = useCallback((tab: TestingDisplayTab) => setActiveSideTab(tab), []);
  const openDisplaysForExpand = useCallback(() => openDisplays('ticket'), [openDisplays]);
  const openPoPairing = useCallback(() => {
    setActiveSideTab('linkage');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, []);
  const toggleTicketView = useCallback(() => {
    if (activeSideTab === 'ticket') closeDisplays();
    else openDisplays('ticket');
  }, [activeSideTab, closeDisplays, openDisplays]);
  const openClaimView = useCallback(() => {
    openDisplays('ticket');
    c.openClaimModal('create');
  }, [openDisplays, c]);

  /** Auto-match Find ticket → Ticket display (link existing). */
  const openFindTicketDisplay = useCallback(() => {
    openDisplays('ticket');
    c.openClaimModal('link');
  }, [openDisplays, c]);

  useEffect(() => {
    setActiveSideTab(null);
  }, [row.id]);

  useEffect(() => {
    const openSkuPairing = () => openDisplays('pairing');
    window.addEventListener(TESTING_OPEN_SKU_PAIRING_EVENT, openSkuPairing);
    return () => window.removeEventListener(TESTING_OPEN_SKU_PAIRING_EVENT, openSkuPairing);
  }, [openDisplays]);

  const displayTabs = useMemo(
    () =>
      buildTestingDisplayTabs({
        row,
        staffId,
        c,
        productTitle,
        hasSkuTabs,
        hasTimelineTab,
        skuTestingData,
        timelineSerials,
        poIdForTimeline,
        trackingForTimeline,
        pairingFocus,
        onFindTicket: openFindTicketDisplay,
      }),
    [
      row,
      staffId,
      c,
      productTitle,
      hasSkuTabs,
      hasTimelineTab,
      skuTestingData,
      timelineSerials,
      poIdForTimeline,
      trackingForTimeline,
      pairingFocus,
      openFindTicketDisplay,
    ],
  );

  const resolvedSideTab: TestingDisplayTab | null = useMemo(() => {
    if (!activeSideTab) return null;
    if (displayTabs.some((t) => t.id === activeSideTab)) return activeSideTab;
    return (displayTabs[0]?.id as TestingDisplayTab | undefined) ?? null;
  }, [activeSideTab, displayTabs]);

  // Carton-terminal always — Ticket display keeps Reply local (inline). A
  // Displays click must not re-label the dock (Unbox grammar).
  const buildTerminal = useCallback(
    (kind: string) =>
      resolveTestingTerminal(kind, {
        primaryLabel,
        primaryTitle,
        primaryDisabled,
        isPrinting: c.isPrinting,
        onPrimary: () => void c.handlePrimary(),
      }),
    [primaryLabel, primaryTitle, primaryDisabled, c],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'test',
    mode: 'testing',
    tabId: null,
    build: buildTerminal,
  });

  const scanSession = useTestingScanSession();
  const scanSessionForThisLine = sessionMatchesLine(scanSession, row);

  const utilityRailBody = !resolvedSideTab ? (
    <div className="flex flex-col items-center gap-0 pt-0">
      <UnboxDisplaysEdgeToggle variant="pane-open" onClick={openDisplaysForExpand} />
    </div>
  ) : null;

  const exitToList = useCallback(() => {
    if (onBackToBrowse) onBackToBrowse();
    else dispatchSelectLine(null);
  }, [onBackToBrowse]);

  const dock = (
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
          onActionFeedback={() => {}}
          onPrimaryAction={terminalVm ? () => void terminalVm.onClick() : undefined}
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
  );

  return (
    <>
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        hostDataAttrs={{ 'data-testing-pane-host': true }}
        centerTestId="testing-station-center"
        utilityRail={utilityRailBody}
        center={
          <StationPanelRoot className="isolate">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              <StationContextBar
                placement="flow"
                identity={
                  <TestingCartonHeader
                    c={c}
                    row={row}
                    staffId={staffId}
                    onEditPo={openPoPairing}
                    poEditOpen={resolvedSideTab === 'linkage'}
                    onToggleClaimView={openClaimView}
                    claimViewActive={resolvedSideTab === 'ticket' && claimTicketId == null}
                    onToggleTicketView={toggleTicketView}
                    ticketViewActive={resolvedSideTab === 'ticket'}
                    onExitToList={exitToList}
                  />
                }
              />
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance
                reserveIdentityClearance={false}
                bodyGap="none"
                entityContext={
                  scanSessionForThisLine ? (
                    <TestingScanSessionFeedback session={scanSession} />
                  ) : null
                }
                dock={dock}
              >
                <div className="space-y-0">
                  <TestingPoUnboxingSection
                    c={c}
                    row={row}
                    staffId={staffId}
                    suppressItemsHeader
                  />
                  <UnboxLabelPreview row={row} c={c} />
                </div>
              </StationWorkbench>
            </div>

            {c.activeSerial?.id != null && Number(c.activeSerial.id) > 0 ? (
              <UnitPackPhotoPeek
                serialUnitId={Number(c.activeSerial.id)}
                preferSource="all"
                showEmptyState={false}
              />
            ) : null}
          </StationPanelRoot>
        }
        displays={
          resolvedSideTab ? (
            <ReceivingDisplaysPushStack
              ariaLabel="Testing displays"
              storageKey="testing-displays-push-width"
              testId="testing-displays-push"
              resizeTestId="testing-displays-push-resize"
              tabs={displayTabs}
              activeTab={resolvedSideTab}
              onTabChange={(id) => setActiveSideTab(id as TestingDisplayTab)}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
      <TestingPanelModals c={c} row={row} />
    </>
  );
}
