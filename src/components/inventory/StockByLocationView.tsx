'use client';

/**
 * Inventory › **Stock** — the warehouse-wide (location, sku) list, and the RSC
 * boundary for `/inventory/stock`.
 *
 * The page is a server component: it guards the permission and runs
 * `getStockByLocation`. `DataTable` is a client island — staff prefs, the
 * Fields picker, the search box, the funnel and column drag all live in the
 * browser — so the page renders THIS and hands the already-loaded rows across
 * as plain props. No fetch moves to the client.
 *
 * ## What this file owns, and what it must not
 *
 * It holds NO column model, no cell and no row component
 * (`TABLE_ENGINE_ACCEPTANCE`): the family glue is
 * {@link useLocationStockSpreadsheet} and the paint is the shared compound row.
 * What lives here is the CHROME half of that split — the two controls whose
 * state belongs in the URL, because a desk's view has to survive a reload and
 * travel in a shared link:
 *
 * - **Search** (`?q=`). The box is `DataTable`'s own, and the matching is the
 *   engine's: a row matches when any fact it PAINTS contains the query, which
 *   on this desk is the product title, the location, the room, the SKU, the
 *   level, the count stamp **and the qty riding under the title**. Nothing here
 *   re-implements that; the desk only decides where the string is kept.
 * - **Rooms** (`?room=`). `DataTableFilterMenu` — the one funnel, beside the
 *   search box (`DataTable` mounts it always; `FilterRefinementBar` and a hunt
 *   tile strip are the forks the law names). Multi-select, counted, grouped
 *   under one `Room` heading, and offering exactly the rooms present in the
 *   feed so the menu can never advertise a room the body cannot show.
 *
 * Narrowing order is ROOM then SEARCH, and it matters: the funnel's counts are
 * computed over the unfiltered feed (an operator has to see what selecting
 * `Annex` would get them before they select it), while the search box runs
 * inside whatever rooms are selected, which is what "search within this
 * narrowing" means everywhere else in the product.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from '@/components/Icons';
import {
  DataTable,
  type DataTableFilterChrome,
  type DataTableToolbarAction,
} from '@/components/tables/DataTable';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { useOptimisticUrlParams } from '@/hooks/useOptimisticUrlParam';
import { useLocationStockSpreadsheet } from '@/components/inventory/location-stock-grid/useLocationStockSpreadsheet';
import { StockPairComposer } from '@/components/inventory/location-stock-grid/StockPairComposer';
import { StockActionBar } from '@/components/inventory/location-stock-grid/StockActionBar';
import { useLocationStockSelection } from '@/components/inventory/location-stock-grid/useLocationStockSelection';
import { useLocationStockRealtime } from '@/components/inventory/location-stock-grid/useLocationStockRealtime';
import {
  filterLocationStockByRooms,
  locationStockRoomFacets,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import { stockLiveRefreshLabel } from '@/lib/inventory/stock-live-refresh';
import { INVENTORY_STOCK_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';

const STOCK_ROUTE = '/inventory/stock';
const QUERY_PARAM = 'q';
const ROOM_PARAM = 'room';

/** The funnel's one heading — a single band, so the menu prints it as a label. */
const ROOM_BAND = 'Room';

/**
 * The two URL-durable facets, as one record.
 *
 * A `type` rather than an `interface`: `useOptimisticUrlParams` constrains its
 * parameter to `Record<string, unknown>`, and an interface has no implicit
 * index signature, so the declaration form is load-bearing here.
 */
type StockFacets = {
  q: string;
  rooms: readonly string[];
};

/**
 * `?room=A,B` ⇄ `['A','B']`. A comma list, the same shape Inventory's `state`
 * and `condition` multi-selects already use, so one vocabulary covers all three.
 */
function parseRooms(raw: string | null): readonly string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function StockByLocationView({
  rows,
  totalCount,
}: {
  rows: readonly LocationStockTableRow[];
  /** Pairs with stock org-wide, before the loader's cap — the honest denominator. */
  totalCount: number;
}) {
  const router = useRouter();
  // Closed by default: the desk's job is READING what is where, and the intake
  // row is a verb the operator asks for. The CTA toggles it.
  const [composerOpen, setComposerOpen] = useState(false);
  const searchParams = useSearchParams();

  const urlValues = useMemo<StockFacets>(
    () => ({
      q: searchParams.get(QUERY_PARAM) ?? '',
      rooms: parseRooms(searchParams.get(ROOM_PARAM)),
    }),
    [searchParams],
  );

  /**
   * Within-route param mutation: clone the current query, rewrite the two
   * facets, and emit in the route's DECLARED key order so
   * `SurfaceParamHygiene` sees a canonical URL and fires no second reordering
   * replace. `parseRouteParams` keeps owned + carried keys, so the ambient
   * `?colsort=` / `?coldir=` column sort survives a room toggle.
   */
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = parseRouteParams(INVENTORY_STOCK_ROUTE_PARAMS, params).toString();
      router.replace(qs ? `${STOCK_ROUTE}?${qs}` : STOCK_ROUTE, { scroll: false });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: StockFacets) => {
    if (next.q.trim()) params.set(QUERY_PARAM, next.q);
    else params.delete(QUERY_PARAM);
    if (next.rooms.length > 0) params.set(ROOM_PARAM, next.rooms.join(','));
    else params.delete(ROOM_PARAM);
  }, []);

  const { value: facets, setValue: setFacets } = useOptimisticUrlParams<StockFacets>({
    urlValues,
    // Full-record equality: the rooms list is a new array on every parse, so
    // per-key `Object.is` would never settle the pending paint and the funnel
    // would stay optimistic forever.
    equals: (a, b) =>
      a.q === b.q &&
      a.rooms.length === b.rooms.length &&
      a.rooms.every((room, i) => room === b.rooms[i]),
    replace,
    write,
  });

  const onSearchChange = useCallback(
    (next: string) => setFacets({ ...facets, q: next }),
    [facets, setFacets],
  );

  const search = useMemo(
    () => ({
      value: facets.q,
      onChange: onSearchChange,
      // Names the three facts an operator reaches for by hand. The engine
      // matches every painted fact, so this is the invitation, not the limit.
      placeholder: 'Search product, qty, location…',
    }),
    [facets.q, onSearchChange],
  );

  /** Counted over the WHOLE feed — see the docblock on narrowing order. */
  const roomFacets = useMemo(() => locationStockRoomFacets(rows), [rows]);

  const onToggleRoom = useCallback(
    (id: string) => {
      const next = facets.rooms.includes(id)
        ? facets.rooms.filter((room) => room !== id)
        : [...facets.rooms, id];
      setFacets({ ...facets, rooms: next });
    },
    [facets, setFacets],
  );

  const onClearRooms = useCallback(
    () => setFacets({ ...facets, rooms: [] }),
    [facets, setFacets],
  );

  const filter = useMemo<DataTableFilterChrome>(
    () => ({
      options: roomFacets.map((room) => ({
        id: room.id,
        label: room.label,
        count: room.count,
        active: facets.rooms.includes(room.id),
        group: ROOM_BAND,
      })),
      onToggle: onToggleRoom,
      onClearAll: onClearRooms,
    }),
    [roomFacets, facets.rooms, onToggleRoom, onClearRooms],
  );

  const visible = useMemo(
    () => filterLocationStockByRooms(rows, facets.rooms),
    [rows, facets.rooms],
  );

  /**
   * The desk's row selection. It lives HERE rather than in the family glue
   * because the strip is the page's: `useLocationStockSpreadsheet` needs the
   * ticked set to paint the gutter, and {@link StockActionBar} needs the rows
   * themselves to write them. One set, two readers.
   */
  const selection = useLocationStockSelection(visible);

  const sheet = useLocationStockSpreadsheet({ rows: visible, search, selection });

  /**
   * The desk's live half. A bin commit anywhere on the floor — the gun, `/m`'s
   * offline queue draining, a transfer, a cycle count — publishes a
   * `STOCK_DELTA_*`, and an IDLE desk refreshes on it. There is no poll: the
   * page is RSC + `force-dynamic`, so a tick costs a whole server render of a
   * two-CTE union, and the phone's queued writes make a clock no fresher anyway.
   *
   * GATED is the part that matters. While a selection is armed or intake is
   * open, deltas are counted instead of applied: the strip writes the rows it
   * was handed (`stock-bin-writes.ts`), so a refresh that dropped a ticked row
   * would fire the verb on a different set than the one on screen. Clearing the
   * selection or closing the composer flushes what the gate held.
   */
  const live = useLocationStockRealtime({
    gated: selection.rows.length > 0 || composerOpen,
  });

  /**
   * The page CTA, top-right of the desk header — `DeskActionSlotRegistrar`
   * `role="primary"` is the create verb's one home on every desk (Support's
   * New ticket, Home's Add, Media Library's Add photos). A corner button
   * inside the table body would be this desk's own intake chrome.
   */
  const addAction = useMemo(
    () => (
      <DeskHeaderAction
        variant="primary"
        size="sm"
        onClick={() => setComposerOpen((open) => !open)}
        aria-expanded={composerOpen}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add stock
      </DeskHeaderAction>
    ),
    [composerOpen],
  );

  /**
   * The held-deltas chip — the toolbar `actions` cluster, which is DataTable's
   * one home for a verb that runs a job on the queue in view. Not
   * `TableStatusBar`'s lead (a readout, never a CTA) and not `bodyPrefix`,
   * whose single tenant is already the strip-or-intake pair. Unmounted while
   * the desk is idle, because an idle desk has already refreshed.
   */
  const actions = useMemo<readonly DataTableToolbarAction[] | undefined>(
    () =>
      live.pending > 0
        ? [
            {
              id: 'stock-live-refresh',
              label: `${stockLiveRefreshLabel(live.pending)} · Refresh`,
              variant: 'secondary',
              testId: 'stock-live-refresh',
              onClick: live.refreshNow,
            },
          ]
        : undefined,
    [live.pending, live.refreshNow],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <DeskActionSlotRegistrar role="primary">{addAction}</DeskActionSlotRegistrar>
      <DataTable
        {...sheet}
        totalCount={totalCount}
        filter={filter}
        actions={actions}
        // `bodyPrefix` is the sanctioned slot for domain content over the rows
        // (Incoming PO intake is the precedent): under the column header,
        // inside the scroll body, never in the chrome row that owns search and
        // the funnel. ONE tenant, two occupants, in this order:
        //
        // A selection ARMS the verb strip, which portals itself into the
        // header's own `data-slot-table-action-row` guest; intake paints in
        // place. They are mutually exclusive on purpose — an operator adding
        // stock is not also bulk-moving it — and one host means one measured
        // height for `LedgerGrid`'s ResizeObserver.
        bodyPrefix={
          selection.rows.length > 0 ? (
            <StockActionBar
              rows={selection.rows}
              onClear={selection.clear}
              onCommitted={live.refreshNow}
            />
          ) : composerOpen ? (
            <StockPairComposer
              onClose={() => setComposerOpen(false)}
              onCommitted={live.refreshNow}
            />
          ) : null
        }
      />
    </div>
  );
}
