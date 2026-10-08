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
  CartonDisplaysActionFloor,
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
} from '@/components/station/displays';
import { UnboxLabelPreview } from '@/components/receiving/workspace/line-edit/UnboxLabelPreview';
import { WorkspaceNotesCard } from '@/components/receiving/workspace/line-edit/WorkspaceNotesCard';
import { useWorkspaceTicketDraft } from '@/components/receiving/workspace/line-edit/hooks/useWorkspaceTicketDraft';
import { StationContextBar } from '@/components/station/entity-context';
import { StationPhotosTask } from '@/components/station/StationPhotosTask';
import { useStationTaskController } from '@/components/station/useStationTaskController';
import { useStationHasPhotos } from '@/components/station/useStationHasPhotos';
import { SCAN_STATION_TONES } from '@/lib/sidebar-navigation';
import { Boxes, ShieldCheck } from '@/components/Icons';
import {
  StationBandStack,
  useAutoCollapse,
  useBandCollapse,
  useLineCollapse,
} from '@/components/station/collapse';
import { StationTicketPane } from '@/components/composer';
import {
  TESTING_OPEN_SKU_PAIRING_EVENT,
  useSkuTestingData,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
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
import { TestingVerdictBar } from './testing-panel/TestingVerdictBar';
import { QcFnskuPairButton } from './testing-panel/QcFnskuPairBar';
import { TestingConditionBar } from './testing-panel/TestingConditionBar';
import { StationLabelPeek } from '@/components/station/label-peek/StationLabelPeek';
import { TestingPoUnboxingSection } from './testing-panel/TestingPoUnboxingSection';
import { TestingPanelModals } from './testing-panel/TestingPanelModals';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import {
  buildTestingDisplayTabs,
  type TestingDisplayTab,
} from './testing-panel/build-testing-displays';
import { buildTestingDisplayIndexRows } from './testing-panel/testing-display-index';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { useSellerClaimedCondition } from './testing-panel/useSellerClaimedCondition';

/** Right-pane TESTING display — Unbox SoT anatomy. */

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

  const hasPhotos = useStationHasPhotos(row.receiving_id, row.photo_count);
  const {
    activeDisplay: activeSideTab,
    ticketActive: ticketMode,
    photosActive,
    displaysActive,
    selectTask,
    revealTask,
    openDisplay,
    closeDisplays,
  } = useStationTaskController({
    owner: 'quality-control',
    workLabel: 'Quality Control',
    workIcon: ShieldCheck,
    workTone: SCAN_STATION_TONES.testing,
    scopeKey: row.id,
    context: {
      hasPhotos,
      hasTicket: Boolean(String(row.zendesk_ticket ?? '').trim()),
    },
  });
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);
  const bandCollapse = useAutoCollapse();
  const bands = useBandCollapse(bandCollapse);
  const lineCollapse = useLineCollapse(row?.id ?? null);

  useEffect(() => {
    setFnskuPairOpen(false);
  }, [row?.id]);

  const openDisplays = useCallback(
    (tab: TestingDisplayTab) => {
      openDisplay(tab);
    },
    [openDisplay],
  );
  const openTimelineDisplay = useCallback(() => openDisplays('timeline'), [openDisplays]);
  const openUnits = useCallback(
    (line: ReceivingLineRow) => {
      if (line.id !== row.id) dispatchSelectLine(line);
      openDisplays('units');
    },
    [row.id, openDisplays],
  );
  const onOpenClaim = useCallback((_mode: 'create' | 'link' = 'create') => {
    selectTask('ticket');
  }, [selectTask]);

  const c = useTestingLineController(row, staffId, { onOpenClaim });
  const [fnskuPairOpen, setFnskuPairOpen] = useState(false);
  // `K` while the Pair FNSKU dropdown is open pairs its highlighted row.
  const [fnskuPairNonce, setFnskuPairNonce] = useState(0);
  const { primaryTitle } = useTestingPrimaryAction(c, row, {
    onFnskuKey: () => {
      if (fnskuPairOpen) setFnskuPairNonce((n) => n + 1);
      else setFnskuPairOpen(true);
    },
    onGradeKey: (grade) => c.regradeActive(grade),
  });
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

  const openPoPairing = useCallback(() => {
    openDisplay('linkage');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, [openDisplay]);
  const toggleTicketView = useCallback(() => {
    selectTask(ticketMode ? 'work' : 'ticket');
  }, [selectTask, ticketMode]);
  const openClaimView = useCallback(() => {
    selectTask(ticketMode && claimTicketId == null ? 'work' : 'ticket');
  }, [claimTicketId, selectTask, ticketMode]);
  const openFindTicketDisplay = useCallback(() => {
    selectTask('ticket');
  }, [selectTask]);

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
      selectTask('ticket');
    },
    [c, qc, row.id, row.notes, row.receiving_id, selectTask],
  );
  const ticketDraftModel = useWorkspaceTicketDraft({
    row,
    ticketId: claimTicketId,
    onTicketCreated: onClaimTicketCreated,
  });

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
        sellerClaimed,
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
      sellerClaimed,
      openFindTicketDisplay,
    ],
  );

  const displayIndexRows = useMemo(
    () =>
      buildTestingDisplayIndexRows(
        displayTabs.map((t) => t.id as TestingDisplayTab),
        {
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
      row,
      hasSkuTabs,
      hasTimelineTab,
      sellerClaimed.label,
    ],
  );


  // Carton-terminal always — Ticket display keeps Reply local (inline). A
  // Displays click must not re-label the dock (Unbox grammar).
  const buildTerminal = useCallback(
    (kind: string) =>
      resolveTestingTerminal(kind, {
        primaryTitle,
        onPrimary: () => void c.handlePrimary(),
      }),
    [primaryTitle, c],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'test',
    mode: 'testing',
    tabId: null,
    build: buildTerminal,
  });

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
          ticketDraftModel={ticketDraftModel}
          row={row}
          c={c}
          chrome="raised"
          locationLeading={
            <QcFnskuPairButton
              row={row}
              grade={c.activeGrade}
              open={fnskuPairOpen}
              onOpenChange={setFnskuPairOpen}
              pairNonce={fnskuPairNonce}
            />
          }
          labelPeek={
            <StationLabelPeek
              key={row.id}
              signal={`${c.itemNote ?? ''}|${c.activeGrade}|${c.activeLabelKind ?? ''}|${c.activeSlot}|${c.labelEditorRequestId ?? 0}`}
              testId="testing-label-peek"
            >
              {({ reveal }) => <UnboxLabelPreview row={row} c={c} onReveal={reveal} />}
            </StationLabelPeek>
          }
          trailingAction={bubbleTerminal}
          onPrimaryAction={terminalVm ? () => void terminalVm.onClick() : undefined}
          primaryActionDisabled={Boolean(terminalVm?.disabled)}
          onOpenStatusHistory={openTimelineDisplay}
          onLinkTicketOpen={() => revealTask('ticket')}
        />
      </div>
    </div>
  );

  return (
    <>
      <StationScanPaneHost
        displaysOpen={displaysActive}
        hostDataAttrs={{ 'data-testing-pane-host': true }}
        centerTestId="testing-station-center"
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
                    poEditOpen={activeSideTab === 'linkage'}
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
                bodyFill={ticketMode || photosActive}
                dock={dock}
              >
                {ticketMode ? (
                  <StationTicketPane
                    row={row}
                    ticketId={claimTicketId}
                    draft={ticketDraftModel}
                  />
                ) : photosActive ? (
                  <StationPhotosTask
                    receivingId={row.receiving_id ?? null}
                    receivingLineId={row.id}
                    staffId={staffId}
                    poRef={String(row.zoho_purchaseorder_number ?? row.zoho_purchaseorder_id ?? '') || null}
                    photoStage="unbox_item"
                    onSendToTicket={() => c.setPhotoNoteOpen(true)}
                  />
                ) : (
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
                      // Cartoned lines judge here (condition 1–7 above Fail · Test again · Pass);
                      // an uncartoned line's inline slot carries its own verdict.
                      after:
                        row.receiving_id != null ? (
                          <div className="flex w-full min-w-0 flex-col">
                            <TestingConditionBar c={c} />
                            <TestingVerdictBar c={c} row={row} />
                          </div>
                        ) : null,
                    },
                  ]}
                  onCollapseAll={() => {
                    bandCollapse.collapseAll();
                    lineCollapse.collapseAll();
                  }}
                />
                )}
              </StationWorkbench>
            </div>

          </StationPanelRoot>
        }
        displays={
          displaysActive ? (
            <StationDisplaysPushStack
              ariaLabel="Testing displays"
              storageKey="testing-displays-push-width"
              testId="testing-displays-push"
              resizeTestId="testing-displays-push-resize"
              tabs={displayTabs}
              indexRows={displayIndexRows}
              activeTab={activeSideTab ?? STATION_DISPLAY_INDEX}
              onTabChange={openDisplay}
              onClose={closeDisplays}
              headerActions={
                <CartonDisplaysActionFloor
                  testIdPrefix="testing"
                  receivingId={row.receiving_id}
                  isUnfound={shouldUseUnmatchedItemsSurface(row)}
                  onDeleted={closeDisplays}
                  editSelected={activeSideTab === 'linkage'}
                  deleteIdentity={{
                    tracking: row.tracking_number,
                    poNumber: row.zoho_purchaseorder_number,
                  }}
                  onEdit={() => openDisplay('linkage')}
                  onLink={() => openDisplay('linkage')}
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
