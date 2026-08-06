'use client';

/**
 * SearchResultsSurface — shared results body for the `/search` find stage
 * browse list (and any host that wants the same retrieve + refine + flat RRF
 * list).
 *
 * Controlled: the host owns the query (URL state); the surface owns retrieval
 * + result rendering. Client refine (`etype`/`hstat`) + display sort over the
 * top-50. When `onSelectHit` is provided, hosts should `preventDefault` to keep
 * selection in-page (`?sel=`).
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Search } from '@/components/Icons';
import { SearchResultRow, type SearchRowDensity } from '@/components/search/SearchResultRow';
import { SearchResultRowSkeleton } from '@/components/search/SearchResultRowSkeleton';
import {
  SEARCH_SKELETON_TOP_PAD_PX,
  searchSkeletonCount,
} from '@/components/search/search-result-grid';
import { MonitorListBlock } from '@/design-system/components/monitor';
import { EmptyState } from '@/design-system/primitives';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { NearMatchPackout } from '@/hooks/useNearMatchPackout';
import {
  refineSearchHits,
  sortSearchHits,
  statusOptionsFromHits,
  type SearchDisplaySort,
} from '@/lib/search/search-refine';
import type { SearchHitEntityType } from '@/lib/search/search-hit';
import {
  isSearchSelActive,
  type SearchSelection,
} from '@/lib/search/search-selection';
import { cn } from '@/utils/_cn';

export interface SearchResultsSurfaceProps {
  query: string;
  /** Kept for call-site compatibility; only `global` is used. */
  scope?: 'global';
  /** Client entity-type refine (`?etype=`). */
  etype?: SearchHitEntityType | null;
  /** Client status refine (`?hstat=` → `facets.status`). */
  hstat?: string | null;
  /** Display sort (`?colsort=` — relevance default | date). */
  sort?: SearchDisplaySort;
  /** Row density. Compact for rails; comfortable for the `/search` Monitor feed. */
  density?: SearchRowDensity;
  /**
   * Show the secondary "Open journey" affordance on rows. Default true;
   * `/search` rail passes false (selection opens detail in-pane).
   */
  showJourneyAction?: boolean;
  /**
   * When false, skip the empty-query teach EmptyState (rail shows recents instead).
   */
  showEmptyTeach?: boolean;
  /**
   * Row click. Receives the event so a host can intercept the `<Link>`
   * (`event.preventDefault()` + write `?sel=`). When absent, rows navigate.
   */
  onSelectHit?: (hit: AiSearchHit, event: ReactMouseEvent) => void;
  /** Fires when the in-flight state changes. */
  onLoadingChange?: (loading: boolean) => void;
  /**
   * Fires with the UNFILTERED result set each time a query settles, so a host
   * can react (sole hit → set `sel`). Refine must not change sole-hit open.
   */
  onResults?: (hits: AiSearchHit[]) => void;
  /** Distinct `facets.status` values for a host-owned refine chrome. */
  onStatusOptions?: (options: string[]) => void;
  /**
   * Durable selection from `?sel=` — highlights any matching entity row.
   * Prefer this over `activeHitId` on the search workbench.
   */
  activeSel?: SearchSelection | null;
  /**
   * @deprecated Prefer `activeSel`. Order-only highlight for legacy rail hosts.
   */
  activeHitId?: number | null;
  /** Per-order packout proof for the rail rows (rep workbench only). */
  packoutById?: Record<number, NearMatchPackout>;
  className?: string;
}

interface FetchState {
  status: 'idle' | 'loading' | 'done' | 'forbidden' | 'error';
  hits: AiSearchHit[];
  usedSemantic: boolean;
  forKey: string;
}

export function SearchResultsSurface({
  query,
  etype = null,
  hstat = null,
  sort = 'relevance',
  density = 'comfortable',
  showJourneyAction,
  showEmptyTeach = true,
  onSelectHit,
  onLoadingChange,
  onResults,
  onStatusOptions,
  activeSel = null,
  activeHitId,
  packoutById,
  className,
}: SearchResultsSurfaceProps) {
  const q = query.trim();
  const [state, setState] = useState<FetchState>({
    status: 'idle',
    hits: [],
    usedSemantic: false,
    forKey: '',
  });
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [heightPx, setHeightPx] = useState(0);
  const pageContext = '/search';
  const presence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const transition = useMotionTransition(framerTransition.workbenchPaneSettle);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const publish = () => setHeightPx(el.clientHeight);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const statusOptions = useMemo(
    () => (state.status === 'done' ? statusOptionsFromHits(state.hits) : []),
    [state.status, state.hits],
  );

  const displayHits = useMemo(() => {
    if (state.status !== 'done') return [];
    return sortSearchHits(refineSearchHits(state.hits, { etype, hstat }), sort);
  }, [state.status, state.hits, etype, hstat, sort]);

  // One unscoped retrieve per query — cross-entity page, flat RRF order.
  useEffect(() => {
    const key = q;
    if (!q || q.length < 2) {
      setState({ status: 'idle', hits: [], usedSemantic: false, forKey: key });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, status: 'loading', forKey: key }));

    fetch('/api/ai/retrieve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: q,
        limit: 50,
        pageContext,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (controller.signal.aborted) return;
        if (res.status === 403) {
          setState({ status: 'forbidden', hits: [], usedSemantic: false, forKey: key });
          return;
        }
        if (!res.ok) throw new Error(`search failed (${res.status})`);
        const data = await res.json();
        setState({
          status: 'done',
          hits: data.hits ?? [],
          usedSemantic: Boolean(data.usedSemantic),
          forKey: key,
        });
      })
      .catch((err) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setState({ status: 'error', hits: [], usedSemantic: false, forKey: key });
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
    onStatusOptions?.(statusOptions);
  }, [statusOptions, onStatusOptions]);

  const hasRefine = Boolean(etype || hstat);
  const showResults = state.status === 'done' && displayHits.length > 0;
  const showLoading = state.status === 'loading';
  const isCompact = density === 'compact' || density === 'dropdown';
  /**
   * `dropdown` means "I am mounted inside a host that already owns a surface" —
   * the header dropdown and the `/search` stage browse panel. `MonitorListBlock`
   * draws its own `rounded-xl border bg-surface-card`, which is right on a
   * Monitor rollup and is a card-inside-a-card here. Both hosts were migrated to
   * flush shells; the nested one survived because it lives a component down,
   * where their guards do not read.
   */
  const hostOwnsShell = density === 'dropdown';
  const listShell = hostOwnsShell ? 'rounded-none border-0 bg-transparent' : undefined;
  const skeletonCount = searchSkeletonCount(
    heightPx > 0 ? Math.max(0, heightPx - SEARCH_SKELETON_TOP_PAD_PX) : 0,
  );

  function isActive(hit: AiSearchHit): boolean {
    if (activeSel) return isSearchSelActive(activeSel, hit);
    return hit.entityType === 'order' && activeHitId != null && hit.id === activeHitId;
  }

  return (
    <div ref={containerRef} className={className}>
      {state.status === 'done' && (
        <p className="px-3 pt-2 pb-1.5 text-role-eyebrow uppercase text-text-soft">
          {hasRefine
            ? `${displayHits.length} of ${state.hits.length === 50 ? '50+' : state.hits.length}`
            : state.hits.length === 50
              ? '50+'
              : state.hits.length}{' '}
          result
          {(hasRefine ? displayHits.length : state.hits.length) === 1 ? '' : 's'} for “{q}”
          {state.usedSemantic ? ' · semantic + keyword' : ' · keyword'}
          {sort === 'date' ? ' · by date' : ''}
        </p>
      )}


      {showEmptyTeach && !q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Search everything, from anywhere"
          description="Orders, serial units, receiving cartons, SKUs, repairs and FBA shipments — one query."
          className="mx-3 mt-2 rounded-xl border border-dashed border-border-soft bg-surface-canvas py-10"
        />
      )}

      {state.status === 'forbidden' && (
        <EmptyState
          title="AI search not available"
          description='Your role doesn’t include AI search yet — ask an admin to grant the “AI search retrieval” permission.'
          className="mx-3 mt-2 rounded-xl border border-dashed border-rose-200 bg-rose-50 py-8 [&_h3]:text-rose-800 [&_p]:text-rose-700"
        />
      )}
      {state.status === 'error' && (
        <EmptyState
          title="Search failed"
          description="Try again in a moment."
          className="mx-3 mt-2 rounded-xl border border-dashed border-rose-200 bg-rose-50 py-8 [&_h3]:text-rose-800 [&_p]:text-rose-700"
        />
      )}
      {state.status === 'done' && state.hits.length === 0 && q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title={`No matches for “${q}”`}
          description="Try fewer words, a partial serial, or the last 8 digits of a tracking number."
          className={cn(
            'mx-3 rounded-xl border border-dashed border-border-soft bg-surface-canvas',
            isCompact ? 'py-6' : 'py-8',
          )}
        />
      )}
      {state.status === 'done' && state.hits.length > 0 && displayHits.length === 0 && q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="No results match these filters"
          description="Clear a refine chip or pick a broader type / status."
          className={cn(
            'mx-3 rounded-xl border border-dashed border-border-soft bg-surface-canvas',
            isCompact ? 'py-6' : 'py-8',
          )}
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {showLoading ? (
          <motion.div
            key={`loading:${state.forKey}`}
            {...presence}
            transition={transition}
            className="flex h-full min-h-0 flex-col pt-2 pb-0"
          >
            <MonitorListBlock className={cn('min-h-0 flex-1', listShell)}>
              {Array.from({ length: skeletonCount }, (_, i) => (
                <li key={i}>
                  <SearchResultRowSkeleton />
                </li>
              ))}
            </MonitorListBlock>
          </motion.div>
        ) : null}

        {showResults ? (
          <motion.div
            key={`results:${state.forKey}`}
            {...presence}
            transition={transition}
            className="pb-4"
          >
            <MonitorListBlock className={listShell}>
              {displayHits.map((hit) => (
                <li key={`${hit.entityType}:${hit.id}`}>
                  <SearchResultRow
                    hit={hit}
                    density={density}
                    onNavigate={onSelectHit}
                    active={isActive(hit)}
                    showJourneyAction={showJourneyAction}
                    packout={hit.entityType === 'order' ? packoutById?.[hit.id] : undefined}
                  />
                </li>
              ))}
            </MonitorListBlock>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
