'use client';

/**
 * SearchResultsSurface — shared results body for the `/search` find stage
 * browse list (and any host that wants the same retrieve + refine + flat
 * list).
 *
 * Controlled: the host owns the query (URL state); the surface owns retrieval
 * + result rendering. Client refine (`scope`/`hstat`) + display sort over the
 * top-50. When `onSelectHit` is provided, hosts should `preventDefault` to keep
 * selection in-page (`?sel=`).
 *
 * Loading paints nothing here — hosts publish pending via
 * `setGlobalSearchPending` so the header paints `SearchPendingBar`. Never
 * invent body “Opening…” holds or height-fill with skeleton rows.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Search } from '@/components/Icons';
import { SearchResultRow, type SearchRowDensity } from '@/components/search/SearchResultRow';
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
  channelOptionsFromHits,
  type SearchDisplaySort,
} from '@/lib/search/search-refine';
import type { SearchHitEntityType } from '@/lib/search/search-hit';
import {
  isSearchSelActive,
  type SearchSelection,
} from '@/lib/search/search-selection';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

export interface SearchResultsSurfaceProps {
  query: string;
  /** Kept for call-site compatibility; only `global` is used. */
  scope?: 'global';
  /** Client entity-type refine (`?scope=`). */
  etype?: SearchHitEntityType | null;
  /** Client channel refine (`?chan=`) — stored `source_platform` value. */
  chan?: string | null;
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
  status: 'idle' | 'loading' | 'done' | 'error';
  hits: AiSearchHit[];
  forKey: string;
}

export function SearchResultsSurface({
  query,
  etype = null,
  chan = null,
  hstat = null,
  sort = 'relevance',
  density = 'comfortable',
  showJourneyAction,
  showEmptyTeach = true,
  onSelectHit,
  onLoadingChange,
  onSettle,
  onResults,
  onStatusOptions,
  onChannelOptions,
  activeSel = null,
  activeHitId,
  packoutById,
  className,
}: SearchResultsSurfaceProps) {
  const q = query.trim();
  const [state, setState] = useState<FetchState>({
    status: 'idle',
    hits: [],
    forKey: '',
  });
  const abortRef = useRef<AbortController | null>(null);
  const presence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const transition = useMotionTransition(framerTransition.workbenchPaneSettle);

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
        if ((err as { name?: string }).name === 'AbortError') return;
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

  const hasRefine = Boolean(etype || hstat);
  const showResults = state.status === 'done' && displayHits.length > 0;
  const isCompact = density === 'compact' || density === 'dropdown';
  /**
   * `dropdown` means "I am mounted inside a host that already owns a surface" —
   * the header dropdown and the `/search` stage browse panel. `MonitorListBlock`
   * draws its own `rounded-xl border bg-surface-card`, which is right on a
   * Monitor rollup and is a card-inside-a-card here. Both hosts were migrated to
   * flush shells; the nested one survived because it lives a component down,
   * where their guards do not read.
   */
  const listChrome = density === 'dropdown' ? 'flush' : 'card';

  function isActive(hit: AiSearchHit): boolean {
    if (activeSel) return isSearchSelActive(activeSel, hit);
    return hit.entityType === 'order' && activeHitId != null && hit.id === activeHitId;
  }

  return (
    <div className={className}>
      {state.status === 'done' && state.hits.length > 0 && (
        <p className="px-3 pt-2 pb-1.5 text-role-eyebrow uppercase text-text-soft">
          {hasRefine
            ? `${displayHits.length} of ${state.hits.length === 50 ? '50+' : state.hits.length}`
            : state.hits.length === 50
              ? '50+'
              : state.hits.length}{' '}
          result
          {(hasRefine ? displayHits.length : state.hits.length) === 1 ? '' : 's'} for “{q}”
          {sort === 'date' ? ' · by date' : ''}
        </p>
      )}

      {showEmptyTeach && !q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Search everything, from anywhere"
          description="Orders, serial units, receiving cartons, SKUs, repairs and FBA shipments — one query."
          className={cn(
            'mx-3 mt-2 border border-dashed border-border-soft bg-surface-canvas py-10',
            cornerClass('flush'),
          )}
        />
      )}

      {state.status === 'error' && (
        <EmptyState
          tone="danger"
          title="Search failed"
          description="Try again in a moment."
          className={cn(
            'mx-3 mt-2 border border-dashed border-border-danger bg-surface-danger py-8',
            cornerClass('flush'),
          )}
        />
      )}
      {/* Absolute zero hits: header dropdown owns feedback — no page EmptyState. */}
      {state.status === 'done' && state.hits.length > 0 && displayHits.length === 0 && q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="No results match these filters"
          description="Clear a refine chip or pick a broader type / status."
          className={cn(
            'mx-3 border border-dashed border-border-soft bg-surface-canvas',
            cornerClass('flush'),
            isCompact ? 'py-6' : 'py-8',
          )}
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {showResults ? (
          <motion.div
            key={`results:${state.forKey}`}
            {...presence}
            transition={transition}
            className="pb-4"
          >
            <MonitorListBlock chrome={listChrome}>
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
