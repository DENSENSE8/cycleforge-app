'use client';

/**
 * Warehouse sidebar panel.
 *
 * Mounted on /warehouse. The dashboard chrome owns the title. L2 tabs
 * (Labels · Rooms · Bins · Map · …) live in GlobalHeader. This panel renders:
 *   - The SKU/bin finder (always visible)
 *   - Tab-specific body: a small contextual hint per tab. Every workspace
 *     (rooms board, location label printer, bins table, warehouse map) lives in
 *     the main area via WarehouseShell so it can use the full content width.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { useWarehouseSkuSearch, looksLikeBinBarcode } from '@/hooks/useWarehouseSkuSearch';
import { MapLegend, type MapViewMode } from '@/components/warehouse/WarehouseMap';
import { RoomsSidebarList } from '@/components/warehouse/RoomsSidebarList';
import { WarehouseSkuSearchResults } from '@/components/warehouse/WarehouseSkuSearchResults';
import { BinLabelPrinter } from '@/components/barcode/BinLabelPrinter';
import { RackLabelPrinter } from '@/components/barcode/RackLabelPrinter';
import { useAuth } from '@/contexts/AuthContext';
import { RoomFinderProvider, useRoomFinder } from '@/components/warehouse/roomFinderContext';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { SearchBar } from '@/components/ui/SearchBar';

type InventoryTab = 'rooms' | 'bins' | 'labels' | 'racks' | 'map';

function parseTab(raw: string | null): InventoryTab {
  if (raw === 'rooms' || raw === 'bins' || raw === 'racks' || raw === 'map') return raw;
  return 'labels';
}

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
  const tab = parseTab(searchParams.get('tab'));
  const { query: roomQuery, setQuery: setRoomQuery } = useRoomFinder();
  const skuSearch = useWarehouseSkuSearch();

  // Tabs that display a list of rooms in the sidebar (and therefore want
  // the top search bar to filter rooms instead of running a global SKU/bin
  // lookup). Keeping one bar per surface — driven by a shared context —
  // beats two stacked search inputs both visually and for keyboard /
  // screen-reader navigation.
  const isRoomFinderTab = tab === 'rooms' || tab === 'labels' || tab === 'racks';
  const roomFinderPlaceholder =
    tab === 'labels'
      ? 'Filter rooms to label by name or zone…'
      : tab === 'racks'
        ? 'Filter rooms to print racks for…'
        : 'Filter rooms by name or zone…';

  const showSkuResults =
    !isRoomFinderTab &&
    skuSearch.open &&
    !!skuSearch.value.trim() &&
    !looksLikeBinBarcode(skuSearch.value);

  return (
    <SidebarShell
      className={appChromeClass}
      headerAbove={
        /* In-context list filter — local base SearchBar. Room-finder tabs
            filter the room list; other tabs run the SKU/bin lookup. The
            global header pill stays global. */
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
            placeholder={isRoomFinderTab ? roomFinderPlaceholder : 'Filter product, SKU, or bin barcode…'}
            isSearching={isRoomFinderTab ? undefined : skuSearch.loading}
          />
        </div>
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
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-hide">
          {tab === 'bins'   && <BinsSidebarBody />}
          {tab === 'labels' && <LabelsSidebarBody />}
          {tab === 'racks'  && <RacksSidebarBody />}
          {tab === 'map'    && <MapSidebarBody />}
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

// ── Labels sidebar — full picker on desktop; hint on mobile ──────────────
// On lg+ the BinLabelPrinter renders its compact `sidebar` variant here so
// the form sits next to the giant preview in the main pane. On smaller
// viewports the drawer is cramped, so we fall back to a hint and let
// users build the label in the main pane (which renders the full picker
// on <lg).

function LabelsSidebarBody() {
  return (
    <>
      <div className="hidden lg:block">
        <BinLabelPrinter variant="sidebar" />
      </div>
      <div className={`space-y-3 ${SIDEBAR_GUTTER} py-4 lg:hidden`}>
        <p className="text-role-caption text-text-soft">
          Build a bin label in the main workspace — pick a room, then drill into
          aisle, bay, level, and position. Live preview + QR render alongside the
          picker.
        </p>
        <p className="text-role-micro text-text-faint">
          Tip: ⌘P / Ctrl+P prints the current label once all steps are picked.
        </p>
      </div>
    </>
  );
}

// ── Racks sidebar — full picker on desktop; hint on mobile ───────────────

function RacksSidebarBody() {
  return (
    <>
      <div className="hidden lg:block">
        <RackLabelPrinter variant="sidebar" />
      </div>
      <div className={`space-y-3 ${SIDEBAR_GUTTER} py-4 lg:hidden`}>
        <p className="text-role-caption text-text-soft">
          Print a rack-level label in the main workspace — pick a room, then
          aisle, bay, and level. No position needed; one label covers the whole
          rack column on that level.
        </p>
        <p className="text-role-micro text-text-faint">
          Scanning a rack label opens the rack view so pickers and putaway can
          see everything on it at once.
        </p>
      </div>
    </>
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
    <div className="rounded-xl border border-dashed border-border-soft bg-surface-card p-3 text-center">
      <p className="text-role-caption text-text-soft">
        Click a bin in the table to see its history.
      </p>
      <p className="mt-1 text-role-micro text-text-faint">
        A cross-bin feed lands in the next update.
      </p>
    </div>
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
