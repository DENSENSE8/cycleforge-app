'use client';

/**
 * SearchBrowseShell — `/search` body when no `?sel=` is active.
 *
 * Find lives only in {@link GlobalHeaderSearch}. This shell never mounts a
 * locked-width stage field. While an identifier resolves or retrieve runs it
 * publishes pending via {@link setGlobalSearchPending} so the header paints
 * {@link SearchPendingBar} — the body never invents “Opening…” / gray overlay
 * holds.
 *
 * ## The results plane is a CARD on a DESK, and FLUSH in a HAND
 *
 * It used to bleed to both edges of the canvas, which made the results look
 * like the page itself rather than like a thing sitting on it. On a desk it is
 * now a floating stage: centered at the desk measure, rounded on all four
 * corners, raised off a `surface-canvas` ground.
 *
 * On a phone that same card is three costs and no benefit — the 1152 cap never
 * binds, the 16px gutters come out of the only column anyone reads, and a
 * raised shadow has no plane behind it to fall on. So the compact measure is
 * FLUSH, and the whole decision (ground · measure · gutter · corner · depth)
 * arrives as ONE record from {@link FIND_STAGE_BY_DENSITY} in
 * `@/design-system/tokens/desk-stage`. This file spreads it and picks nothing:
 * a `px-4` chosen here is how the phone got a desk gutter in the first place.
 *
 * The refine toolbar lives INSIDE the plane at either measure, because it acts
 * on the rows in it — a band above the card would be chrome for an object it
 * is not attached to.
 *
 * ## Auto-open is ARMED, not unconditional
 *
 * Two paths open a record without being asked: an identifier query that
 * resolves (`?q=` is a tracking number) and a sole hit. Both are right on
 * ARRIVAL and both were wrong on RETURN — pressing "Results" in the dossier
 * cleared `?sel=`, this shell remounted, the warm resolve cache answered
 * instantly and it set `?sel=` straight back. The button looked dead because
 * the plane it opened was closed again in the same frame.
 *
 * So `autoOpen` is the caller's (`SearchFindSurface`) statement of intent: it
 * is false for exactly the query the operator just chose to browse, and arms
 * again the moment the query changes. Never gate this on a ref or a
 * "hasOpenedOnce" flag — a remount resets those, which is the same bug with
 * more state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  SEARCH_CHAN_PARAM,
  SEARCH_HSTAT_PARAM,
  SEARCH_SORT_PARAM,
  parseSearchDisplaySort,
  parseSearchEtype,
  parseSearchChan,
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
import { cn } from '@/utils/_cn';
import { useFindDensity } from '@/components/search/find-density-context';
import { FIND_STAGE_BY_DENSITY } from '@/design-system/tokens/desk-stage';

export function SearchBrowseShell({
  setSel,
  autoOpen = true,
}: {
  /** Paint-pending sel from the page hook — browse→detail in the click commit. */
  setSel: (next: SearchSelection | null) => void;
  /**
   * May this shell open a record on its own (resolved identifier / sole hit)?
   * False for the one query the operator explicitly returned to browse — see
   * the file header.
   */
  autoOpen?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const density = useFindDensity();
  const stage = FIND_STAGE_BY_DENSITY[density];
  const q = (searchParams.get('q') ?? '').trim();
  const etype = useMemo(
    () => parseSearchEtype(searchParams.get(SEARCH_ETYPE_PARAM)),
    [searchParams],
  );
  const hstat = useMemo(
    () => parseSearchHstat(searchParams.get(SEARCH_HSTAT_PARAM)),
    [searchParams],
  );
  const chan = useMemo(
    () => parseSearchChan(searchParams.get(SEARCH_CHAN_PARAM)),
    [searchParams],
  );
  const sort = useMemo(
    () => parseSearchDisplaySort(searchParams.get(SEARCH_SORT_PARAM)),
    [searchParams],
  );

  /**
   * UNFILTERED settled hits — the toolbar's only input. It derives its own
   * scope counts AND its status / channel facet lists from this, so the shell
   * no longer mirrors those two option arrays into state.
   */
  const [browseHits, setBrowseHits] = useState<AiSearchHit[]>([]);
  const [needRetrieve, setNeedRetrieve] = useState(false);
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [retrieveSettled, setRetrieveSettled] = useState(false);
  /** Deep-link `/search?q=` with zero hits — hand feedback to header dropdown. */
  const [zeroHits, setZeroHits] = useState(false);

  /**
   * Opening a resolved identifier. Held in a REF, and the arrival effect below
   * calls it through the ref rather than depending on it.
   *
   * `setSel` comes from `useSearchSelParam`, whose writer closes over
   * `searchParams` — so this callback gets a new identity on EVERY url write,
   * including a client-side refine. As a dependency of the arrival effect that
   * meant picking a scope re-ran arrival, which calls `setRetrieveSettled(false)`,
   * which unmounts `showRefineChrome`: the refine control vanished the moment
   * it was used, at both measures. On a phone that is a dead end, because the
   * collapsed trigger is the only way back to `All`.
   *
   * A refine starts no retrieval, so it must not re-arm arrival. The effect is
   * keyed to arrival FACTS only — the query, and how it resolved.
   */
  const selectOrderId = useCallback(
    (orderId: number) => {
      setSel({ entityType: 'order', id: orderId });
    },
    [setSel],
  );
  const selectOrderIdRef = useRef(selectOrderId);
  useEffect(() => {
    selectOrderIdRef.current = selectOrderId;
  }, [selectOrderId]);

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
   * it is what lets `SearchOrderDossier` (keyed by `sel=order:{pk}`, a
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
      // A resolved identifier opens its record — unless the operator just came
      // BACK from that record. Without this gate the warm cache re-opened it
      // in the same frame and the dossier's "Results" button read as dead.
      if (resolved?.status === 'ok' && autoOpen) {
        setNeedRetrieve(false);
        setZeroHits(false);
        selectOrderIdRef.current(resolved.order.id);
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
  }, [q, isIdentifier, idResolving, resolved, autoOpen]);

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
      // The toolbar's scope counts read the UNFILTERED set, so record it before
      // any of the sole-hit / zero-hit branches below take their early exit.
      setBrowseHits(hits);
      if (hits.length === 0) {
        // Absolute miss — header dropdown owns red feedback.
        setZeroHits(true);
        setRetrieveSettled(true);
        dispatchGlobalSearchFocus();
        return;
      }
      setZeroHits(false);
      // One row is not a choice, so a sole hit opens itself — except on a
      // deliberate return, where it would slam the door the operator opened.
      const nextSel = autoOpen ? soleHitSel(hits) : null;
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
    [q, searchParams, setSel, autoOpen],
  );

  // The row is a table row, not a link, so there is no default navigation to
  // cancel — activation IS the handoff, and the shell just records the `?sel=`.
  const handleSelectHit = useCallback(
    (hit: AiSearchHit) => {
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
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden',
        // The GROUND. On a desk, a step below card white so the plane's shadow
        // has something to fall on; on a phone, card white, because there is
        // no gap to see it through.
        stage.ground,
      )}
      data-find-density={density}
    >
      {mountRetrieve ? (
        <div
          className={cn(
            'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden',
            stage.measure,
            stage.gutter,
          )}
        >
          {/* The PLANE. One object: the refine toolbar is inside it because it
              acts on the rows inside it, and `overflow-hidden` is what clips
              the toolbar's band and the rows to the shoulders instead of
              letting either square off a corner. Corner and depth are the
              stage's, so the phone measure flattens both without this file
              knowing what a shadow is. */}
          <div
            className={cn(
              'flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card',
              stage.corner,
              stage.elevation,
            )}
            data-testid="search-results-card"
          >
            {showRefineChrome ? <SearchRefineControls hits={browseHits} /> : null}
            <SearchResultsSurface
              className="min-h-0 flex-1 overflow-y-auto"
              scope="global"
              query={q}
              etype={etype}
              hstat={hstat}
              chan={chan}
              sort={sort}
              showEmptyTeach={false}
              onSelectHit={handleSelectHit}
              onResults={handleResults}
              onLoadingChange={handleLoadingChange}
              onSettle={handleRetrieveSettle}
            />
          </div>
        </div>
      ) : (
        // Identifier resolve in flight — header SearchPendingBar only; no body hold.
        <div className="min-h-0 flex-1" aria-busy={idResolving || undefined} />
      )}
    </div>
  );
}
