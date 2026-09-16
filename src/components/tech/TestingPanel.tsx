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
  StationDisplaysParkedRail,
  resolveDisplaysActiveTab,
  useYieldStationDisplaysOnAssistantOpen,
} from '@/components/station/displays';
import { StationDisplaysUtilityRail } from '@/components/station/displays';
import { UnboxLabelPreview } from '@/components/receiving/workspace/line-edit/UnboxLabelPreview';
import { WorkspaceNotesCard } from '@/components/receiving/workspace/line-edit/WorkspaceNotesCard';
import { StationContextBar } from '@/components/station/entity-context';
import { Boxes, Tag } from '@/components/Icons';
import {
  StationBandStack,
  useAutoCollapse,
  useBandCollapse,
  useLineCollapse,
} from '@/components/station/collapse';
import {
  StationTicketPane,
  useStationComposerMode,
} from '@/components/composer';
import {
  TESTING_OPEN_SKU_PAIRING_EVENT,
  useSkuTestingData,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';
import { stationComposerArrivalMode } from '@/lib/composer/station-composer-mode';
import { CLAIM_RENDERS_IN_BOTH } from '@/components/receiving/workspace/claim/claim-surfaces';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
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
import { TestingDisplaysActionFloor } from './testing-panel/TestingDisplaysActionFloor';
import { useSellerClaimedCondition } from './testing-panel/useSellerClaimedCondition';

/**
 * Right-pane TESTING display — Unbox SoT anatomy.
 *
 * Centre = ops-flow only: flush PO lines + {@link UnboxLabelPreview}. The dock
 * is the Unbox floor — one raised {@link WorkspaceNotesCard} with Pass · Print
 * on its trailing edge. Ticket mode mounts the thread / claim above the dock
 * (not a Displays-only editor).
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
  const [activeSideTab, setActiveSideTab] = useState<string | null>(null);
  const [claimMode, setClaimMode] = useState<ClaimModalMode>('create');
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);

  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  const bandCollapse = useAutoCollapse();
  // Which BAND is open — same layering as Unbox, so a fully collapsed centre
  // is a stack of closed accordion rows the operator expands in place.
  const bands = useBandCollapse(bandCollapse, { label: false });
  // Same controller family as Unbox, one altitude down — the line being tested
  // is open, its siblings are identity faces, and "Collapse all" reaches both.
  const lineCollapse = useLineCollapse(row?.id ?? null);
  const { mode: composerMode, setMode: setComposerMode } = useStationComposerMode();
  const ticketMode = composerMode === 'ticket';

  /*
   * The composer no longer collapses the context blocks — operator ruling,
   * 2026-08-30.
   *
   * Auto-collapse had three composer triggers: entering Ticket mode, the mode
   * change callback, and FOCUS. Focus is the one that made it unusable: a click
   * into the note field on Unbox — the station's whole job — folded Items and
   * Label away and left the centre empty above the dock. Ticket mode is no
   * better now that the dock holds the claim draft itself: the operator is
   * writing ABOUT the items, so hiding them is backwards.
   *
   * Collapse-all and the band toggles still drive it. Scroll does NOT — it
   * remounted the serial field and yanked the workbench back to the caret.
   */
  useEffect(() => {
    bands.close('label');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the line flips
  }, [row?.id]);
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);
  const openDisplays = useCallback((tab: TestingDisplayTab) => setActiveSideTab(tab), []);

  /**
   * The notes header's ⓘ → Displays → Timeline. Contextual detail opens on the
   * right edge, never as a dialog over the work (same contract as Unbox and
   * Arrival).
   */
  const openTimelineDisplay = useCallback(() => openDisplays('timeline'), [openDisplays]);

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
  /**
   * Filing a claim opens it in BOTH surfaces — Unbox grain, same switch
   * ({@link CLAIM_RENDERS_IN_BOTH}), so a tech who learned the claim on one
   * station finds it in the same two places on the other.
   *
   * `claimMode` is one piece of state feeding the centre pane AND the rail's
   * Ticket leaf, so the pair cannot open disagreeing about Create vs Link.
   * CLOSING stays centre-only (`openClaimView` / the pane's `onCloseClaim`) —
   * the rail is the surface the floor already trusts.
   *
   * The line-open effect below re-parks Displays on `listing`, but it is
   * `row.id`-gated, so it cannot yank a claim opened on the current line.
   */
  const onOpenClaim = useCallback((mode: ClaimModalMode = 'create') => {
    // Centre — where the claim is going.
    setClaimMode(mode);
    setComposerMode('ticket');
    // Right rail — where the floor still looks for it.
    if (CLAIM_RENDERS_IN_BOTH) setActiveSideTab('ticket');
  }, [setComposerMode]);

  const c = useTestingLineController(row, staffId, { onOpenClaim });
  const { primaryDisabled, primaryLabel, primaryTitle } = useTestingPrimaryAction(c, row);
  const claimTicketId = c.providerTicketId ?? null;
  const sellerClaimed = useSellerClaimedCondition(row, c.activeSerial);

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
    if (ticketMode) setComposerMode('unbox');
    else setComposerMode('ticket');
  }, [ticketMode, setComposerMode]);
  const openClaimView = useCallback(() => {
    if (ticketMode && claimTicketId == null) setComposerMode('unbox');
    else onOpenClaim('create');
  }, [ticketMode, claimTicketId, setComposerMode, onOpenClaim]);

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
      // Presence-only: linked ticket → centre Ticket composer.
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

  // Line open → Listing reference for works-as-listed, unless Ticket context
  // wins (linked ticket / already-failed unit — detail outranks). Ticket opens
  // in the centre composer; Listing still uses Displays.
  useEffect(() => {
    const hasTicket = c.providerTicketId != null;
    const ctx = resolveTestingTicketContextOpen(row, hasTicket);
    // Arrival lands on the station's own tab — Unbox grain. The claim MODE
    // seed still rides along for the rail's Ticket leaf; only the composer
    // flip is gone, because Ticket now opens a claim draft rather than a
    // passive thread.
    setClaimMode(ctx.claimMode);
    setComposerMode(stationComposerArrivalMode());
    setActiveSideTab('listing');
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

  const resolvedSideTab = useMemo(
    () =>
      resolveDisplaysActiveTab(
        activeSideTab,
        displayTabs.map((t) => t.id),
      ),
    [activeSideTab, displayTabs],
  );

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
    <StationDisplaysUtilityRail
      onOpenDisplays={openDisplaysIndex}
      indexRail={
        <StationDisplaysParkedRail
          rows={displayIndexRows}
          tabs={displayTabs}
          activeId={activeSideTab}
          onOpenLeaf={setActiveSideTab}
        />
      }
    />
  ) : null;

  const exitToList = useCallback(() => {
    if (onBackToBrowse) onBackToBrowse();
    else dispatchSelectLine(null);
  }, [onBackToBrowse]);

  // Pass · Print on the composer's trailing edge — the same embedded pill Unbox
  // and Arrival mount, never a separate CTA band above the notes.
  const bubbleTerminal = terminalVm ? (
    <div className="shrink-0" data-testing-dock-terminal>
      <StationTerminalDock
        embedded
        embeddedChrome="pill"
        vm={terminalVm}
        assignedTechId={row.assigned_tech_id}
      />
    </div>
  ) : null;

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
        <WorkspaceNotesCard
          onTicketCreated={onClaimTicketCreated}
          row={row}
          c={c}
          chrome="raised"
          trailingAction={bubbleTerminal}
          onPrimaryAction={terminalVm ? () => void terminalVm.onClick() : undefined}
          primaryActionDisabled={Boolean(terminalVm?.disabled)}
          onOpenStatusHistory={openTimelineDisplay}
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
                    claimViewActive={ticketMode && claimTicketId == null}
                    onToggleTicketView={toggleTicketView}
                    ticketViewActive={ticketMode && claimTicketId != null}
                    onExitToList={exitToList}
                  />
                }
              />
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance="pager"
                reserveIdentityClearance={false}
                bodyGap="none"
                bodyFill={ticketMode}
                entityContext={
                  scanSessionForThisLine ? (
                    <TestingScanSessionFeedback session={scanSession} />
                  ) : null
                }
                dock={dock}
              >
                <StationBandStack
                  collapse={bands}
                  bands={[
                    {
                      id: 'items',
                      label: 'Items',
                      icon: Boxes,
                      testId: 'testing-band-items',
                      body: (
                        <TestingPoUnboxingSection
                          c={c}
                          row={row}
                          staffId={staffId}
                          suppressItemsHeader
                          lineCollapse={lineCollapse}
                          onViewAllUnits={openUnits}
                        />
                      ),
                    },
                    {
                      id: 'label',
                      label: 'Label',
                      icon: Tag,
                      testId: 'testing-band-label',
                      body: (
                        <UnboxLabelPreview
                          row={row}
                          c={c}
                          onReveal={() => bands.open('label')}
                        />
                      ),
                    },
                  ]}
                  onCollapseAll={() => {
                    // Both altitudes, one press — same control as Unbox.
                    bandCollapse.collapseAll();
                    lineCollapse.collapseAll();
                  }}
                />
                {/* Linked thread only — the composer's Ticket tab is the claim. */}
                {ticketMode && claimTicketId != null ? (
                  <StationTicketPane
                    row={row}
                    ticketId={claimTicketId}
                    claimMode={claimMode}
                    onCloseClaim={() => setComposerMode('unbox')}
                    onClaimTicketCreated={onClaimTicketCreated}
                    onClaimTicketUnlinked={onClaimTicketUnlinked}
                    showReplyPresets
                  />
                ) : null}
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
                if (id === 'ticket') {
                  // TRANSITIONAL — same pairing as Unbox: the row opens the
                  // leaf as well as the centre instead of bouncing the rail
                  // back to the index, which read as a dead row.
                  if (claimTicketId == null) {
                    onOpenClaim(claimMode);
                    return;
                  }
                  setComposerMode('ticket');
                  setActiveSideTab(
                    CLAIM_RENDERS_IN_BOTH ? 'ticket' : STATION_DISPLAY_INDEX,
                  );
                  return;
                }
                setActiveSideTab(id as TestingDisplayTab);
              }}
              onClose={closeDisplays}
              headerActions={
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
