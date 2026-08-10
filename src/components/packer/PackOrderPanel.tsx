'use client';

/**
 * Live pack workspace overlay — Unbox-family Tier A:
 * StationScanPaneHost + StationPanelRoot; checklist (or UNIT peek) owns the
 * locked 720 centre; Photos · Timeline · Listings (scan/pack only — no Ticket ·
 * Support) live on StationDisplaysPushStack. Sibling to LineEditPanel /
 * TriagePanel; binds PackActiveOrderPane, not ReceivingLineRow. No sticky
 * terminal dock (Tier C).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, ExternalLink, History } from '@/components/Icons';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import {
  buildSectionTabs,
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
  WorkspaceTimelineTab,
} from '@/components/station/workbench';
import { OrderPackChecklist } from '@/components/packing/OrderPackChecklist';
import { ListingLinksTab } from '@/components/receiving/workspace/line-edit/ListingLinksTab';
import { useOrderPackChecklist } from '@/hooks/useOrderPackChecklist';
import { usePackingPolicy } from '@/hooks/usePackingPolicy';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';
import { PackOrderIdentity } from '@/components/packer/PackOrderIdentity';
import { PackPapersStatusCard } from '@/components/packer/PackPapersStatusCard';
import { UnitPackPhotoPeek } from '@/components/packer/UnitPackPhotoPeek';
import {
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import {
  StationDisplaysEdgeToggle,
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  useYieldStationDisplaysOnAssistantOpen,
} from '@/components/station/displays';
import { buildPackDisplayIndexRows } from '@/components/packer/pack-display-index';
import { packListingIdentity } from '@/components/packer/pack-listing-identity';
import { STATION_WORKBENCH_IDENTITY_COLUMN } from '@/components/station/workbench/workbench-layout';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Scan/pack Displays only — no Ticket · Support hubs. */
type PackDisplayTab = 'photos' | 'timeline' | 'listings';

/** Displays nav: closed is `null`; open is the Root Index or a content leaf. */
type PackDisplayNav = typeof STATION_DISPLAY_INDEX | PackDisplayTab;

interface PackOrderPanelProps {
  activeOrder: PackActiveOrderPane;
  onClose: () => void;
}

export function PackOrderPanel({ activeOrder, onClose }: PackOrderPanelProps) {
  const { data: packingPolicy } = usePackingPolicy();
  const { data: checklist, isLoading } = useOrderPackChecklist({
    orderRowId: activeOrder.orderRowId,
    sku: activeOrder.sku,
    condition: activeOrder.condition,
    productTitle: activeOrder.productTitle,
    enabled: activeOrder.scanType !== 'UNIT',
  });

  const isUnitScan = activeOrder.scanType === 'UNIT';
  const hasUnitPhotos = Number(activeOrder.serialUnitId) > 0;
  /** Photos own the centre on UNIT scans — only offer a Displays tab otherwise. */
  const photosInDisplays = hasUnitPhotos && !isUnitScan;

  const [activeSideTab, setActiveSideTab] = useState<PackDisplayNav | null>(null);

  const listingKey = String(activeOrder.sku || activeOrder.orderId || '').trim();
  const listingIdentity = useMemo(() => packListingIdentity(listingKey), [listingKey]);
  const [listingLink, setListingLink] = useState(listingIdentity.listingLink);
  useEffect(() => {
    setListingLink(listingIdentity.listingLink);
  }, [listingIdentity.listingLink, listingKey]);

  const resetKey = activeOrder.serialUnitId
    ? `unit-${activeOrder.serialUnitId}`
    : activeOrder.orderRowId
      ? `row-${activeOrder.orderRowId}`
      : `${activeOrder.sku || activeOrder.tracking}`;

  const hasRollup =
    Boolean(checklist) &&
    (checklist?.orderRowIds.length ?? 0) > 0 &&
    (checklist?.progress.total ?? 0) > 1;

  const timelineSerials = useMemo(() => {
    const fromLines = (checklist?.lines ?? []).flatMap((l) => l.serials ?? []);
    const unitKey = activeOrder.unitKey?.trim();
    const base = [...new Set(fromLines.map((s) => s.trim()).filter(Boolean))];
    if (unitKey && !base.includes(unitKey)) base.push(unitKey);
    return base;
  }, [checklist?.lines, activeOrder.unitKey]);

  const tracking = String(activeOrder.tracking ?? '').trim();
  const orderId = String(activeOrder.orderId ?? '').trim();
  const hasTimelineTab =
    tracking.length > 0 || orderId.length > 0 || timelineSerials.length > 0;

  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);

  /**
   * `←|` Open displays → the Root Index, never a guessed leaf.
   *
   * This used to open `photos` or `ticket` and, with no switcher in the column,
   * that guess WAS the whole surface — the index makes every leaf reachable.
   */
  const openDisplaysIndex = useCallback(() => setActiveSideTab(STATION_DISPLAY_INDEX), []);

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'photos',
          label: 'Photos',
          icon: Camera,
          visible: photosInDisplays,
          content: (
            <div className="space-y-3">
              <p className="text-role-caption font-semibold text-text-muted">
                Packing photos for this prepacked unit — linked to the unit label and
                visible on the timeline.
              </p>
              <UnitPackPhotoPeek
                serialUnitId={Number(activeOrder.serialUnitId)}
                preferSource="packing"
              />
            </div>
          ),
        },
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          visible: hasTimelineTab,
          content: (
            <WorkspaceTimelineTab
              orderId={orderId || null}
              tracking={tracking || null}
              serials={timelineSerials}
            />
          ),
        },
        {
          id: 'listings',
          label: 'Listings',
          icon: ExternalLink,
          // Trailing upgrade slot — always on the index for storefront peek.
          content: (
            <ListingLinksTab
              listingLinks={listingIdentity.listingLinks}
              listingLink={listingLink}
              setListingLink={setListingLink}
            />
          ),
        },
      ]),
    [
      activeOrder.serialUnitId,
      hasTimelineTab,
      orderId,
      photosInDisplays,
      timelineSerials,
      tracking,
      listingIdentity.listingLinks,
      listingLink,
    ],
  );

  const resolvedSideTab: PackDisplayNav | null = useMemo(() => {
    if (!activeSideTab) return null;
    if (activeSideTab === STATION_DISPLAY_INDEX) return STATION_DISPLAY_INDEX;
    if (displayTabs.some((t) => t.id === activeSideTab)) return activeSideTab;
    // A requested leaf that gated away falls back to the INDEX, never to
    // `displayTabs[0]` — silently swapping in an unrelated display is the
    // failure the index exists to make impossible.
    return STATION_DISPLAY_INDEX;
  }, [activeSideTab, displayTabs]);

  const packedCount = checklist?.progress.packedLines ?? 0;
  const totalCount = checklist?.progress.total ?? 0;
  const rollupComplete = packedCount >= totalCount && totalCount > 0;

  const displayIndexRows = useMemo(
    () =>
      buildPackDisplayIndexRows({
        photosVisible: photosInDisplays,
        hasTimeline: hasTimelineTab,
        packedCount,
        totalCount,
        hasListing: Boolean(listingIdentity.listingOpenHref),
      }),
    [
      photosInDisplays,
      hasTimelineTab,
      packedCount,
      totalCount,
      listingIdentity.listingOpenHref,
    ],
  );

  const paneUtilityRow = (
    <div className="flex flex-col items-center gap-0 pt-0">
      {!activeSideTab ? (
        <StationDisplaysEdgeToggle variant="pane-open" onClick={openDisplaysIndex} />
      ) : null}
    </div>
  );

  // Host (`PackOrderWorkspace`) owns scan-cadence swap; paint content immediately.
  return (
    <div className="relative flex h-full w-full min-h-0 flex-col">
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        hostDataAttrs={{ 'data-pack-pane-host': true }}
        centerTestId="pack-station-center"
        utilityRail={!activeSideTab ? paneUtilityRow : null}
        center={
          <StationPanelRoot>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              <StationContextBar
                placement="flow"
                identity={
                  <div className="w-full min-w-0">
                    <PackOrderIdentity activeOrder={activeOrder} />
                  </div>
                }
                moreDetails={
                  <StationMoreDetails>
                    <PaneHeaderCloseButton
                      onClick={onClose}
                      ariaLabel="Return to pack queue"
                      title="Return to pack queue"
                    />
                  </StationMoreDetails>
                }
              />

              {/* Pack papers / manuals status + Reprint — middle only. */}
              <PackPapersStatusCard orderRowId={activeOrder.orderRowId} />

              {hasRollup ? (
                <div
                  className={cn(
                    'shrink-0 border-b border-border-hairline bg-surface-card',
                    STATION_WORKBENCH_IDENTITY_COLUMN,
                  )}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
                        Order rollup
                      </p>
                      <p className="text-role-caption font-semibold text-text-muted">
                        Multi-line order — verify each line is packed before sealing.
                      </p>
                    </div>
                    <span
                      className={cn(
                        cornerClass('flush'),
                        'shrink-0 px-2 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset tabular-nums',
                        rollupComplete
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-amber-50 text-amber-700 ring-amber-200',
                      )}
                    >
                      {packedCount}/{totalCount} packed
                    </span>
                  </div>
                </div>
              ) : null}

              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance={false}
                reserveIdentityClearance={false}
                bodyGap="none"
              >
                {isUnitScan ? (
                  <div className="space-y-3">
                    <p className="text-role-caption font-semibold text-text-muted">
                      Packing photos for this prepacked unit — linked to the unit
                      label and visible on the timeline.
                    </p>
                    {hasUnitPhotos ? (
                      <UnitPackPhotoPeek
                        serialUnitId={Number(activeOrder.serialUnitId)}
                        preferSource="packing"
                      />
                    ) : null}
                  </div>
                ) : (
                  <OrderPackChecklist
                    lines={checklist?.lines ?? []}
                    enforcement={
                      packingPolicy?.enforcement ?? checklist?.enforcement ?? 'advisory'
                    }
                    resetKey={resetKey}
                    isLoading={isLoading}
                    variant="panel"
                    isUnknownOrder={Boolean(activeOrder.isUnknownOrder)}
                    unknownCondition={activeOrder.condition}
                  />
                )}
              </StationWorkbench>
            </div>
          </StationPanelRoot>
        }
        displays={
          resolvedSideTab ? (
            <StationDisplaysPushStack
              ariaLabel="Pack displays"
              storageKey="pack-displays-push-width"
              testId="pack-displays-push"
              resizeTestId="pack-displays-push-resize"
              tabs={displayTabs}
              indexRows={displayIndexRows}
              activeTab={resolvedSideTab}
              onTabChange={(id) => setActiveSideTab(id as PackDisplayNav)}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
    </div>
  );
}
