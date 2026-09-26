'use client';

/**
 * SearchResultsSurface — the `/search` find stage's results body.
 *
 * Controlled: the host owns the query (URL state); the surface owns retrieval
 * and hands the settled rows to the ONE table engine. Client refine
 * (`etype`/`hstat`/`chan`) + display ranking over the top-50.
 *
 * ## Two MOUNTS of one family, chosen by measure
 *
 * This was a hand-rolled `<ul>` of result links. That is no longer legal: a
 * display surface is a mount of the one engine at a read-only TIER, and
 * "read-only" buys no exemption from sort, selection or the family's verbs.
 *
 * At `comfortable` the mount is the `search-hits` DataTable
 * (`@/components/search/hits-grid`): a field catalog, a resolver, a
 * `row → CompoundRowView` adapter and a registry line. Zero components. Six
 * entity types collapse at the ADAPTER, which is invariant 1. Everything the
 * old list could not do — a column edge, click-to-sort headers, a Fields
 * picker, an org binding, a filter funnel, a row count — the mount gets
 * because every other desk in the product already has it.
 *
 * At `compact` the mount is a list of {@link SearchResultRow} — THE one search
 * row, the same renderer ⌘K and every rail already paint. Not a fork of the
 * engine and not a second table: a different MOUNT of the same family, chosen
 * by the route, exactly as `/m/work` paints `MobileToShipRow` cards while the
 * To-ship desk mounts the `orders` DataTable.
 *
 * ### Why not a phone LAYOUT TIER of `search-hits`
 *
 * A tier can unbind `status:N` / `subtitle:N` slots, and that is all it can
 * do. The seven CHROME tracks (`select` · `fulfillment` · `thumb` · `item` ·
 * `dates` · `state` · `_fill`) belong to `compoundColumnsFor`, whose refusal
 * of a per-mount width override is invariant 3 verbatim — "the door through
 * which a layout difference walks back in" — and stripping them at the mount
 * is `COMPOUND_SKELETON_FILTER_DEBT`. So the `minmax()` floor, the 1040px
 * track sum and the horizontal scroll all survive the tier, and the chrome row
 * (filter · sort · rows · fields · zoom) plus the column-header row still
 * spend ~90px above the first result on a 390px screen. `SURFACE_LAW` §5 names
 * the outcome directly: a full `DataTable` is not a phone list SoT.
 *
 * Loading paints nothing here — hosts publish pending via
 * `setGlobalSearchPending` so the header paints `SearchPendingBar`. Never
 * invent body “Opening…” holds or height-fill with skeleton rows.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from '@/components/Icons';
import { DataTable } from '@/components/tables/DataTable';
import { useSearchHitsSpreadsheet } from '@/components/search/hits-grid/useSearchHitsSpreadsheet';
import { EmptyState } from '@/design-system/primitives';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import {
  refineSearchHits,
  sortSearchHits,
  statusOptionsFromHits,
  channelOptionsFromHits,
  type SearchDisplaySort,
} from '@/lib/search/search-refine';
import type { SearchHitEntityType } from '@/lib/search/search-hit';
import { SearchResultRow } from '@/components/search/SearchResultRow';
import { useFindDensity } from '@/components/search/find-density-context';

export interface SearchResultsSurfaceProps {
  query: string;
  /** Kept for call-site compatibility; only `global` is used. */
  scope?: 'global';
  /** Client entity-type refine (`?etype=`). */
  etype?: SearchHitEntityType | null;
  /** Client channel refine (`?chan=`) — stored `source_platform` value. */
  chan?: string | null;
  /** Client status refine (`?hstat=` → `facets.status`). */
  hstat?: string | null;
  /** Display ranking (`?colsort=` — relevance default | date). */
  sort?: SearchDisplaySort;
  /**
   * When false, skip the empty-query teach EmptyState (rail shows recents instead).
   */
  showEmptyTeach?: boolean;
  /**
   * Row activation — the `?sel=` handoff. The row is not a link, so there is
   * no default to prevent: the host just records the selection.
   */
  onSelectHit?: (hit: AiSearchHit) => void;
  /** Fires when the in-flight state changes. */
  onLoadingChange?: (loading: boolean) => void;
  /**
   * Fires when retrieve ends in error so a host can reveal the shell
   * (stage uses this for the compact results extension).
   */
  onSettle?: () => void;
  /**
   * Fires with the UNFILTERED result set each time a query settles, so a host
   * can react (sole hit → set `sel`). Refine must not change sole-hit open.
   */
  onResults?: (hits: AiSearchHit[]) => void;
  /** Distinct `facets.status` values for a host-owned refine chrome. */
  onStatusOptions?: (options: string[]) => void;
  onChannelOptions?: (options: string[]) => void;
  className?: string;
}

interface FetchState {
  status: 'idle' | 'loading' | 'done' | 'error';
  hits: AiSearchHit[];
  forKey: string;
}

/**
 * The `comfortable` mount — the `search-hits` DataTable.
 *
 * Its own component so `useSearchHitsSpreadsheet` (which resolves the org's
 * slot layout, materializes tracks and builds a row view per hit) does not run
 * on a phone that is not going to paint a grid. A hook cannot be called
 * conditionally; a mount can.
 */
function SearchHitsTableMount({
  hits,
  loading,
  emptyMessage,
  totalCount,
  onOpenHit,
}: {
  hits: AiSearchHit[];
  loading: boolean;
  emptyMessage: string;
  /** UNREFINED settled count — the foot strip reads "N of M". */
  totalCount: number;
  onOpenHit?: (hit: AiSearchHit) => void;
}) {
  const sheet = useSearchHitsSpreadsheet({ hits, loading, emptyMessage, onOpenHit });
  return <DataTable {...sheet} totalCount={totalCount} />;
}

/**
 * The `compact` mount — a flush list of THE one search row.
 *
 * `role="listbox"` with the rows as DIRECT children, because
 * `SearchResultRow` puts `role="option"` on its own anchor: an `li` wrapper
 * between them breaks the listbox contract, which is why there is no `ul`
 * here even though this is a list.
 *
 * The separator is the row edge (`divide-y`), which is what the flush stage
 * trades its gutters and its shadow FOR. `showJourneyAction={false}` matches
 * the other list host (`CommandBar`): a per-row secondary icon is exactly the
 * chrome `SURFACE_LAW` R8 collapses on a phone.
 */
function SearchHitsPhoneList({
  hits,
  loading,
  emptyMessage,
  onSelectHit,
}: {
  hits: AiSearchHit[];
  loading: boolean;
  emptyMessage: string;
  onSelectHit?: (hit: AiSearchHit) => void;
}) {
  // A settled miss says which kind of miss it was; an in-flight query paints
  // nothing, because the header SearchPendingBar owns that hold.
  if (hits.length === 0) {
    return loading ? null : (
      <EmptyState title="No results" description={emptyMessage} />
    );
  }
  return (
    <div
      role="listbox"
      aria-label="Search results"
      data-testid="search-results-list"
      className="divide-y divide-border-hairline"
    >
      {hits.map((hit) => (
        <SearchResultRow
          key={`${hit.entityType}:${hit.id}`}
          hit={hit}
          density="compact"
          showJourneyAction={false}
          onNavigate={onSelectHit ? (next) => onSelectHit(next) : undefined}
        />
      ))}
    </div>
  );
}

export function SearchResultsSurface({
  query,
  etype = null,
  chan = null,
  hstat = null,
  sort = 'relevance',
  showEmptyTeach = true,
  onSelectHit,
  onLoadingChange,
  onSettle,
  onResults,
  onStatusOptions,
  onChannelOptions,
  className,
}: SearchResultsSurfaceProps) {
  const q = query.trim();
  const density = useFindDensity();
  const [state, setState] = useState<FetchState>({
    status: 'idle',
    hits: [],
    forKey: '',
  });
  const abortRef = useRef<AbortController | null>(null);

  const statusOptions = useMemo(
    () => (state.status === 'done' ? statusOptionsFromHits(state.hits) : []),
    [state.status, state.hits],
  );

  const displayHits = useMemo(() => {
    if (state.status !== 'done') return [];
    return sortSearchHits(refineSearchHits(state.hits, { etype, hstat, chan }), sort);
  }, [state.status, state.hits, etype, hstat, chan, sort]);

  // Classic cross-entity find — GET /api/global-search.
  useEffect(() => {
    const key = q;
    if (!q || q.length < 2) {
      setState({ status: 'idle', hits: [], forKey: key });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, status: 'loading', forKey: key }));

    // `surface` splits this page's telemetry from the palette's. The two have
    // different affordances — this one has filters and a full result list — so
    // their zero-result rates are not comparable and must not be pooled.
    fetch(`/api/global-search?q=${encodeURIComponent(q)}&limit=50&surface=search-page`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setState({ status: 'error', hits: [], forKey: key });
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        setState({
          status: 'done',
          hits: (data.rows ?? []) as AiSearchHit[],
          forKey: key,
        });
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setState({ status: 'error', hits: [], forKey: key });
      });
  }, [q]);

  useEffect(() => {
    onLoadingChange?.(state.status === 'loading');
  }, [state.status, onLoadingChange]);
  useEffect(() => () => onLoadingChange?.(false), [onLoadingChange]);

  useEffect(() => {
    if (state.status === 'done') onResults?.(state.hits);
  }, [state.status, state.hits, onResults]);

  useEffect(() => {
    if (state.status === 'error') onSettle?.();
  }, [state.status, onSettle]);

  useEffect(() => {
    onStatusOptions?.(statusOptions);
  }, [statusOptions, onStatusOptions]);

  const channelOptions = useMemo(
    () => (state.status === 'done' ? channelOptionsFromHits(state.hits) : []),
    [state.status, state.hits],
  );
  useEffect(() => {
    onChannelOptions?.(channelOptions);
  }, [channelOptions, onChannelOptions]);

  const hasRefine = Boolean(etype || hstat || chan);

  /**
   * The engine's settled-empty sentence. The URL refine narrows the rows
   * BEFORE they reach the mount, so the table cannot tell a filtered miss from
   * an absolute one — this surface can, and it says which.
   */
  const emptyMessage = hasRefine
    ? 'No results match these filters. Clear a refine chip or pick a broader type or status.'
    : 'Nothing in orders, units, cartons, SKUs, repairs or FBA matched this query.';

  const showResults = state.status === 'done' || state.status === 'loading';

  return (
    <div className={className}>
      {showEmptyTeach && !q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Search everything, from anywhere"
          description="Orders, serial units, receiving cartons, SKUs, repairs and FBA shipments. One query."
        />
      )}

      {state.status === 'error' && (
        <EmptyState
          tone="danger"
          title="Search failed"
          description="Try again in a moment."
        />
      )}

      {showResults && q ? (
        density === 'compact' ? (
          <SearchHitsPhoneList
            hits={displayHits}
            loading={state.status === 'loading'}
            emptyMessage={emptyMessage}
            onSelectHit={onSelectHit}
          />
        ) : (
          <SearchHitsTableMount
            hits={displayHits}
            loading={state.status === 'loading'}
            emptyMessage={emptyMessage}
            totalCount={state.hits.length}
            onOpenHit={onSelectHit}
          />
        )
      ) : null}
    </div>
  );
}
