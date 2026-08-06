'use client';

/**
 * SearchBrowseShell — `/search` body when no `?sel=` is active.
 *
 * Find lives only in {@link GlobalHeaderSearch}. This shell never mounts a
 * locked-width stage field. While an identifier resolves or retrieve runs it
 * publishes pending via {@link setGlobalSearchPending} so the header paints
 * {@link SearchPendingBar}. Sole hits set `?sel=`; multi-hit browse is
 * full-bleed under the header.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SearchRefineControls } from '@/components/search/SearchRefineControls';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { resolveSearchOrder } from '@/lib/search/resolve-search-order';
import { setSearchOrderResolveCache } from '@/lib/search/search-order-resolve-query';
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
  formatSearchSel,
  soleHitSel,
} from '@/lib/search/search-selection';
import { isUiEntityType, looksLikeIdentifier } from '@/lib/search/search-hit';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { dispatchGlobalSearchFocus } from '@/lib/global-search-focus';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { cn } from '@/utils/_cn';

export function SearchBrowseShell() {
  useSurfacePaintMark('search:chrome', true);
  useSurfacePaintMark('search:primary', true);
  const router = useRouter();
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

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    },
    [router, searchParams],
  );

  const selectOrderId = useCallback(
    (orderId: number, queryText: string) => {
      replaceParams((params) => {
        if (queryText.trim()) params.set('q', queryText.trim());
        params.set(SEARCH_SEL_PARAM, formatSearchSel('order', orderId));
      });
    },
    [replaceParams],
  );

  // Empty land → arm header find (no page-local field).
  useEffect(() => {
    if (q.length >= 2) return;
    dispatchGlobalSearchFocus();
  }, [q]);

  // Quiet resolve / retrieve when URL has a query — header pulse only; no gray
  // searching chrome while an identifier is in flight.
  useEffect(() => {
    if (!q || q.length < 2) {
      setIdPending(false);
      setNeedRetrieve(false);
      setRetrieveLoading(false);
      setRetrieveSettled(false);
      return;
    }

    if (looksLikeIdentifier(q)) {
      let cancelled = false;
      setIdPending(true);
      setNeedRetrieve(false);
      setRetrieveSettled(false);
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
  }, [q, selectOrderId, queryClient]);

  const showPending = idPending || (needRetrieve && retrieveLoading);
  const mountRetrieve = needRetrieve && !idPending;
  const showResultsShell = mountRetrieve && retrieveSettled && !retrieveLoading;

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
      replaceParams((params) => {
        params.set(SEARCH_SEL_PARAM, formatSearchSel(entityType, id));
      });
    },
    [replaceParams],
  );

  const handleResults = useCallback(
    (hits: AiSearchHit[]) => {
      if (!q) return;
      const nextSel = soleHitSel(hits);
      if (nextSel) {
        const current = searchParams.get(SEARCH_SEL_PARAM);
        if (current === nextSel) return;
        const stillInList =
          current &&
          hits.some((h) => {
            const { entityType, id } = h;
            if (!isUiEntityType(entityType)) return false;
            return formatSearchSel(entityType, id) === current;
          });
        if (stillInList && hits.length > 1) {
          setRetrieveSettled(true);
          return;
        }
        replaceParams((params) => {
          params.set(SEARCH_SEL_PARAM, nextSel);
        });
        return;
      }
      setRetrieveSettled(true);
    },
    [q, replaceParams, searchParams],
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
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-canvas">
      {idPending ? (
        // Identifier resolve in flight — empty hold; header owns the pulse.
        <div className="flex-1" aria-busy />
      ) : mountRetrieve ? (
        <div
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col',
            showResultsShell ? 'overflow-hidden' : 'sr-only',
          )}
          aria-hidden={!showResultsShell}
        >
          {showResultsShell && hasQuery ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-hairline bg-surface-card px-3 py-1.5">
              <SearchRefineControls statusOptions={statusOptions} />
            </div>
          ) : null}
          <SearchResultsSurface
            className={showResultsShell ? 'min-h-0 flex-1 overflow-y-auto' : undefined}
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
      ) : !hasQuery ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
          <p className="text-center text-role-caption font-semibold text-text-muted">
            Search everything
          </p>
          <p className="mt-2 max-w-sm text-center text-role-micro text-text-faint">
            Use the header find field — order #, PO, tracking, serial, SKU, or customer.
          </p>
        </div>
      ) : null}
    </div>
  );
}
