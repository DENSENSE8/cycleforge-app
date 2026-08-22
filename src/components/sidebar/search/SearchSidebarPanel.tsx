'use client';

/**
 * `/search` context rail — persistent find bar over Recently searched.
 *
 * Zone 1 of the Search &amp; Details station layout. Two bands, both
 * edge-to-edge: this panel carries NO padding of its own, because both children
 * own their whole padding story (`TechRailSearchBar` says so on its `density`
 * prop; `SidebarRecentRailBase` nests its column pad inside each `RailRow` via
 * `railInset="scanDock"`). A `p-*` here would stack on those intents and, per
 * that same docblock, silently no-op while looking deliberate.
 *
 * **The bar both commits and filters.** Enter commits a query to `?q=` (and
 * drops `?sel=`, since a new search is not the old record); the draft
 * simultaneously narrows the recents beneath it. One field, because two boxes
 * in a 360px rail is how you get an operator typing into the wrong one.
 *
 * Selecting a recent that resolved to a record sets `?sel=` in place —
 * `router.replace`, no navigation, so the centre swaps without a reload.
 *
 * **ONE age render per row (2026-08-21).** The row's age is the rail shell's
 * own age column, fed by `getActivityAt` — the Unbox face. This panel used to
 * ALSO pass a `metaTrailing` age through `formatRelativeTime`, so every row
 * carried the same instant twice in two grammars (`16d` beside `2w`,
 * `formatLaneAgeCompact` topping out in days while the other banded to weeks).
 *
 * **No floating quick-note.** `SearchRailQuickNote` and the `pb-16` clearance
 * that existed solely for it were deleted in the Unbox parity teardown — the
 * Unbox rail is find + recents, and nothing else.
 *
 * *(This rail is a documented exception to "find lives only in
 * GlobalHeaderSearch" — see `docs/rules/display/search-station.md`.)*
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import {
  resolveSearchRecentSelectedId,
  searchRecentMatchesFilter,
  searchRecentMeta,
  searchRecentRowId,
  searchRecentSelection,
  searchRecentStatusDot,
  searchRecentStatusDotLabel,
  searchRecentTitle,
} from './search-recent-rail-vm';
import type { SearchRecentEntry } from '@/lib/search/search-recents';
import {
  pushStaffRecentClient,
  SEARCH_RECENTS_RAIL_KEY_PREFIX,
} from '@/lib/search/staff-recents-client';
import {
  SEARCH_SEL_PARAM,
  formatSearchSel,
  parseSearchSel,
} from '@/lib/search/search-selection';

const SEARCH_RAIL_LIMIT = 20;

async function fetchSearchRecents(limit: number): Promise<SearchRecentEntry[]> {
  const res = await fetch(`/api/search/recents?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load recent searches');
  const data = await res.json();
  return Array.isArray(data?.recents) ? data.recents.slice(0, limit) : [];
}

/**
 * ONE key and ONE fetcher, module-scope, shared by this panel's own read and by
 * the rail shell's internal query — so React Query dedupes them onto a single
 * cache entry and a single request.
 *
 * The panel used to hand the shell a `fetchFn` that just returned the rows the
 * panel had already fetched, under a key that interpolated `rows.map(r => r.id)`.
 * That is an identity dance, not a cache: every feed change minted a NEW key,
 * so the shell threw away its entry and re-resolved from scratch, and its
 * `isLoading` was permanently false (the fetcher was synchronous), which is why
 * the empty text had to hand-roll a loading arm the shell already owns.
 */
const SEARCH_RAIL_QUERY_KEY = [SEARCH_RECENTS_RAIL_KEY_PREFIX, SEARCH_RAIL_LIMIT] as const;
const railFetch = () => fetchSearchRecents(SEARCH_RAIL_LIMIT);

export function SearchSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const sel = useMemo(
    () => parseSearchSel(searchParams.get(SEARCH_SEL_PARAM)),
    [searchParams],
  );

  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');

  // The panel reads the SAME entry the shell reads — it needs the rows itself
  // to resolve which one `?sel=` / `?q=` is showing, and `selectedId` is a
  // required prop on the shell.
  const { data: rows = [] } = useQuery({
    queryKey: SEARCH_RAIL_QUERY_KEY,
    queryFn: railFetch,
    staleTime: 30_000,
  });

  const selectedId = useMemo(
    () => resolveSearchRecentSelectedId(rows, sel, q),
    [rows, sel, q],
  );

  const includeRow = useCallback(
    (row: SearchRecentEntry) => searchRecentMatchesFilter(row, filterText),
    [filterText],
  );

  const selectRow = useCallback(
    (row: SearchRecentEntry) => {
      const params = new URLSearchParams(searchParams.toString());
      const rowSel = searchRecentSelection(row);
      if (rowSel) {
        params.set(SEARCH_SEL_PARAM, formatSearchSel(rowSel.entityType, rowSel.id));
        if (row.query.trim()) params.set('q', row.query.trim());
      } else {
        params.delete(SEARCH_SEL_PARAM);
        params.set('q', row.query.trim());
      }
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const commitQuery = useCallback(
    (next: string) => {
      const value = next.trim();
      if (!value) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', value);
      // A new search is not the old record — never leave a stale `?sel=`
      // painting a detail the operator did not ask for.
      params.delete(SEARCH_SEL_PARAM);
      router.replace(`/search?${params.toString()}`, { scroll: false });
      // A query committed from the rail is a recent like any other. Without
      // this the rail was a read-only window onto a table nothing wrote, so an
      // operator's own searches never appeared in their own recents.
      pushStaffRecentClient({ query: value, scope: 'global' });
      void queryClient.invalidateQueries({ queryKey: [SEARCH_RECENTS_RAIL_KEY_PREFIX] });
    },
    [router, searchParams, queryClient],
  );

  return (
    // `bg-surface-card` (#ffffff in the light theme) — the rail paints its own
    // white plane rather than inheriting the canvas ground CONTEXT_PANEL_HOST
    // gives every other rail, so all three Search columns read as one sheet.
    // Scoped to this panel on purpose: flipping the shared host would repaint
    // every rail in the app.
    <div
      className="relative flex h-full min-h-0 flex-col bg-surface-card"
      data-testid="search-sidebar-panel"
    >
      <TechRailSearchBar
        value={filterText}
        onChange={setFilterText}
        onSearch={commitQuery}
        onClear={() => setFilterText('')}
        placeholder="Search…"
        // `rail`, not `chrome`: the chrome variant is a full-height field built
        // for a horizontal band, so in this flex COLUMN its `h-full` took the
        // entire 860px rail and squashed the recents scrollport to zero.
        variant="rail"
        density="row"
        flush
        data-testid="search-rail-find"
      />
      <SidebarRailScrollport>
        <SidebarRecentRailBase<SearchRecentEntry>
          queryKey={SEARCH_RAIL_QUERY_KEY}
          fetchFn={railFetch}
          selectedId={selectedId}
          limit={SEARCH_RAIL_LIMIT}
          preserveServerOrder
          includeRow={includeRow}
          eyebrowTitle="Recently searched"
          // No loading arm: the shell paints the house loading field while its
          // own query is in flight. This text is for a settled EMPTY feed.
          emptyText={filterText.trim() ? 'No recent finds match' : 'No recent finds'}
          getId={searchRecentRowId}
          getReconcileId={(row) => row.id}
          getActivityAt={(row) => row.timestamp}
          // Arms the LEFT nav-keys region, the same opt-in `RecentActivityRailBase`
          // makes. Without it the leader armed Right on /search and Left was
          // dead, so the rail could not be walked from the keyboard at all.
          navRegionId="left"
          onSelect={selectRow}
          getStatusDot={searchRecentStatusDot}
          getStatusDotLabel={searchRecentStatusDotLabel}
          getCollapsePinLabel={searchRecentTitle}
          getCollapsePinMeta={searchRecentMeta}
          renderRowMain={(row) => (
            <RailRowBody
              className="flex-1"
              vm={{
                title: searchRecentTitle(row),
                titleAttr: searchRecentTitle(row),
                meta: (() => {
                  const meta = searchRecentMeta(row);
                  return meta ? (
                    <span className="truncate text-text-muted">{meta}</span>
                  ) : null;
                })(),
              }}
            />
          )}
        />
      </SidebarRailScrollport>
    </div>
  );
}
