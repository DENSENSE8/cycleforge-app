'use client';

/** Inventory › Locations workspace — Receiving Sheets flush recipe: */

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';

import { useBinsOverview, type BinsOverviewRow } from '@/hooks/useBinsOverview';
import { BinsTable } from './BinsTable';
import {
  useBinsFilterParams,
  filterRowsByStatus,
} from './BinsFilterBar';
import { BinsBulkActionBar } from './BinsBulkActionBar';
import { BinDetailFlyout } from './BinDetailFlyout';
import { RoomDetailForm } from './RoomDetailForm';
import { LabelPrintWorkspace } from './LabelPrintWorkspace';
import { RackLabelWorkspace } from './RackLabelWorkspace';
import { RackDetailView } from './RackDetailView';
import { TotePlateWorkspace } from './TotePlateWorkspace';
import { WarehouseMap, type MapViewMode } from './WarehouseMap';
import { WarehouseFloorPlan } from './WarehouseFloorPlan';
import { parseLocationsTab } from '@/lib/inventory/locations-path';
import { LocationsManagementTab } from '@/components/admin/LocationsManagementTab';

/** The tool (`?tab=`) is chosen in the sidebar — Inventory › Locations › Tool (2026-09-28). */
export function LocationsWorkspace() {
  const searchParams = useSearchParams();
  const tab = parseLocationsTab(searchParams.get('tab'));
  const rackCodeParam = searchParams.get('code');

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell className="h-full bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === 'rooms' ? <RoomDetailForm /> : null}
          {tab === 'labels' ? <LabelPrintWorkspace /> : null}
          {tab === 'totes' ? <TotePlateWorkspace /> : null}
          {tab === 'bays' ? (
            rackCodeParam ? <RackDetailView code={rackCodeParam} /> : <RackLabelWorkspace />
          ) : null}
          {tab === 'map' ? <MapTabBody /> : null}
          {tab === 'manage' ? <LocationsManagementTab /> : null}
          {tab === 'bins' ? (
            <BinsTabSheet />
          ) : null}
        </div>
      </DashboardScrollShell>
    </div>
  );
}


function BinsTabSheet() {
  const { status, room, q, onParamChange } = useBinsFilterParams();
  const { rows, loading, refetch } = useBinsOverview({ room, q });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [flyoutRow, setFlyoutRow] = useState<BinsOverviewRow | null>(null);

  const visibleRows = useMemo(
    () => filterRowsByStatus(rows, status),
    [rows, status],
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
      <BinsTable
        rows={visibleRows}
        loading={loading}
        selected={reconciledSelected}
        onSelectChange={setSelected}
        onRowClick={(row) => setFlyoutRow(row)}
      />

      <BinsBulkActionBar
        selected={reconciledSelected}
        rows={visibleRows}
        onClearSelection={() => setSelected(new Set())}
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = parseMapView(searchParams.get('view'));
  const showEmpty = searchParams.get('showEmpty') === '1';
  const { rows, loading, error, refetch } = useBinsOverview({ pollMs: 60_000 });
  const [flyoutRow, setFlyoutRow] = useState<BinsOverviewRow | null>(null);

  const toggleEmpty = () => {
    const sp = new URLSearchParams(searchParams.toString());
    if (showEmpty) sp.delete('showEmpty');
    else sp.set('showEmpty', '1');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <>
      <div className="flex justify-end border-b border-border-soft px-3 py-2">
        <button
          type="button"
          onClick={toggleEmpty}
          className={`ds-raw-button rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            showEmpty
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-border-soft bg-surface-card text-text-muted hover:bg-surface-hover'
          }`}
          aria-pressed={showEmpty}
        >
          {showEmpty ? 'Hide' : 'Show'} empty bins
        </button>
      </div>
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
