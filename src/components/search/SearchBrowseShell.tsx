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
 * No idle teach: with no `?q=` the recent rail auto-selects the latest find.
 * the results surface as soon as retrieve is armed; warm resolve cache opens
 * `?sel=` synchronously.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchRefineControls } from '@/components/search/SearchRefineControls';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import {
  searchOrderResolveQuery,
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
import { desktopSearchHref } from '@/lib/search/internal-id';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { dispatchGlobalSearchFocus } from '@/lib/global-search-focus';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';

export function SearchBrowseShell({
  setSel,
}: {
  /** Paint-pending sel from the page hook — browse→detail in the click commit. */
  setSel: (next: SearchSelection | null) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
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

  // The `?q=` body is deliberately hold-free — the header `SearchPendingBar`
  // owns loading here — so release the shell's cover as soon as this mounts.
  // The paint marks themselves live on the shell, anchored to the moment the
  // cover lifts; stamping `search:primary` from here reported a fast LCP for a
  // blank plane.
  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    primaryPaint?.onPrimaryPainted();
  }, [primaryPaint]);

  // Empty query is the recents landing — do not steal focus into the header
  // picker or it covers the history the operator just opened.
  useEffect(() => {
    if (q.length === 0) return;
    if (q.length >= 2) return;
    dispatchGlobalSearchFocus();
  }, [q]);

  /**
   * Identifier resolve goes through the SHARED query waist
   * (`searchOrderResolveQuery`), not a hand-rolled `getQueryData` +
   * `resolveSearchOrder` + `cancelled` flag. The warm-cache read, the
   * de-duplication of two surfaces asking for the same token, and the 45s
   * `staleTime` are all the factory's — this file was re-deriving each of them
   * one branch at a time.
   */
  const isIdentifier = q.length >= 2 && looksLikeIdentifier(q);
  const resolveQuery = useQuery({
    ...searchOrderResolveQuery(q),
    enabled: isIdentifier,
  });
  const resolved = isIdentifier ? resolveQuery.data : undefined;
  // `isLoading`, not `isPending`: a disabled query is permanently "pending" in
  // v5, which would pin the header pulse on for every non-identifier query.
  const idResolving = isIdentifier && resolveQuery.isLoading;

  /**
   * Alias-seed the numeric pk key once a token resolves. This is NOT part of
   * the waist — it is the same cross-key write `GlobalFindCombobox` does, and
   * it is what lets `SearchOrderStationPane` (keyed by `sel=order:{pk}`, a
   * different token than the operator typed) paint from memory instead of
   * re-fetching the order it was just handed.
   */
  useEffect(() => {
    if (!isIdentifier || !resolved) return;
    setSearchOrderResolveCache(queryClient, q, resolved);
  }, [isIdentifier, resolved, q, queryClient]);

  // Quiet resolve / retrieve when URL has a query — header pulse only.
  useEffect(() => {
    if (!q || q.length < 2) {
      setNeedRetrieve(false);
      setRetrieveLoading(false);
      setRetrieveSettled(false);
      setZeroHits(false);
      return;
    }

    if (isIdentifier) {
      if (idResolving) {
        setNeedRetrieve(false);
        setRetrieveSettled(false);
        setZeroHits(false);
        return;
      }
      if (resolved?.status === 'ok') {
        setNeedRetrieve(false);
        setZeroHits(false);
        selectOrderId(resolved.order.id, q);
        return;
      }
      // Resolved to nothing (or errored) — fall through to retrieve.
      setNeedRetrieve(true);
      setRetrieveSettled(false);
      setZeroHits(false);
      return;
    }

    setNeedRetrieve(true);
    setRetrieveSettled(false);
    setZeroHits(false);
  }, [q, isIdentifier, idResolving, resolved, selectOrderId]);

  const showPending = idResolving || (needRetrieve && retrieveLoading);
  const mountRetrieve = needRetrieve && !idResolving;
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
      if (isUiEntityType(entityType)) {
        setSel({ entityType, id });
        return;
      }
      if (hit.href) router.push(desktopSearchHref(hit.href));
    },
    [setSel, router],
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

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card">
      {mountRetrieve ? (
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
        <div className="min-h-0 flex-1" aria-busy={idResolving || undefined} />
      )}
    </div>
  );
}
