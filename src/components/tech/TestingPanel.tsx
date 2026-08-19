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
import {
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  useYieldStationDisplaysOnAssistantOpen,
} from '@/components/station/displays';
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
import { buildTestingDisplayIndexRows } from './testing-panel/testing-display-index';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { TestingDockHost } from './testing-panel/TestingDockHost';
import { TestingDisplaysActionFloor } from './testing-panel/TestingDisplaysActionFloor';
import { WorksAsListedDockControl } from './testing-panel/WorksAsListedDockControl';
import { buildNotAsListedIssue } from '@/lib/receiving/seller-claimed-condition';
import { TESTING_QC_STEP_LABEL } from '@/lib/stations/testing-procedure';
import { useSellerClaimedCondition } from './testing-panel/useSellerClaimedCondition';
import { postTicketInternalNote } from '@/lib/support/post-ticket-comment';
import { ticketReplyPresetById } from '@/lib/support/ticket-reply-presets';

/**
 * Right-pane TESTING display — Unbox SoT anatomy.
 *
 * Centre = ops-flow only: flush PO lines + {@link UnboxLabelPreview} + dock
 * ({@link TestingDockHost}: works-as-listed · notes · Pass · Print). Never
 * centre advisory banners — ticket history / claim / listing verify open as
 * Displays beside the middle. Operator copy: Open displays / Hide right panel.
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
  const [claimPrefill, setClaimPrefill] = useState<string | null>(null);
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);

  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);
  const openDisplays = useCallback((tab: TestingDisplayTab) => setActiveSideTab(tab), []);

  /**
   * PO line serials-cell / edit click → open the right-edge Units Display
   * (per-unit verdict — the Action plane), selecting the line first so the
   * display drills by `receiving_line_id`. Unbox parity (`LineEditPanel`
   * `onViewAllUnits`). A contextual leaf open — skips the Root Index.
   */
  const openUnits = useCallback(
    (line: ReceivingLineRow) => {
      if (line.id !== row.id) dispatchSelectLine(line);
      // Contextual Units leaf (Testing has no nested unitsAction URL).
      openDisplays('units');
    },
    [row.id, openDisplays],
  );
  const onOpenClaim = useCallback((mode: ClaimModalMode = 'create') => {
    setClaimMode(mode);
    setActiveSideTab('ticket');
  }, []);

  const c = useTestingLineController(row, staffId, { onOpenClaim });
  const { primaryDisabled, primaryLabel, primaryTitle } = useTestingPrimaryAction(c, row);
  const claimTicketId = c.providerTicketId ?? null;
  const sellerClaimed = useSellerClaimedCondition(row, c.activeSerial);

  useEffect(() => {
    setClaimPrefill(null);
  }, [row.id]);

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

  // Line open → Listing reference for works-as-listed, unless Ticket context
  // wins (linked ticket / already-failed unit — detail outranks). Never a
  // centre "needs attention" strip — SoT: centre = ops-flow only.
  useEffect(() => {
    const hasTicket = c.providerTicketId != null;
    const ctx = resolveTestingTicketContextOpen(row, hasTicket);
    setClaimMode(ctx.claimMode);
    setActiveSideTab(ctx.open ? 'ticket' : 'listing');
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
        sellerClaimed,
        claimPrefill,
        onCloseClaim: openDisplaysIndex,
        onCloseTicket: openDisplaysIndex,
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
      sellerClaimed,
      claimPrefill,
      openDisplaysIndex,
      onClaimTicketCreated,
      onClaimTicketUnlinked,
      openFindTicketDisplay,
    ],
  );

  const displayIndexRows = useMemo(
    () =>
      buildTestingDisplayIndexRows(
        displayTabs.map((t) => t.id as TestingDisplayTab),
        {
          hasTicketId: claimTicketId != null,
          hasSkuPairing: row.sku_catalog_id != null,
          hasSkuTabs,
          hasTimeline: hasTimelineTab,
          linkagePaired: Boolean(String(row.zoho_purchaseorder_id ?? '').trim()),
          isUnfound: shouldUseUnmatchedItemsSurface(row),
          listingLabel: sellerClaimed.label || null,
        },
      ),
    [
      displayTabs,
      claimTicketId,
      row,
      hasSkuTabs,
      hasTimelineTab,
      sellerClaimed.label,
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

  const onAsListed = useCallback(() => {
    openDisplays('listing');
    toast.success('Marked as listed — Pass · Print when ready');
    // REST internal note when a ticket is already linked — never DOM macros.
    if (claimTicketId != null) {
      const preset = ticketReplyPresetById('qc-pass-internal');
      if (preset) {
        void postTicketInternalNote(claimTicketId, preset.body).then((res) => {
          if (!res.ok) toast.error(res.error || 'Could not add QC note to ticket');
        });
      }
    }
  }, [openDisplays, claimTicketId]);

  const onNotAsListed = useCallback(() => {
    const issue = buildNotAsListedIssue({
      claimed: sellerClaimed,
      issueDetail: c.itemNote || c.notes || null,
    });
    setClaimPrefill(issue);
    // Ticket owns claim + seller-message — Listing is reference only.
    const serial = c.activeSerial;
    if (serial && row.id > 0) {
      void c.handleSlotVerdict(row.id, serial, 'TESTING_FAILED');
    } else {
      onOpenClaim('create');
    }
  }, [sellerClaimed, c, row.id, onOpenClaim]);

  const dock = (
    <div
      className={slicedActionDockWrapperClass({ docked: false })}
      data-testing-dock-float
    >
      <div className={`pointer-events-auto ${STATION_WORKBENCH_COLUMN}`}>
        {terminalVm?.disabled && terminalVm.disabledReason ? (
          <p
            role="status"
            className="mb-1.5 text-right text-role-caption font-semibold text-amber-700"
          >
            {terminalVm.disabledReason}
          </p>
        ) : null}
        <TestingDockHost
          leading={
            <WorksAsListedDockControl
              onAsListed={onAsListed}
              onNotAsListed={onNotAsListed}
              busy={c.isMutating}
            />
          }
          trailing={
            <StationTerminalDock
              embedded
              vm={terminalVm}
              assignedTechId={row.assigned_tech_id}
            />
          }
          stepContext={
            <span
              className="inline-flex min-w-0 max-w-[14rem] items-center text-role-micro uppercase leading-none tracking-widest text-text-soft"
              data-testing-dock-step
            >
              {TESTING_QC_STEP_LABEL.works_as_listed}
              {sellerClaimed.label ? (
                <span className="ml-1 normal-case tracking-normal text-text-faint">
                  · sold as {sellerClaimed.label}
                </span>
              ) : null}
            </span>
          }
          notes={
            <WorkspaceNotesCard
              row={row}
              c={c}
              chrome="bare"
              onPrimaryAction={terminalVm ? () => void terminalVm.onClick() : undefined}
              primaryActionDisabled={Boolean(terminalVm?.disabled)}
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
                    onViewAllUnits={openUnits}
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
              indexRows={displayIndexRows}
              activeTab={resolvedSideTab}
              onTabChange={(id) => {
                if (id === STATION_DISPLAY_INDEX) {
                  setActiveSideTab(STATION_DISPLAY_INDEX);
                  return;
                }
                setActiveSideTab(id as TestingDisplayTab);
              }}
              onClose={closeDisplays}
              actionFloor={
                <TestingDisplaysActionFloor
                  receivingId={row.receiving_id}
                  isUnfound={shouldUseUnmatchedItemsSurface(row)}
                  openDisplays={openDisplays}
                  onDeleted={closeDisplays}
                  editSelected={activeSideTab === 'linkage'}
                  deleteIdentity={{
                    tracking: row.tracking_number,
                    poNumber: row.zoho_purchaseorder_number,
                  }}
                />
              }
            />
          ) : null
        }
      />
      <TestingPanelModals c={c} row={row} />
    </>
  );
}
