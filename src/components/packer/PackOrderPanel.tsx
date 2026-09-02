'use client';

/**
 * Live pack workspace overlay — Unbox-family Tier A:
 * StationScanPaneHost + StationPanelRoot; checklist (or UNIT peek) owns the
 * locked 720 centre; Photos · Timeline · Listings (scan/pack only — no Ticket ·
 * Support) live on StationDisplaysPushStack. Sibling to LineEditPanel /
 * TriagePanel; binds PackActiveOrderPane, not ReceivingLineRow. Its order-note
 * mouth is the shared StationComposerHost, with the context ring opening
 * Displays.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, ExternalLink, History, Warehouse } from '@/components/Icons';
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
import { EbayPackLabelCard } from '@/components/packer/EbayPackLabelCard';
import { UnitPackPhotoPeek } from '@/components/packer/UnitPackPhotoPeek';
import { StationContextBar } from '@/components/station/entity-context';
import {
  StationDisplaysParkedRail,
  StationDisplaysUtilityRail,
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  resolveDisplaysActiveTab,
  useYieldStationDisplaysOnAssistantOpen,
} from '@/components/station/displays';
import { PackLocationsLeaf } from '@/components/tech/shipping/PackLocationsLeaf';
import { usePackOrderPlacement } from '@/components/tech/shipping/usePackOrderPlacement';
import { buildPackDisplayIndexRows } from '@/components/packer/pack-display-index';
import { packListingIdentity } from '@/components/packer/pack-listing-identity';
import { StationBandStack, useAutoCollapse, useBandCollapse } from '@/components/station/collapse';
import { StationComposerHost } from '@/components/composer';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import { STATION_WORKBENCH_COLUMN } from '@/components/station/workbench';
import { useAppendOrderNote } from '@/hooks/useOrderNotes';

/** Scan/pack Displays only — no Ticket · Support hubs. */
type PackDisplayTab = 'photos' | 'timeline' | 'listings';

/** Displays nav: closed is `null`; open is the Root Index or a content leaf. */
type PackDisplayNav = typeof STATION_DISPLAY_INDEX | PackDisplayTab;

interface PackOrderPanelProps {
  packerId: number;
  activeOrder: PackActiveOrderPane;
  onClose: () => void;
}

export function PackOrderPanel({ packerId, activeOrder, onClose }: PackOrderPanelProps) {
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

  /**
   * The order's packing desk. Same writer as Ready-to-Pack
   * (`order_pack_placements` via {@link usePackOrderPlacement}) and the same
   * leaf — this station simply had no route to it, so a packer who needed to
   * move an order to another bench had to leave the pack surface entirely.
   * Displays-only by contract: a destination never sits in the work.
   */
  const packOrderId =
    activeOrder.orderRowId != null && activeOrder.orderRowId > 0
      ? activeOrder.orderRowId
      : null;
  const placement = usePackOrderPlacement({ orderId: packOrderId });

  // Declared above `displayTabs`: the Locations leaf inside that memo calls it,
  // and the memo factory runs at ITS line during render.
  const closePackDisplays = useCallback(() => setActiveSideTab(null), []);

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
          id: 'locations',
          label: 'Locations',
          icon: Warehouse,
          visible: packOrderId != null,
          content: (
            <PackLocationsLeaf placement={placement} onPlaced={closePackDisplays} />
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

  const resolvedSideTab = useMemo(
    () =>
      resolveDisplaysActiveTab(
        activeSideTab,
        displayTabs.map((t) => t.id),
      ),
    [activeSideTab, displayTabs],
  );

  const packedCount = checklist?.progress.packedLines ?? 0;
  const totalCount = checklist?.progress.total ?? 0;
  const bandCollapse = useAutoCollapse();
  const bands = useBandCollapse(bandCollapse);

  const [note, setNote] = useState('');
  const packNoteOrderId = activeOrder.orderRowId ?? 0;
  const appendNote = useAppendOrderNote(packNoteOrderId);
  const commitNote = useCallback(() => {
    const text = note.trim();
    if (!text || appendNote.isPending) return;
    appendNote.mutate(text, { onSuccess: () => setNote('') });
  }, [note, appendNote]);

  const dock = (
    <div
      className={slicedActionDockWrapperClass({ docked: false })}
      data-pack-composer-dock
    >
      <div className={`pointer-events-auto w-full min-w-0 ${STATION_WORKBENCH_COLUMN}`}>
        <StationComposerHost
          showModeRow
          showModeFaces={false}
          labelValue={note}
          onLabelChange={setNote}
          onLabelCommit={commitNote}
          labelCommitDisabled={appendNote.isPending || note.trim().length === 0}
          labelPlaceholder="Add a note for this order…"
          labelCommitAriaLabel="Save order note"
          labelCommitTooltip="Save order note (Enter)"
          chrome="raised"
          animateMount={false}
          progressTone={resolvedSideTab ? 'selected' : 'idle'}
          onProgressClick={openDisplaysIndex}
        />
      </div>
    </div>
  );

  const displayIndexRows = useMemo(
    () =>
      buildPackDisplayIndexRows({
        photosVisible: photosInDisplays,
        hasTimeline: hasTimelineTab,
        packedCount,
        totalCount,
        hasListing: Boolean(listingIdentity.listingOpenHref),
        hasPlaceableOrder: packOrderId != null,
      }),
    [
      photosInDisplays,
      hasTimelineTab,
      packedCount,
      totalCount,
      listingIdentity.listingOpenHref,
      packOrderId,
    ],
  );

  const paneUtilityRow = !activeSideTab ? (
    <StationDisplaysUtilityRail
      onOpenDisplays={openDisplaysIndex}
      indexRail={
        <StationDisplaysParkedRail
          rows={displayIndexRows}
          tabs={displayTabs}
          activeId={activeSideTab ?? null}
          onOpenLeaf={(id) =>
            setActiveSideTab(id as Parameters<typeof setActiveSideTab>[0])
          }
        />
      }
    />
  ) : null;

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
                  <PackOrderIdentity activeOrder={activeOrder} onExitToList={onClose} />
                }
              />

              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance={false}
                reserveIdentityClearance={false}
                bodyGap="none"
                // Print-bundle status is action feedback (Unbox feedback slot),
                // never an advisory strip between identity and the checklist.
                // Rollup lives on Displays → Timeline subtitle — not a centre band.
                feedback={
                  <PackPapersStatusCard orderRowId={activeOrder.orderRowId} />
                }
                dock={dock}
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
                  <StationBandStack
                    collapse={bands}
                    bands={[
                      {
                        id: 'items',
                        label: 'Items',
                        body: (
                          <div className="space-y-3">
                            {packOrderId != null ? (
                              <EbayPackLabelCard
                                orderId={packOrderId}
                                orderRef={activeOrder.orderId}
                                packerId={packerId}
                              />
                            ) : null}
                            <OrderPackChecklist
                              lines={checklist?.lines ?? []}
                              enforcement={
                                packingPolicy?.enforcement ?? checklist?.enforcement ?? 'advisory'
                              }
                              resetKey={resetKey}
                              isLoading={isLoading}
                              variant="panel"
                              embedded
                              isUnknownOrder={Boolean(activeOrder.isUnknownOrder)}
                              unknownCondition={activeOrder.condition}
                            />
                          </div>
                        ),
                        testId: 'pack-items-band',
                      },
                    ]}
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
