'use client';

/**
 * Scan-out focused carton — Pack / Ready-to-Pack station anatomy (no desk fork):
 *
 *   StationScanPaneHost
 *     └ StationPanelRoot
 *         ├ StationContextBar → ShippingEntityContextHeader → CartonContextCard
 *         └ StationWorkbench (ops centre only — no second identity dump)
 *     └ StationDisplaysPushStack (Timeline · Listings)
 *
 * Gun + notes stay in the page-bottom OmnichannelComposerDock.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, History, Check, AlertTriangle } from '@/components/Icons';
import {
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
  WorkspaceTimelineTab,
  buildSectionTabs,
} from '@/components/station/workbench';
import {
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import {
  StationDisplaysParkedRail,
  StationDisplaysPushStack,
  StationDisplaysUtilityRail,
  STATION_DISPLAY_INDEX,
  resolveDisplaysActiveTab,
  useYieldStationDisplaysOnAssistantOpen,
  type DisplayIndexRow,
} from '@/components/station/displays';
import { ListingLinksTab } from '@/components/receiving/workspace/line-edit/ListingLinksTab';
import { PoItemsSection } from '@/components/receiving/workspace/PoItemsSection';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import { resolveShippingListingLinks } from '@/components/tech/shipping/shipping-listing-links';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { ScanOutActivePane } from '@/components/outbound/scan-out/scan-out-active';
import {
  SCAN_OUT_CLOSE_DISPLAYS_EVENT,
  SCAN_OUT_OPEN_DISPLAYS_EVENT,
  dispatchScanOutActive,
  dispatchScanOutDisplaysChanged,
} from '@/components/outbound/scan-out/scan-out-active';

type ScanOutDisplayTab = 'timeline' | 'listings';
type ScanOutDisplayNav = typeof STATION_DISPLAY_INDEX | ScanOutDisplayTab;

const STATUS_TONE: Record<ScanOutActivePane['status'], string> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  dup: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  exc: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  pending: 'bg-surface-canvas text-text-muted ring-1 ring-inset ring-border-soft',
  miss: 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200',
  err: 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200',
  // Cancelled order: the box is in the operator's hands and must not leave.
  blk: 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200',
};

function statusLabel(pane: ScanOutActivePane): string {
  switch (pane.status) {
    case 'ok':
      return 'Shipped out';
    case 'dup':
      return 'Already scanned out';
    case 'exc':
      return pane.message || 'Delivered already';
    case 'pending':
      return 'Scanning…';
    case 'blk':
      return pane.message || 'Do not ship — order cancelled';
    case 'miss':
      return pane.message || 'No shipment found';
    case 'err':
      return pane.message || 'Scan-out failed';
    default:
      return '';
  }
}

function paneToStationOrder(pane: ScanOutActivePane): ActiveStationOrder {
  return {
    id: pane.orderRowId,
    orderId: pane.orderId,
    productTitle: pane.productTitle,
    itemNumber: pane.itemNumber,
    sku: pane.sku,
    condition: pane.condition,
    notes: '',
    tracking: pane.tracking,
    serialNumbers: [],
    testDateTime: null,
    testedBy: null,
    quantity: pane.qty,
  };
}

export function ScanOutActivePanel({
  pane,
  onUndo,
  canUndo,
  isUndoing,
}: {
  pane: ScanOutActivePane;
  onUndo?: () => void;
  canUndo?: boolean;
  isUndoing?: boolean;
}) {
  const activeOrder = useMemo(() => paneToStationOrder(pane), [pane]);
  const onExit = useCallback(() => dispatchScanOutActive(null), []);
  const [activeSideTab, setActiveSideTab] = useState<ScanOutDisplayNav | null>(null);
  const receivingId = pane.receivingId;
  const poLinesQuery = useQuery<{
    success: boolean;
    receiving_lines: ReceivingLineRow[];
  }>({
    queryKey: receivingId != null ? receivingSiblingsQueryKey(receivingId) : ['receiving-siblings', 'none'],
    queryFn: async () => {
      const response = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Failed to load purchase-order lines');
      return response.json();
    },
    enabled: receivingId != null && receivingId > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const activePoLine =
    poLinesQuery.data?.receiving_lines?.find((line) => line.sku === pane.sku) ??
    poLinesQuery.data?.receiving_lines?.[0] ??
    null;

  const listingResolution = useMemo(
    () => resolveShippingListingLinks(activeOrder),
    [activeOrder.itemNumber, activeOrder.sku],
  );
  const [listingLink, setListingLink] = useState(listingResolution.listingUrl ?? '');
  useEffect(() => {
    setListingLink(listingResolution.listingUrl ?? '');
  }, [pane.orderRowId, pane.tracking, listingResolution.listingUrl]);

  const tracking = pane.tracking.trim();
  const orderId = pane.orderId.trim();
  const hasTimeline = tracking.length > 0 || orderId.length > 0;

  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  const openDisplaysIndex = useCallback(
    () => setActiveSideTab(STATION_DISPLAY_INDEX),
    [],
  );
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);

  useEffect(() => {
    const onOpen = () => openDisplaysIndex();
    const onClose = () => closeDisplays();
    window.addEventListener(SCAN_OUT_OPEN_DISPLAYS_EVENT, onOpen);
    window.addEventListener(SCAN_OUT_CLOSE_DISPLAYS_EVENT, onClose);
    return () => {
      window.removeEventListener(SCAN_OUT_OPEN_DISPLAYS_EVENT, onOpen);
      window.removeEventListener(SCAN_OUT_CLOSE_DISPLAYS_EVENT, onClose);
    };
  }, [openDisplaysIndex, closeDisplays]);

  useEffect(() => {
    dispatchScanOutDisplaysChanged(activeSideTab != null);
  }, [activeSideTab]);

  useEffect(() => {
    return () => dispatchScanOutDisplaysChanged(false);
  }, []);

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          visible: hasTimeline,
          content: (
            <WorkspaceTimelineTab
              orderId={orderId || null}
              tracking={tracking || null}
              serials={[]}
            />
          ),
        },
        {
          id: 'listings',
          label: 'Listings',
          icon: ExternalLink,
          content: (
            <ListingLinksTab
              listingLinks={listingResolution.listingLinks}
              listingLink={listingLink}
              setListingLink={setListingLink}
            />
          ),
        },
      ]),
    [hasTimeline, orderId, tracking, listingResolution.listingLinks, listingLink],
  );

  const displayIndexRows = useMemo((): DisplayIndexRow[] => {
    const rows: DisplayIndexRow[] = [];
    if (hasTimeline) {
      rows.push({
        id: 'timeline',
        label: 'Timeline',
        subtitle: 'Shipment history',
        tone: pane.status === 'ok' ? 'ok' : 'neutral',
        group: 'context',
      });
    }
    rows.push({
      id: 'listings',
      label: 'Listings',
      subtitle: listingResolution.listingUrl ? 'Listing links' : 'No listing',
      tone: listingResolution.listingUrl ? 'ok' : 'neutral',
      group: 'context',
    });
    return rows;
  }, [hasTimeline, pane.status, listingResolution.listingUrl]);

  const resolvedSideTab = useMemo(
    () =>
      resolveDisplaysActiveTab(
        activeSideTab,
        displayTabs.map((t) => t.id),
      ),
    [activeSideTab, displayTabs],
  );

  const utilityRailBody = !resolvedSideTab ? (
    <StationDisplaysUtilityRail
      onOpenDisplays={openDisplaysIndex}
      indexRail={
        <StationDisplaysParkedRail
          rows={displayIndexRows}
          tabs={displayTabs}
          activeId={activeSideTab ?? null}
          onOpenLeaf={(id) => setActiveSideTab(id as ScanOutDisplayNav)}
        />
      }
    />
  ) : null;

  const statusChip = (
    <span
      className={cn(
        'inline-flex max-w-[14rem] items-center gap-1 truncate px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-widest',
        cornerClass('flush'),
        STATUS_TONE[pane.status],
      )}
      data-testid="scan-out-status-chip"
    >
      {pane.status === 'ok' ? (
        <Check className="h-3 w-3 shrink-0" aria-hidden />
      ) : pane.status === 'pending' ? null : (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{statusLabel(pane)}</span>
    </span>
  );

  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col bg-surface-card"
      data-testid="scan-out-station-center"
    >
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        hostDataAttrs={{ 'data-scan-out-pane-host': true }}
        centerTestId="scan-out-entity-center"
        utilityRail={utilityRailBody}
        center={
          <StationPanelRoot surface="card">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible bg-surface-card">
              <StationContextBar
                placement="flow"
                identity={
                  <ShippingEntityContextHeader
                    activeOrder={activeOrder}
                    onExitToList={onExit}
                  />
                }
                moreDetails={
                  <StationMoreDetails>
                    {statusChip}
                    {canUndo && pane.status === 'ok' && onUndo ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onUndo}
                        disabled={isUndoing}
                        className="h-auto shrink-0 px-1 text-role-micro text-emerald-800 underline-offset-2 hover:underline"
                      >
                        {isUndoing ? 'Undoing…' : 'Undo'}
                      </Button>
                    ) : null}
                  </StationMoreDetails>
                }
              />

              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance={false}
                reserveIdentityClearance={false}
                bodyGap="none"
              >
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center bg-surface-card inset-empty text-center"
                  data-testid="scan-out-ops-centre"
                >
                  {activePoLine && receivingId != null ? (
                    <div className="w-full max-w-4xl text-left" data-testid="scan-out-po-items">
                      <PoItemsSection
                        row={activePoLine}
                        receivingId={receivingId}
                        activeLineId={activePoLine.id}
                        placeholderActiveRow={activePoLine}
                        readOnly
                        unitsChrome
                      />
                    </div>
                  ) : poLinesQuery.isPending ? (
                    <p className="text-role-caption text-text-muted">Loading purchase-order lines…</p>
                  ) : (
                    <p className="text-role-caption text-text-muted">
                      No purchase-order lines are linked to this shipment.
                    </p>
                  )}
                </div>
              </StationWorkbench>
            </div>
          </StationPanelRoot>
        }
        displays={
          resolvedSideTab ? (
            <StationDisplaysPushStack
              ariaLabel="Scan-out displays"
              storageKey="scan-out-displays-push-width"
              testId="scan-out-displays-push"
              resizeTestId="scan-out-displays-push-resize"
              tabs={displayTabs}
              indexRows={displayIndexRows}
              activeTab={resolvedSideTab}
              onTabChange={(id) => setActiveSideTab(id as ScanOutDisplayNav)}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
    </div>
  );
}
