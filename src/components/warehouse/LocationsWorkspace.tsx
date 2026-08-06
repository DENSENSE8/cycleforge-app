'use client';

/**
 * Inventory › Locations workspace — Receiving Sheets flush recipe:
 * Band 1 tabs · Band 2 KPI (Bins) · Band 3 triage · sheet grid.
 *
 * Replaces the framed `/warehouse` desk. Nested tool tabs (Bin Tags / Racks /
 * Rooms / Map) keep their bodies; any data table mounts flush.
 */

import { useCallback, useMemo, useState, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useLocations } from '@/hooks/useLocations';
import { useBinsOverview, type BinsOverviewRow } from '@/hooks/useBinsOverview';
import { BinsTable } from './BinsTable';
import {
  useBinsFilterParams,
  filterRowsByStatus,
  type BinFilterStatus,
} from './BinsFilterBar';
import { BinsBulkActionBar } from './BinsBulkActionBar';
import { BinDetailFlyout } from './BinDetailFlyout';
import { RoomDetailForm } from './RoomDetailForm';
import { LabelPrintWorkspace } from './LabelPrintWorkspace';
import { RackLabelWorkspace } from './RackLabelWorkspace';
import { RackDetailView } from './RackDetailView';
import { WarehouseMap, type MapViewMode } from './WarehouseMap';
import { WarehouseFloorPlan } from './WarehouseFloorPlan';
import { LocationsWorkspaceHeader } from './LocationsWorkspaceHeader';
import { LocationsBinsKpiBand } from './LocationsBinsKpiBand';
import { parseLocationsTab } from '@/lib/inventory/locations-path';
import { cn } from '@/utils/_cn';

export function LocationsWorkspace() {
  const searchParams = useSearchParams();
  const tab = parseLocationsTab(searchParams.get('tab'));
  const rackCodeParam = searchParams.get('code');
  // Band-3 ▦ host — lifted so chrome (pinned) and BinsTabSheet (body) share it.
  const [binsControlsEl, setBinsControlsEl] = useState<HTMLDivElement | null>(null);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell
        className="h-full bg-transparent"
        chrome={
          <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
            <LocationsWorkspaceHeader />
            {tab === 'bins' ? (
              <LocationsBinsChrome controlsSlotRef={setBinsControlsEl} />
            ) : null}
          </div>
        }
      >
        <div className={WORKBENCH_SHEET_HOST}>
          {tab === 'rooms' ? <RoomDetailForm /> : null}
          {tab === 'labels' ? <LabelPrintWorkspace /> : null}
          {tab === 'racks' ? (
            rackCodeParam ? <RackDetailView code={rackCodeParam} /> : <RackLabelWorkspace />
          ) : null}
          {tab === 'map' ? <MapTabBody /> : null}
          {tab === 'bins' ? (
            <BinsTabSheet columnTriggerPortalTarget={binsControlsEl} />
          ) : null}
        </div>
      </DashboardScrollShell>
    </div>
  );
}

/** Band 2 KPI + Band 3 triage for the Bins spreadsheet. */
function LocationsBinsChrome({
  controlsSlotRef,
}: {
  controlsSlotRef: Ref<HTMLDivElement>;
}) {
  const { status, room, q, onParamChange } = useBinsFilterParams();
  const { rooms } = useLocations();
  const { counts } = useBinsOverview({ room, q });

  const onSelectStatus = useCallback(
    (next: BinFilterStatus) => {
      onParamChange('status', next === 'all' ? '' : next);
    },
    [onParamChange],
  );

  return (
    <>
      <LocationsBinsKpiBand
        counts={counts}
        status={status}
        onSelectStatus={onSelectStatus}
      />
      <WorkbenchTriageBand
        controlsSlotRef={controlsSlotRef}
        search={
          <TechRailSearchBar
            value={q}
            onChange={(v) => onParamChange('q', v)}
            onClear={() => onParamChange('q', '')}
            placeholder="Search bins…"
            variant="chrome"
          />
        }
        right={
          <select
            value={room}
            onChange={(e) => onParamChange('room', e.target.value)}
            aria-label="Filter by room"
            className="h-8 max-w-[12rem] rounded-md border border-border-soft bg-surface-card px-2 text-role-caption outline-none focus:border-blue-500"
          >
            <option value="">All rooms</option>
            {rooms.map((r) => {
              const name = r.room || r.name;
              return (
                <option key={r.id} value={name}>
                  {name} {r.zone_letter ? `(${r.zone_letter})` : ''}
                </option>
              );
            })}
          </select>
        }
      />
    </>
  );
}

function BinsTabSheet({
  columnTriggerPortalTarget = null,
}: {
  columnTriggerPortalTarget?: HTMLElement | null;
}) {
  const { status, room, q } = useBinsFilterParams();
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
        surface="sheet"
        columnTriggerPortalTarget={columnTriggerPortalTarget}
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
