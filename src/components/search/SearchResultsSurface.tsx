'use client';

/**
 * SearchResultsSurface — the shared results body for the `/search` route.
 * Controlled: the host owns the query (URL state); the surface owns retrieval
 * + flat RRF-ranked result rendering (Monitor feed — no entity grouping cards).
 * Phase 2: client refine (`etype`/`hstat`) + display sort over the top-50.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from '@/components/Icons';
import { SearchRefineControls } from '@/components/search/SearchRefineControls';
import { SearchResultRow } from '@/components/search/SearchResultRow';
import { SearchResultRowSkeleton } from '@/components/search/SearchResultRowSkeleton';
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
  /**
   * Row click. Receives the event so a host can intercept the `<Link>`.
   * When absent, rows navigate to their deep-link normally.
   */
  onSelectHit?: (hit: AiSearchHit, event: ReactMouseEvent) => void;
  /** Fires when the in-flight state changes. */
  onLoadingChange?: (loading: boolean) => void;
  /**
   * Fires with the UNFILTERED result set each time a query settles, so a host
   * can react (sole ORDER → record). Refine must not change sole-hit open.
   */
  onResults?: (hits: AiSearchHit[]) => void;
  /** Highlighted order id — the rep workbench rail's current selection. */
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

const SKELETON_COUNT = 10;

export function SearchResultsSurface({
  query,
  etype = null,
  hstat = null,
  sort = 'relevance',
  onSelectHit,
  onLoadingChange,
  onResults,
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
  const pageContext = '/search';
  const presence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const transition = useMotionTransition(framerTransition.workbenchPaneSettle);

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

  const hasRefine = Boolean(etype || hstat);
  const showResults = state.status === 'done' && displayHits.length > 0;
  const showLoading = state.status === 'loading';
  const showRefineChrome = Boolean(q) && (state.status === 'done' || state.status === 'loading');

  return (
    <div className={cn('space-y-4', className)}>
      {showRefineChrome ? (
        <SearchRefineControls statusOptions={statusOptions} />
      ) : null}

      {state.status === 'done' && (
        <p className="text-role-caption font-medium text-text-soft">
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

      {!q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Search everything, from anywhere"
          description="Orders, serial units, receiving cartons, SKUs, repairs and FBA shipments — one query."
          className="rounded-xl border border-dashed border-border-soft bg-surface-canvas py-10"
        />
      )}

      {state.status === 'forbidden' && (
        <EmptyState
          title="AI search not available"
          description='Your role doesn’t include AI search yet — ask an admin to grant the “AI search retrieval” permission.'
          className="rounded-xl border border-dashed border-rose-200 bg-rose-50 py-8 [&_h3]:text-rose-800 [&_p]:text-rose-700"
        />
      )}
      {state.status === 'error' && (
        <EmptyState
          title="Search failed"
          description="Try again in a moment."
          className="rounded-xl border border-dashed border-rose-200 bg-rose-50 py-8 [&_h3]:text-rose-800 [&_p]:text-rose-700"
        />
      )}
      {state.status === 'done' && state.hits.length === 0 && q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title={`No matches for “${q}”`}
          description="Try fewer words, a partial serial, or the last 8 digits of a tracking number."
          className="rounded-xl border border-dashed border-border-soft bg-surface-canvas py-8"
        />
      )}
      {state.status === 'done' && state.hits.length > 0 && displayHits.length === 0 && q && (
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="No results match these filters"
          description="Clear a refine chip or pick a broader type / status."
          className="rounded-xl border border-dashed border-border-soft bg-surface-canvas py-8"
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {showLoading ? (
          <motion.div
            key={`loading:${state.forKey}`}
            {...presence}
            transition={transition}
          >
            <MonitorListBlock>
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
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
            className="pb-8"
          >
            <MonitorListBlock>
              {displayHits.map((hit) => (
                <li key={`${hit.entityType}:${hit.id}`}>
                  <SearchResultRow
                    hit={hit}
                    density="comfortable"
                    onNavigate={onSelectHit}
                    active={hit.entityType === 'order' && activeHitId != null && hit.id === activeHitId}
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
