'use client';

/** Inventory › Locations workspace — Receiving Sheets flush recipe: */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';

import { useBinsOverview, type BinsOverviewRow } from '@/hooks/useBinsOverview';
import { BinsTable } from './BinsTable';
import {
  useBinsFilterParams,
  filterRowsByStatus,
} from './BinsFilterBar';
import { BinsSelectionActions } from './BinsSelectionActions';
import { BinDetailFlyout } from './BinDetailFlyout';
import { RoomDetailForm } from './RoomDetailForm';
import { LocationLabelBuilder } from '@/features/location-labels/LocationLabelBuilder';
import { MobileFirstFrame } from '@/design-system/components/MobileFirstFrame';
import { RackDetailView } from './RackDetailView';
import { TotePlateWorkspace } from './TotePlateWorkspace';
import { RacksDesk } from './racks/RacksDesk';
import { WarehouseMap, type MapViewMode } from './WarehouseMap';
import { WarehouseFloorPlan } from './WarehouseFloorPlan';
import { parseLocationsTab } from '@/lib/inventory/locations-path';
import { LocationDeletionManager } from '@/features/locations/LocationDeletionManager';
import { Button } from '@/design-system/primitives';
import { Trash2 } from '@/components/Icons';

/** The tool (`?tab=`) is chosen in the sidebar — Inventory › Locations › Tool (2026-09-28). */
export function LocationsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseLocationsTab(searchParams.get('tab'));
  const rackCodeParam = searchParams.get('code');
  const locationSearch = searchParams.toString();

  // Bay labels used to be a sibling view. Keep old plain bookmarks useful,
  // but canonicalize them onto the one Labels workflow. A bay code still owns
  // its rack detail route below.
  useEffect(() => {
    if (tab !== 'bays' || rackCodeParam) return;
    const params = new URLSearchParams(locationSearch);
    params.set('tab', 'labels');
    router.replace(`/inventory/locations?${params.toString()}`, { scroll: false });
  }, [locationSearch, rackCodeParam, router, tab]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell className="h-full bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === 'rooms' ? <RoomDetailForm /> : null}
          {tab === 'labels' || (tab === 'bays' && !rackCodeParam) ? (
            <MobileFirstFrame testId="location-labels-frame" width="workspace">
              <LocationLabelBuilder initialKind="bin" dock="float" />
            </MobileFirstFrame>
          ) : null}
          {tab === 'totes' ? <TotePlateWorkspace /> : null}
          {tab === 'bays' && rackCodeParam ? <RackDetailView code={rackCodeParam} /> : null}
          {tab === 'map' ? <MapTabBody /> : null}
          {tab === 'movable' ? <RacksDesk /> : null}
          {tab === 'bins' ? (
            <BinsTabSheet />
          ) : null}
        </div>
      </DashboardScrollShell>
    </div>
  );
}


function BinsTabSheet() {
  const { status, room, q } = useBinsFilterParams();
  const { rows, loading, refetch } = useBinsOverview({ room, q });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [flyoutRow, setFlyoutRow] = useState<BinsOverviewRow | null>(null);
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false);
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<number>>(() => new Set());

  const visibleRows = useMemo(
    () => filterRowsByStatus(rows, status).filter((row) => !optimisticDeletedIds.has(row.id)),
    [optimisticDeletedIds, rows, status],
  );

  const reconciledSelected = useMemo(() => {
    if (selected.size === 0) return selected;
    const visibleIds = new Set(visibleRows.map((r) => r.id));
    let changed = false;
    const next = new Set<number>();
    for (const id of selected) {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    }
    return changed ? next : selected;
  }, [selected, visibleRows]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-end border-b border-border-soft px-3 py-2">
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 />}
          onClick={() => setDeleteScopeOpen(true)}
          data-testid="bins-delete-hierarchy"
        >
          Delete aisle, bay or position
        </Button>
      </div>
      <BinsTable
        rows={visibleRows}
        loading={loading}
        selected={reconciledSelected}
        onSelectChange={setSelected}
        onRowClick={(row) => setFlyoutRow(row)}
        bulkBar={(
          <BinsSelectionActions
            selected={reconciledSelected}
            rows={visibleRows}
            onDeleteSelected={(ids) => setDeleteIds(ids)}
          />
        )}
      />

      <LocationDeletionManager
        open={deleteScopeOpen || deleteIds != null}
        initialIds={deleteIds ?? []}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteScopeOpen(false);
            setDeleteIds(null);
          }
        }}
        onDeleteStart={(ids) => {
          setOptimisticDeletedIds((current) => new Set([...current, ...ids]));
          setSelected(new Set());
          setFlyoutRow(null);
        }}
        onDeleteRollback={(ids) => {
          setOptimisticDeletedIds((current) => {
            const next = new Set(current);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          setSelected(new Set(ids));
        }}
        onDeleted={async (ids) => {
          setSelected(new Set());
          await refetch();
          setOptimisticDeletedIds((current) => {
            const next = new Set(current);
            ids.forEach((id) => next.delete(id));
            return next;
          });
        }}
      />

      <BinDetailFlyout
        row={flyoutRow}
        onClose={() => setFlyoutRow(null)}
        onDeleted={refetch}
      />
    </>
  );
}

function MapTabBody() {
  const searchParams = useSearchParams();
  const view = parseMapView(searchParams.get('view'));
  const showEmpty = searchParams.get('showEmpty') === '1';
  const { rows, loading, error, refetch } = useBinsOverview({ pollMs: 60_000 });
  const [flyoutRow, setFlyoutRow] = useState<BinsOverviewRow | null>(null);

  return (
    <>
      {view === 'floorplan' ? (
        <WarehouseFloorPlan
          rows={rows}
          loading={loading}
          error={error}
          mode="fill"
          onCellClick={(row) => setFlyoutRow(row)}
          showEmpty={showEmpty}
        />
      ) : (
        <WarehouseMap
          rows={rows}
          loading={loading}
          mode={view}
          onCellClick={(row) => setFlyoutRow(row)}
          showEmpty={showEmpty}
        />
      )}

      <BinDetailFlyout
        row={flyoutRow}
        onClose={() => setFlyoutRow(null)}
        onDeleted={refetch}
      />
    </>
  );
}

type MapView = MapViewMode | 'floorplan';

function parseMapView(raw: string | null): MapView {
  if (raw === 'age' || raw === 'issues' || raw === 'floorplan') return raw;
  return 'fill';
}
