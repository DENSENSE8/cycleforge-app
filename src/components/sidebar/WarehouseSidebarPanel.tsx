'use client';

/**
 * Warehouse sidebar panel for /inventory/locations.
 *
 * Callers: InventorySidebarPanel. No data schemas.
 * Labels + Bays: empty left rail (room pick is RoomPicker in the main builder).
 * Rooms: room finder search + list. Bins/Map: SKU search + tab body.
 * User: "Remove the search function on the left side for the inventory page"
 * / "Remove the components that show up in the left side in the inventory page".
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { useWarehouseSkuSearch, looksLikeBinBarcode } from '@/hooks/useWarehouseSkuSearch';
import { MapLegend, type MapViewMode } from '@/components/warehouse/WarehouseMap';
import { RoomsSidebarList } from '@/components/warehouse/RoomsSidebarList';
import { WarehouseSkuSearchResults } from '@/components/warehouse/WarehouseSkuSearchResults';
import { useAuth } from '@/contexts/AuthContext';
import { RoomFinderProvider, useRoomFinder } from '@/components/warehouse/roomFinderContext';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { SearchBar } from '@/components/ui/SearchBar';
import { Panel } from '@/design-system/primitives';
import { isLocationsRaillessTab, parseLocationsTab } from '@/lib/inventory/locations-path';

export function WarehouseSidebarPanel() {
  // The room-finder query lives in RoomFinderContext; the inner panel reads it
  // (via the shell's `search` slot) so it must mount BELOW the provider.
  return (
    <RoomFinderProvider>
      <WarehouseSidebarInner />
    </RoomFinderProvider>
  );
}

function WarehouseSidebarInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const tab = parseLocationsTab(searchParams.get('tab'));
  const { query: roomQuery, setQuery: setRoomQuery } = useRoomFinder();
  const skuSearch = useWarehouseSkuSearch();

  // Rooms tab filters the room list. Labels / Bays / Totes have no left rail
  // chrome — those facets are print/builder bodies. Other tabs use SKU/bin lookup.
  const isRoomFinderTab = tab === 'rooms';
  const hideLeftChrome = isLocationsRaillessTab(tab);

  const showSkuResults =
    !isRoomFinderTab &&
    !hideLeftChrome &&
    skuSearch.open &&
    !!skuSearch.value.trim() &&
    !looksLikeBinBarcode(skuSearch.value);

  return (
    <SidebarShell
      className={appChromeClass}
      headerAbove={
        hideLeftChrome ? undefined : (
          <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
            <SearchBar
              size="compact"
              variant="blue"
              value={isRoomFinderTab ? roomQuery : skuSearch.value}
              onChange={
                isRoomFinderTab
                  ? setRoomQuery
                  : (v) => { skuSearch.setValue(v); skuSearch.setOpen(true); }
              }
              onClear={isRoomFinderTab ? () => setRoomQuery('') : skuSearch.handleClear}
              onSearch={isRoomFinderTab ? undefined : (v) => skuSearch.handleSearch(v)}
              placeholder={
                isRoomFinderTab
                  ? 'Filter rooms by name or zone…'
                  : 'Filter product, SKU, or bin barcode…'
              }
              isSearching={isRoomFinderTab ? undefined : skuSearch.loading}
            />
          </div>
        )
      }
      bodyClassName="flex flex-col overflow-hidden p-0"
    >
      {showSkuResults && (
        <div className={`${SIDEBAR_GUTTER} py-2`}>
          <WarehouseSkuSearchResults
            loading={skuSearch.loading}
            hits={skuSearch.hits}
            onSelect={() => skuSearch.setOpen(false)}
          />
        </div>
      )}
      {tab === 'rooms' ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <RoomsSidebarList />
        </div>
      ) : hideLeftChrome ? (
        <div className="min-h-0 min-w-0 flex-1" aria-hidden />
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-hide">
          {tab === 'bins' && <BinsSidebarBody />}
          {tab === 'map' && <MapSidebarBody />}
        </div>
      )}

      <footer className="p-4 border-t border-border-hairline opacity-30 mt-auto text-center">
        <p className="text-role-eyebrow font-mono uppercase tracking-[0.2em] text-text-soft">
          {(user?.organizationName || 'Workspace').toUpperCase()} INV
        </p>
      </footer>
    </SidebarShell>
  );
}

// ── Bins sidebar — recent activity feed (filters are in the main area) ────

function BinsSidebarBody() {
  return (
    <div className={`space-y-3 ${SIDEBAR_GUTTER} py-4`}>
      <p className="text-role-caption text-text-soft">
        Filter, sort, and select bins in the table to the right. Click any
        bin to see its full contents + history.
      </p>
      <div>
        <h3 className="mb-2 text-role-micro uppercase tracking-[0.16em] text-text-soft">
          Recent activity
        </h3>
        <RecentBinsActivity />
      </div>
    </div>
  );
}

function RecentBinsActivity() {
  // Reuse AuditTimeline scoped to "anything bin-shaped" by leaving the
  // identifier off. Falls back to an empty state if the timeline endpoint
  // requires an id — surface a hint then.
  return (
    <Panel radius="xl" padding="sm" className="border-dashed text-center">
      <p className="text-role-caption text-text-soft">
        Click a bin in the table to see its history.
      </p>
      <p className="mt-1 text-role-micro text-text-faint">
        A cross-bin feed lands in the next update.
      </p>
    </Panel>
  );
}

// ── Map sidebar — view-mode toggle + legend ───────────────────────────────

/** Table color modes + the React Flow floor-plan renderer (Phase 1: fill colors). */
type MapSidebarView = MapViewMode | 'floorplan';

const MAP_VIEW_LABELS: Record<MapSidebarView, string> = {
  fill: 'Fill',
  age: 'Age',
  issues: 'Issues',
  floorplan: 'Floor plan',
};

function MapSidebarBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get('view'));

  const setView = (next: MapSidebarView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'map');
    params.set('view', next);
    router.replace(`/warehouse?${params.toString()}`);
  };

  return (
    <div className={`space-y-4 ${SIDEBAR_GUTTER} py-4`}>
      <div>
        <h3 className="mb-2 text-role-micro uppercase tracking-[0.16em] text-text-soft">
          View by
        </h3>
        <div className="grid grid-cols-2 gap-1">
          {(['fill', 'age', 'issues', 'floorplan'] as MapSidebarView[]).map((m) => {
            const active = view === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setView(m)}
                className={`ds-raw-button rounded-md px-2 py-1.5 text-role-caption font-semibold transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    : 'text-text-muted hover:bg-surface-sunken'
                }`}
              >
                {MAP_VIEW_LABELS[m]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-role-micro uppercase tracking-[0.16em] text-text-soft">
          Legend
        </h3>
        <MapLegend mode={view === 'floorplan' ? 'fill' : view} />
      </div>
    </div>
  );
}

function parseView(raw: string | null): MapSidebarView {
  if (raw === 'age' || raw === 'issues' || raw === 'floorplan') return raw;
  return 'fill';
}
