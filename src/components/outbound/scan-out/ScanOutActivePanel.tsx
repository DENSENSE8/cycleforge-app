'use client';

/**
 * Scan-out carton workbench — Pack-family Tier A:
 * StationScanPaneHost + CartonContextCard + Displays (timeline · listings).
 * No Ticket · Claim · pack checklist — dock confirm is scan-driven.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, History } from '@/components/Icons';
import {
  buildSectionTabs,
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
  WorkspaceTimelineTab,
} from '@/components/station/workbench';
import { StationContextBar } from '@/components/station/entity-context';
import {
  StationDisplaysParkedRail,
  StationDisplaysUtilityRail,
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  useYieldStationDisplaysOnAssistantOpen,
  type DisplayIndexRow,
} from '@/components/station/displays';
import { ListingLinksTab } from '@/components/receiving/workspace/line-edit/ListingLinksTab';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import { resolveShippingListingLinks } from '@/components/tech/shipping/shipping-listing-links';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { ScanOutActivePane } from '@/components/outbound/scan-out/scan-out-active';
import { dispatchScanOutActive } from '@/components/outbound/scan-out/scan-out-active';

type ScanOutDisplayTab = 'timeline' | 'listings';
type ScanOutDisplayNav = typeof STATION_DISPLAY_INDEX | ScanOutDisplayTab;

const STATUS_TONE: Record<ScanOutActivePane['status'], string> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  dup: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  exc: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  pending: 'bg-surface-canvas text-text-muted ring-1 ring-inset ring-border-soft',
  miss: 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200',
  err: 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200',
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

function buildScanOutDisplayIndexRows(signals: {
  hasTimeline: boolean;
  hasListing: boolean;
  status: ScanOutActivePane['status'];
}): DisplayIndexRow[] {
  const rows: DisplayIndexRow[] = [];
  if (signals.hasTimeline) {
    rows.push({
      id: 'timeline',
      label: 'Timeline',
      subtitle: signals.status === 'ok' ? 'Left the dock' : 'Order history',
      tone: signals.status === 'ok' ? 'ok' : 'neutral',
      group: 'context',
    });
  }
  rows.push({
    id: 'listings',
    label: 'Listings',
    subtitle: signals.hasListing ? 'Listing links' : 'No listing',
    tone: signals.hasListing ? 'ok' : 'neutral',
    group: 'context',
  });
  return rows;
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
  const [activeSideTab, setActiveSideTab] = useState<ScanOutDisplayNav | null>(null);
  const activeOrder = useMemo(() => paneToStationOrder(pane), [pane]);
  const listing = useMemo(
    () => resolveShippingListingLinks(activeOrder),
    [activeOrder.itemNumber, activeOrder.sku],
  );
  const [listingLink, setListingLink] = useState(listing.listingUrl ?? '');
  useEffect(() => {
    setListingLink(listing.listingUrl ?? '');
  }, [listing.listingUrl, pane.tracking, pane.orderId]);

  const tracking = pane.tracking.trim();
  const orderId = pane.orderId.trim();
  const hasTimelineTab = tracking.length > 0 || orderId.length > 0;

  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);
  const openDisplaysIndex = useCallback(() => setActiveSideTab(STATION_DISPLAY_INDEX), []);

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          visible: hasTimelineTab,
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
              listingLinks={listing.listingLinks}
              listingLink={listingLink}
              setListingLink={setListingLink}
            />
          ),
        },
      ]),
    [hasTimelineTab, orderId, tracking, listing.listingLinks, listingLink],
  );

  const resolvedSideTab: ScanOutDisplayNav | null = useMemo(() => {
    if (!activeSideTab) return null;
    if (activeSideTab === STATION_DISPLAY_INDEX) return STATION_DISPLAY_INDEX;
    if (displayTabs.some((t) => t.id === activeSideTab)) return activeSideTab;
    return STATION_DISPLAY_INDEX;
  }, [activeSideTab, displayTabs]);

  const displayIndexRows = useMemo(
    () =>
      buildScanOutDisplayIndexRows({
        hasTimeline: hasTimelineTab,
        hasListing: Boolean(listing.listingUrl),
        status: pane.status,
      }),
    [hasTimelineTab, listing.listingUrl, pane.status],
  );

  const paneUtilityRow = !activeSideTab ? (
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

  const onExit = useCallback(() => dispatchScanOutActive(null), []);

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col">
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        hostDataAttrs={{ 'data-scan-out-pane-host': true }}
        centerTestId="scan-out-station-center"
        utilityRail={!activeSideTab ? paneUtilityRow : null}
        center={
          <StationPanelRoot>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              <StationContextBar
                placement="flow"
                identity={
                  <ShippingEntityContextHeader
                    activeOrder={activeOrder}
                    onExitToList={onExit}
                  />
                }
              />
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance={false}
                reserveIdentityClearance={false}
                bodyGap="none"
                feedback={
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-role-caption font-semibold',
                      STATUS_TONE[pane.status],
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{statusLabel(pane)}</span>
                    {canUndo && pane.status === 'ok' && onUndo ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onUndo}
                        disabled={isUndoing}
                        className="h-auto shrink-0 px-0 text-role-caption text-emerald-800 underline-offset-2 hover:underline"
                      >
                        {isUndoing ? 'Undoing…' : 'Undo'}
                      </Button>
                    ) : null}
                  </div>
                }
              >
                <div className="stack-section inset-card">
                  <p className="text-role-body font-semibold text-text-primary">
                    {pane.productTitle}
                  </p>
                  <p className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">
                    {pane.qty}
                    {pane.condition ? ` · ${pane.condition}` : ''}
                    {tracking ? ` · ${tracking}` : ''}
                  </p>
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
