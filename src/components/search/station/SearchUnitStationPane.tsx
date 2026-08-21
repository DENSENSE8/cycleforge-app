'use client';

/**
 * `/search?sel=unit:{id}` — a serial unit rendered in scan-station chrome, PREVIEW.
 *
 * The unit sibling of {@link SearchOrderStationPane}, landing the widening
 * `EntityStationPane`'s docblock was written for: the host was only order-typed
 * by accident, and unit previews need the identical tree.
 *
 * **It replaces `UnitDetailsPanel` on THIS surface only.** That panel is a desk
 * right-rail inspector and stays exactly where it is for
 * `InventoryDetailsOverlay` — two hosts, two region contracts, one shared read
 * model, which is the same split `SearchOrderStationPane` has with
 * `ShippedDetailsPanel`.
 *
 * **Preview drops the commit floor, deliberately.** `UnitDetailsPanel` carries
 * `GradeActionCard` (POST `/api/serial-units/{id}/grade`) and `HoldActionCard`
 * (hold / release). Neither comes here: `stance="preview"` forces
 * `resolvedDock = null`, and grading a unit from a find surface has no station
 * context behind it. Read-only-ness is the ABSENCE of the capability, never a
 * fork with the editors deleted — the inventory overlay still has both.
 *
 * **Identity is thin ON PURPOSE.** The bar carries the serial and its tracking;
 * SKU / grade / status / location go to the centre facts, because
 * `CartonContextCard` has no slot for them and its own 2026-08-21 ruling took
 * the lifecycle chip OFF that strip for width. See `UnitStationIdentity`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Barcode, Camera, Package, Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { buildSectionTabs } from '@/components/station/workbench';
import {
  EntityStationPane,
  type StationDisplayNav,
} from '@/components/station/entity';
import {
  UnitStationIdentity,
  buildUnitStationIdentityVM,
} from '@/components/station/unit';
import { useAutoCollapse } from '@/components/station/collapse';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchUnitCentre } from './SearchUnitCentre';
import { buildSearchUnitDisplayIndexRows } from './search-unit-display-index';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import type { SerialUnitDetailPayload } from '@/components/inventory/types';

/**
 * Deferred leaves — both pull a timeline engine and their own query spine, and
 * neither is on screen until the operator opens Displays. Same recipe as
 * `preloadUnboxDisplayLeafChunks`.
 */
const loadSerialUnitTimelineSection = () =>
  import('@/components/labels/unit-detail/SerialUnitTimelineSection').then(
    (m) => m.SerialUnitTimelineSection,
  );
const loadSerialJourneySection = () =>
  import('@/components/serial/SerialJourneySection').then((m) => m.SerialJourneySection);

function LeafBodyLoading() {
  return <UniversalLoader isLoading label="Loading display" />;
}

const SerialUnitTimelineSection = dynamic(loadSerialUnitTimelineSection, {
  loading: LeafBodyLoading,
});
const SerialJourneySection = dynamic(loadSerialJourneySection, { loading: LeafBodyLoading });

function preloadSearchUnitLeafChunks(): void {
  void loadSerialUnitTimelineSection();
  void loadSerialJourneySection();
}

export function SearchUnitStationPane({
  unitRef,
  onExit,
}: {
  /** Either a numeric `serial_units.id` or a serial number — the API takes both. */
  unitRef: string | number;
  /** Identity ◁ — clears `?sel=` back to the results the operator came from. */
  onExit: () => void;
}) {
  const [activeSideTab, setActiveSideTab] = useState<StationDisplayNav | null>(null);
  const collapse = useAutoCollapse();

  const token = String(unitRef ?? '').trim();
  const query = useQuery({
    // Shared with every other consumer of the unit detail route, so a hit that
    // was already resolved elsewhere paints from memory.
    queryKey: ['serial-unit-detail', token],
    queryFn: async (): Promise<SerialUnitDetailPayload> => {
      const res = await fetch(`/api/serial-units/${encodeURIComponent(token)}?include=full`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`unit ${res.status}`);
      return res.json();
    },
    enabled: token.length > 0,
    staleTime: 30_000,
  });

  const unit = query.data?.serial_unit ?? null;
  const settled = !query.isLoading;

  // Release the page-level cover once resolve settles, whatever it settled to:
  // a missing unit is a painted answer, not a reason to keep covering the plane.
  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (!settled) return;
    primaryPaint?.onPrimaryPainted();
  }, [settled, primaryPaint]);

  useEffect(() => {
    if (activeSideTab == null) return;
    preloadSearchUnitLeafChunks();
  }, [activeSideTab]);

  const vm = useMemo(() => (unit ? buildUnitStationIdentityVM(unit) : null), [unit]);

  const unitId = Number(unit?.id ?? 0);
  const hasUnitRow = Number.isFinite(unitId) && unitId > 0;
  const serial = vm?.leadIsMintedUid ? '' : (vm?.serialValue ?? '');
  const photoCount = query.data?.photos?.length ?? null;
  const allocations = useMemo(() => query.data?.allocations ?? [], [query.data]);

  const centre = useMemo(
    () =>
      vm ? <SearchUnitCentre unitId={unitId} vm={vm} collapse={collapse} /> : null,
    [vm, unitId, collapse],
  );

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'photos',
          label: 'Photos',
          icon: Camera,
          // `SerialUnitTimelineSection` is the pane that OWNS media for a unit
          // (its own docblock) — which is exactly why the journey leaf beside it
          // passes `withPhotos={false}`.
          content: hasUnitRow ? (
            <div className="pb-4">
              <SerialUnitTimelineSection serialUnitId={unitId} />
            </div>
          ) : null,
        },
        {
          id: 'journey',
          label: 'Journey',
          icon: Barcode,
          content: serial ? (
            <div className="pb-4">
              <SerialJourneySection
                serialNumber={serial}
                serialUnitId={hasUnitRow ? unitId : undefined}
                withPhotos={false}
                density="compact"
              />
            </div>
          ) : (
            <EmptyState
              icon={<Barcode className="h-6 w-6 text-text-faint" />}
              title="No serial to trace"
              description="This unit carries a minted uid rather than a scanned serial, so there is no journey spine to follow."
            />
          ),
        },
        {
          id: 'order',
          label: 'Order',
          icon: Package,
          content:
            allocations.length > 0 ? (
              <div className="space-y-3 pb-4">
                {allocations.map((a) => (
                  <OrderFactList key={a.id} cols={2}>
                    <OrderFactRow label="Order" value={`#${a.order_id}`} mono />
                    <OrderFactRow label="State" value={a.state} />
                    <OrderFactRow label="Allocated" value={a.allocated_at} />
                    <OrderFactRow label="By" value={a.allocated_by_name} omitWhenEmpty />
                    <OrderFactRow label="Released" value={a.released_at} omitWhenEmpty />
                    <OrderFactRow
                      label="Release reason"
                      value={a.released_reason}
                      span
                      omitWhenEmpty
                    />
                  </OrderFactList>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Package className="h-6 w-6 text-text-faint" />}
                title="Not allocated"
                description="This unit has never been allocated to an order."
              />
            ),
        },
      ]),
    [hasUnitRow, unitId, serial, allocations],
  );

  const displayIndexRows = useMemo(
    () =>
      buildSearchUnitDisplayIndexRows({
        hasSerial: Boolean(serial),
        photoCount: settled ? photoCount : null,
        photosSettled: settled,
        hasOrder: allocations.length > 0,
      }),
    [serial, photoCount, settled, allocations.length],
  );

  const handleSideTabChange = useCallback(
    (next: StationDisplayNav | null) => setActiveSideTab(next),
    [],
  );

  if (!settled) {
    // The page-level `SearchPrimaryPaintShell` field covers this plane — hold a
    // transparent box so it has geometry, never a second loading face under it.
    return <div className="min-h-0 flex-1" aria-busy />;
  }

  if (query.isError || !unit || !vm) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Unit not found"
          description="No serial unit matched this selection. Try another search hit."
        />
      </div>
    );
  }

  return (
    <EntityStationPane
      entityKey={unit.id}
      // Read surface: no dock, no grade / hold. Displays still write.
      stance="preview"
      identity={
        <UnitStationIdentity
          vm={vm}
          tracking={unit.shipping_tracking_number ?? null}
          onExitToList={onExit}
          exitLabel="Back to results"
        />
      }
      centre={centre}
      surface="card"
      onCentreScroll={collapse.onScroll}
      displayTabs={displayTabs}
      displayIndexRows={displayIndexRows}
      activeSideTab={activeSideTab}
      onSideTabChange={handleSideTabChange}
      storageKey="search-unit-displays-push-width"
      ariaLabel="Search unit displays"
      centerTestId="search-unit-station-center"
      displaysTestId="search-unit-displays-push"
      displaysResizeTestId="search-unit-displays-push-resize"
    />
  );
}
