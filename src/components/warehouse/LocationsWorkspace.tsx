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
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { WorkbenchTriageBand } from '@/components/dashboard/workbench-shell';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import {
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { useRightRailTopId } from '@/components/right-rail/useRightRailOccupant';
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

export function LocationsWorkspace() {
  const searchParams = useSearchParams();
  const tab = parseLocationsTab(searchParams.get('tab'));
  const rackCodeParam = searchParams.get('code');
  // Band-3 ▦ host — the shell lifts it so chrome (pinned) and BinsTabSheet
  // (body) share one element by construction.
  //
  // No `surface` id: Bins DOES have a Band 2, but it is `LocationsBinsKpiBand`
  // bundled inside `LocationsBinsChrome` — a tab-scoped strip, not the per-staff
  // snap-collapsible `WorkbenchKpiBand`. There is no collapse control here, so
  // there is no preference to read.
  const chrome = useWorkbenchSheetChrome();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <WorkbenchSheetView
        chrome={chrome}
        className="h-full bg-transparent"
        // LocationsWorkspaceHeader takes no className — it is flush at source.
        tabs={() => <LocationsWorkspaceHeader />}
        triage={({ controlsSlotRef }) =>
          tab === 'bins' && controlsSlotRef ? (
            <LocationsBinsChrome controlsSlotRef={controlsSlotRef} />
          ) : null
        }
      >
        {({ controlsEl }) => (
          <>
            {tab === 'rooms' ? <RoomDetailForm /> : null}
            {tab === 'labels' ? <LabelPrintWorkspace /> : null}
            {tab === 'racks' ? (
              rackCodeParam ? <RackDetailView code={rackCodeParam} /> : <RackLabelWorkspace />
            ) : null}
            {tab === 'map' ? <MapTabBody /> : null}
            {tab === 'bins' ? <BinsTabSheet columnTriggerPortalTarget={controlsEl} /> : null}
          </>
        )}
      </WorkbenchSheetView>
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
  const [roomFilterOpen, setRoomFilterOpen] = useState(false);
  // `BinDetailFlyout` registers `detail:bin:<identity>` — a per-entity id, so
  // match on the prefix rather than a fixed string.
  const railTopId = useRightRailTopId();
  const binInspectorOpen = (railTopId ?? '').startsWith('detail:bin:');

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
        trailing={
          <WorkbenchInspectorToggle open={binInspectorOpen} testId="bins-inspector-toggle" />
        }
        search={
          <TechRailSearchBar
            value={q}
            onChange={(v) => onParamChange('q', v)}
            onClear={() => onParamChange('q', '')}
            placeholder="Filter bins…"
            variant="chrome"
            className="min-w-0 flex-1"
            // Room narrows the ROWS, so it rides IN the find field beside the
            // query it refines (find-only Band 3 — the right zone is view
            // toggles only). It was a hand-rolled `rounded-md` <select> in
            // `right` until 2026-08-08: a second filter grammar AND soft radius
            // on ops chrome.
            trailingSuffix={
              <WorkbenchFilterPopover
                open={roomFilterOpen}
                onOpenChange={setRoomFilterOpen}
                hot={Boolean(room)}
                hotActiveLabel={room || undefined}
                label="Filter by room"
                density="field"
              >
                <WorkbenchFilterMenuRow
                  label="All rooms"
                  active={!room}
                  onClick={() => {
                    onParamChange('room', '');
                    setRoomFilterOpen(false);
                  }}
                />
                {rooms.map((r) => {
                  const name = r.room || r.name;
                  return (
                    <WorkbenchFilterMenuRow
                      key={r.id}
                      label={r.zone_letter ? `${name} (${r.zone_letter})` : name}
                      active={room === name}
                      onClick={() => {
                        onParamChange('room', name);
                        setRoomFilterOpen(false);
                      }}
                    />
                  );
                })}
              </WorkbenchFilterPopover>
            }
          />
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
