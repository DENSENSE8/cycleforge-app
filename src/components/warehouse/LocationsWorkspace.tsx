'use client';

/**
 * Inventory › Locations workspace — Receiving Sheets flush recipe:
 * Band 1 nested facet dropdown under DeskPageChrome · Band 2 KPI (Bins) ·
 * Band 3 triage · sheet grid.
 *
 * Replaces the framed `/warehouse` desk. Nested tools (Labels / Bays /
 * Rooms / Map) keep their bodies; any data table mounts flush.
 *
 * Callers: `src/app/inventory/locations/page.tsx` (L16). Existing workspace —
 * not a second Locations surface. URL `?tab=` only; no data-file I/O.
 * User: "Update the second tabs into a drop-down…" / "Ensure that the drop
 * down is in the center and fixed width, same width as the other components"
 */

import { useCallback, useMemo, useState } from 'react';
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
import { WarehouseMap, type MapViewMode } from './WarehouseMap';
import { WarehouseFloorPlan } from './WarehouseFloorPlan';
import {
  LOCATIONS_TABS,
  parseLocationsTab,
  type LocationsTab,
} from '@/lib/inventory/locations-path';
import { LOCATION_BAY_LABEL_PLURAL } from '@/lib/barcode-routing';
import { LABEL_BUILDER } from '@/components/barcode/label-builder-layout';
import { ChevronDown } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cn } from '@/utils/_cn';

/** Visible Locations facets — same set the old TableTabs painted. */
const LOCATIONS_FACET_TABS = LOCATIONS_TABS.filter((id) => id !== 'bins');

function locationsFacetLabel(id: LocationsTab): string {
  if (id === 'bays') return LOCATION_BAY_LABEL_PLURAL;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function LocationsWorkspace() {
  const searchParams = useSearchParams();
  const tab = parseLocationsTab(searchParams.get('tab'));
  const pathname = usePathname();
  const router = useRouter();
  const setTab = useCallback(
    (next: LocationsTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const rackCodeParam = searchParams.get('code');
  const faceTab: LocationsTab = tab === 'bins' ? 'labels' : tab;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {/*
        Second-level Locations modes — centered dropdown under DeskPageChrome.
        Width matches the Labels/Bays builder column (`LABEL_BUILDER.contentShell`
        + page pad) so it lines up with the step-pill track below.
      */}
      <div className={cn('flex-none', LABEL_BUILDER.pagePad, 'pb-0')}>
        <div className={LABEL_BUILDER.contentShell}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 w-full justify-between"
                ariaLabel="Locations tool"
                iconRight={<ChevronDown className="h-3.5 w-3.5" />}
              >
                {locationsFacetLabel(faceTab)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
              {LOCATIONS_FACET_TABS.map((id) => (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => setTab(id)}
                  className={cn(id === faceTab && 'font-semibold text-text-default')}
                >
                  {locationsFacetLabel(id)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DashboardScrollShell className="h-full bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === 'rooms' ? <RoomDetailForm /> : null}
          {tab === 'labels' ? <LabelPrintWorkspace /> : null}
          {tab === 'bays' ? (
            rackCodeParam ? <RackDetailView code={rackCodeParam} /> : <RackLabelWorkspace />
          ) : null}
          {tab === 'map' ? <MapTabBody /> : null}
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
        search={{
          value: q,
          onChange: (v) => onParamChange('q', v),
          placeholder: 'Filter bins…',
        }}
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
