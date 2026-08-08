'use client';

/**
 * SearchBrowseShell — `/search` body when no `?sel=` is active.
 *
 * Find lives only in {@link GlobalHeaderSearch}. This shell never mounts a
 * locked-width stage field. While an identifier resolves or retrieve runs it
 * publishes pending via {@link setGlobalSearchPending} so the header paints
 * {@link SearchPendingBar} — the body never invents “Opening…” / gray overlay
 * holds. Sole hits set `?sel=`; multi-hit browse is full-bleed under the header.
 *
 * No idle teach / empty placeholder (Amazon-like): with no `?q=` the body is
 * blank and the auto-focused header find field is the only search surface.
 * A typed query keeps prior results or mounts the results surface as soon as
 * retrieve is armed; warm resolve cache opens `?sel=` synchronously.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SearchRefineControls } from '@/components/search/SearchRefineControls';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import {
  resolveSearchOrder,
  type ResolvedSearchOrder,
} from '@/lib/search/resolve-search-order';
import {
  searchOrderResolveQueryKey,
  setSearchOrderResolveCache,
} from '@/lib/search/search-order-resolve-query';
import {
  SEARCH_ETYPE_PARAM,
  SEARCH_HSTAT_PARAM,
  SEARCH_SORT_PARAM,
  parseSearchDisplaySort,
  parseSearchEtype,
  parseSearchHstat,
} from '@/lib/search/search-refine';
import {
  SEARCH_SEL_PARAM,
  parseSearchSel,
  soleHitSel,
  type SearchSelection,
} from '@/lib/search/search-selection';
import { isUiEntityType, looksLikeIdentifier } from '@/lib/search/search-hit';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { dispatchGlobalSearchFocus } from '@/lib/global-search-focus';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';

export function SearchBrowseShell({
  setSel,
}: {
  /** Paint-pending sel from the page hook — browse→detail in the click commit. */
  setSel: (next: SearchSelection | null) => void;
}) {
  useSurfacePaintMark('search:chrome', true);
  useSurfacePaintMark('search:primary', true);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const q = (searchParams.get('q') ?? '').trim();
  const etype = useMemo(
    () => parseSearchEtype(searchParams.get(SEARCH_ETYPE_PARAM)),
    [searchParams],
  );
  const hstat = useMemo(
    () => parseSearchHstat(searchParams.get(SEARCH_HSTAT_PARAM)),
    [searchParams],
  );
  const sort = useMemo(
    () => parseSearchDisplaySort(searchParams.get(SEARCH_SORT_PARAM)),
    [searchParams],
  );

  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [idPending, setIdPending] = useState(false);
  const [needRetrieve, setNeedRetrieve] = useState(false);
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [retrieveSettled, setRetrieveSettled] = useState(false);
  /** Deep-link `/search?q=` with zero hits — hand feedback to header dropdown. */
  const [zeroHits, setZeroHits] = useState(false);

  const selectOrderId = useCallback(
    (orderId: number, _queryText: string) => {
      setSel({ entityType: 'order', id: orderId });
    },
    [setSel],
  );

  // Empty land → arm header find (no page-local field).
  useEffect(() => {
    if (q.length >= 2) return;
    dispatchGlobalSearchFocus();
  }, [q]);

  // Quiet resolve / retrieve when URL has a query — header pulse only.
  useEffect(() => {
    if (!q || q.length < 2) {
      setIdPending(false);
      setNeedRetrieve(false);
      setRetrieveLoading(false);
      setRetrieveSettled(false);
      setZeroHits(false);
      return;
    }

    if (looksLikeIdentifier(q)) {
      // Warm cache (header already resolved) → skip pending paint; open sel now.
      const cached = queryClient.getQueryData<ResolvedSearchOrder>(
        searchOrderResolveQueryKey(q),
      );
      if (cached?.status === 'ok') {
        setIdPending(false);
        setNeedRetrieve(false);
        setZeroHits(false);
        selectOrderId(cached.order.id, q);
        return;
      }

      let cancelled = false;
      setIdPending(true);
      setNeedRetrieve(false);
      setRetrieveSettled(false);
      setZeroHits(false);
      void resolveSearchOrder(q).then((resolved) => {
        if (cancelled) return;
        setSearchOrderResolveCache(queryClient, q, resolved);
        setIdPending(false);
        if (resolved.status === 'ok') {
          selectOrderId(resolved.order.id, q);
          return;
        }
        setNeedRetrieve(true);
      });
      return () => {
        cancelled = true;
      };
    }

    setIdPending(false);
    setNeedRetrieve(true);
    setRetrieveSettled(false);
    setZeroHits(false);
  }, [q, selectOrderId, queryClient]);

  const showPending = idPending || (needRetrieve && retrieveLoading);
  const mountRetrieve = needRetrieve && !idPending;
  const showRefineChrome =
    mountRetrieve && retrieveSettled && !retrieveLoading && !zeroHits;

  useEffect(() => {
    setGlobalSearchPending(showPending);
    return () => {
      clearGlobalSearchPending();
    };
  }, [showPending]);

  const selectHit = useCallback(
    (hit: AiSearchHit) => {
      const { entityType, id } = hit;
      if (!isUiEntityType(entityType)) return;
      setSel({ entityType, id });
    },
    [setSel],
  );

  const handleResults = useCallback(
    (hits: AiSearchHit[]) => {
      if (!q) return;
      if (hits.length === 0) {
        // Absolute miss — header dropdown owns red feedback.
        setZeroHits(true);
        setRetrieveSettled(true);
        dispatchGlobalSearchFocus();
        return;
      }
      setZeroHits(false);
      const nextSel = soleHitSel(hits);
      if (nextSel) {
        const parsed = parseSearchSel(nextSel);
        if (!parsed) return;
        const current = parseSearchSel(searchParams.get(SEARCH_SEL_PARAM));
        if (
          current &&
          current.entityType === parsed.entityType &&
          current.id === parsed.id
        ) {
          return;
        }
        const stillInList =
          current &&
          hits.some((h) => {
            const { entityType, id } = h;
            if (!isUiEntityType(entityType)) return false;
            return (
              current.entityType === entityType && current.id === id
            );
          });
        if (stillInList && hits.length > 1) {
          setRetrieveSettled(true);
          return;
        }
        setSel(parsed);
        return;
      }
      setRetrieveSettled(true);
    },
    [q, searchParams, setSel],
  );

  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      event.preventDefault();
      selectHit(hit);
    },
    [selectHit],
  );

  const handleLoadingChange = useCallback((loading: boolean) => {
    setRetrieveLoading(loading);
    if (loading) setRetrieveSettled(false);
  }, []);

  const handleRetrieveSettle = useCallback(() => {
    setRetrieveSettled(true);
  }, []);

  const hasQuery = q.length > 0;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card">
      {!hasQuery ? (
        // Amazon-like: no idle teach / empty placeholder. The header find field
        // (auto-focused) is the search surface; the body stays blank until a
        // query resolves. Loading lives only in the header SearchPendingBar.
        <div className="min-h-0 flex-1" />
      ) : mountRetrieve ? (
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {showRefineChrome ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-hairline bg-surface-card px-3 py-1.5">
              <SearchRefineControls statusOptions={statusOptions} />
            </div>
          ) : null}
          <SearchResultsSurface
            className="min-h-0 flex-1 overflow-y-auto"
            scope="global"
            query={q}
            etype={etype}
            hstat={hstat}
            sort={sort}
            density="comfortable"
            showJourneyAction={false}
            showEmptyTeach={false}
            onSelectHit={handleSelectHit}
            onResults={handleResults}
            onLoadingChange={handleLoadingChange}
            onSettle={handleRetrieveSettle}
            onStatusOptions={setStatusOptions}
          />
        </div>
      ) : (
        // Identifier resolve in flight — header SearchPendingBar only; no body hold.
        <div className="min-h-0 flex-1" aria-busy={idPending || undefined} />
      )}
    </div>
  );
}
