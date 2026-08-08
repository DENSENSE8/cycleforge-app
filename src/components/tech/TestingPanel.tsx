'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveTestingLineTitle } from '@/lib/print/printProductLabel';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  StationPanelRoot,
  StationScanPaneHost,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { StationDisplaysPushStack, STATION_DISPLAY_INDEX } from '@/components/station/displays';
import { UnboxDisplaysUtilityRailBody } from '@/components/receiving/workspace/UnboxDisplaysUtilityRailBody';
import { UnboxLabelPreview } from '@/components/receiving/workspace/line-edit/UnboxLabelPreview';
import { WorkspaceNotesCard } from '@/components/receiving/workspace/line-edit/WorkspaceNotesCard';
import { StationContextBar } from '@/components/station/entity-context';
import {
  TESTING_OPEN_SKU_PAIRING_EVENT,
  useSkuTestingData,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchSelectLine, dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { useTestingLineController } from '@/components/tech/hooks/useTestingLineController';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
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
import { resolveTestingTicketContextOpen } from './testing-panel/testing-ticket-context';
import { UnitPackPhotoPeek } from '@/components/packer/UnitPackPhotoPeek';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import {
  buildTestingDisplayTabs,
  type TestingDisplayTab,
} from './testing-panel/build-testing-displays';

/**
 * Right-pane TESTING display — Unbox SoT anatomy.
 *
 * Centre = ops-flow only: flush PO lines + {@link UnboxLabelPreview} + dock
 * (notes + Pass · Print). Never centre advisory banners — ticket history /
 * claim / exact contextual detail open as Ticket Displays beside the middle
 * ({@link TicketDisplayHost}). Reference tools (Ticket · Pairing · Checklist ·
 * Manuals · Timeline · Linkage) live on Displays push. Operator copy: Open
 * displays / Hide right panel.
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
  const qc = useQueryClient();
  const productTitle = resolveTestingLineTitle(row);

  // Displays push — `null` IS closed; `index` is Root Index; leaf id is the body.
  const [activeSideTab, setActiveSideTab] = useState<
    TestingDisplayTab | typeof STATION_DISPLAY_INDEX | null
  >(null);
  const [claimMode, setClaimMode] = useState<ClaimModalMode>('create');
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);

  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  const openDisplays = useCallback((tab: TestingDisplayTab) => setActiveSideTab(tab), []);
  const onOpenClaim = useCallback((mode: ClaimModalMode = 'create') => {
    setClaimMode(mode);
    setActiveSideTab('ticket');
  }, []);

  const c = useTestingLineController(row, staffId, { onOpenClaim });
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

  /**
   * `←|` Open displays → the Root Index, not `ticket`.
   *
   * Testing declares six displays; landing one of them from the edge toggle
   * made the other five a Back-press away from an operator who had no reason to
   * think there was anything behind Ticket. Contextual `openDisplays(<leaf>)`
   * (claim · reply · SKU pairing) still skips the index — that IS the ask.
   */
  const openDisplaysIndex = useCallback(() => setActiveSideTab(STATION_DISPLAY_INDEX), []);
  const openPoPairing = useCallback(() => {
    setActiveSideTab('linkage');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, []);
  const toggleTicketView = useCallback(() => {
    if (activeSideTab === 'ticket') closeDisplays();
    else openDisplays('ticket');
  }, [activeSideTab, closeDisplays, openDisplays]);
  const openClaimView = useCallback(() => {
    if (activeSideTab === 'ticket' && claimTicketId == null) closeDisplays();
    else onOpenClaim('create');
  }, [activeSideTab, claimTicketId, closeDisplays, onOpenClaim]);

  /** Auto-match Find ticket → Ticket display (link existing). */
  const openFindTicketDisplay = useCallback(() => {
    onOpenClaim('link');
  }, [onOpenClaim]);

  const onClaimTicketCreated = useCallback(
    (ticketNumber: string) => {
      toast.success(`Claim filed — ${ticketNumber}`);
      void c.invalidateSupportTicket();
      invalidateSupportContextCaches(qc);
      if (row.receiving_id != null) {
        patchReceivingRailTicketByCarton(qc, row.receiving_id, ticketNumber);
      }
      dispatchLineUpdated({ id: row.id, zendesk_ticket: ticketNumber, notes: row.notes });
      invalidateReceivingFeeds(qc);
      // Presence-only: linked ticket → Chat in TicketDisplayHost.
      openDisplays('ticket');
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

  // Contextual ticket detail → Displays on line open (history when linked;
  // claim when already failed). Fail-while-testing uses onOpenClaim. Never a
  // centre "needs attention" strip — SoT: centre = ops-flow only.
  useEffect(() => {
    const hasTicket = c.providerTicketId != null;
    const ctx = resolveTestingTicketContextOpen(row, hasTicket);
    setClaimMode(ctx.claimMode);
    setActiveSideTab(ctx.open ? 'ticket' : null);
    // Only on carton/line open — do not fight a manual Displays close.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- row.id gate
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
        claimMode,
        onCloseClaim: closeDisplays,
        onCloseTicket: closeDisplays,
        onClaimTicketCreated,
        onClaimTicketUnlinked,
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
      claimMode,
      closeDisplays,
      onClaimTicketCreated,
      onClaimTicketUnlinked,
      openFindTicketDisplay,
    ],
  );

  const resolvedSideTab: TestingDisplayTab | typeof STATION_DISPLAY_INDEX | null = useMemo(() => {
    if (!activeSideTab) return null;
    if (activeSideTab === STATION_DISPLAY_INDEX) return STATION_DISPLAY_INDEX;
    if (displayTabs.some((t) => t.id === activeSideTab)) return activeSideTab;
    // Gated-away leaf → the index, never a silent swap to an unrelated display.
    return STATION_DISPLAY_INDEX;
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
    <UnboxDisplaysUtilityRailBody onOpenDisplays={openDisplaysIndex} />
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
            <StationDisplaysPushStack
              ariaLabel="Testing displays"
              storageKey="testing-displays-push-width"
              testId="testing-displays-push"
              resizeTestId="testing-displays-push-resize"
              tabs={displayTabs}
              activeTab={resolvedSideTab}
              onTabChange={(id) => {
                if (id === STATION_DISPLAY_INDEX) {
                  setActiveSideTab(STATION_DISPLAY_INDEX);
                  return;
                }
                setActiveSideTab(id as TestingDisplayTab);
              }}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
      <TestingPanelModals c={c} row={row} />
    </>
  );
}
