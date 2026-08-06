'use client';

/**
 * SearchFindStage — centered fixed-width find surface for `/search` when no
 * `?sel=` is active. This *is* global header search (`GlobalFindCombobox`
 * presentation="stage"): recents + preview dropdown under the bar; multi-hit
 * browse via `SearchResultsSurface` under the same locked-width column. Sole
 * hits auto-set `?sel=` and the page swaps to full-bleed detail.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GlobalFindCombobox } from '@/components/search/GlobalFindCombobox';
import { SearchRefineControls } from '@/components/search/SearchRefineControls';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import { SearchStageBackground } from '@/components/search/SearchStageBackground';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { SEARCH_RECENTS_SCOPE, searchRerunHref } from '@/lib/search/search-page-recents';
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
import { isUiEntityType } from '@/lib/search/search-hit';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

export function SearchFindStage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const [query, setQuery] = useState(q);
  const [browseOpen, setBrowseOpen] = useState(Boolean(q));
  const [statusOptions, setStatusOptions] = useState<string[]>([]);

  useEffect(() => {
    setQuery(q);
    if (q) setBrowseOpen(true);
  }, [q]);

  const {
    recents,
    push: pushRecent,
    remove: removeRecent,
    clear: clearRecents,
  } = useStaffSearchRecents({ scope: SEARCH_RECENTS_SCOPE, limit: 8 });

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    },
    [router, searchParams],
  );

  const writeQuery = useCallback(
    (value: string) => {
      setQuery(value);
      const trimmed = value.trim();
      replaceParams((params) => {
        if (trimmed) params.set('q', trimmed);
        else {
          params.delete('q');
          params.delete(SEARCH_ETYPE_PARAM);
          params.delete(SEARCH_HSTAT_PARAM);
          params.delete(SEARCH_SORT_PARAM);
        }
        params.delete(SEARCH_SEL_PARAM);
      });
      if (!trimmed) setBrowseOpen(false);
    },
    [replaceParams],
  );

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

  const selectOrderId = useCallback(
    (orderId: number, queryText: string) => {
      replaceParams((params) => {
        if (queryText.trim()) params.set('q', queryText.trim());
        params.set(SEARCH_SEL_PARAM, formatSearchSel('order', orderId));
      });
    },
    [replaceParams],
  );

  const browseQuery = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      setBrowseOpen(true);
      replaceParams((params) => {
        params.set('q', trimmed);
        params.delete(SEARCH_SEL_PARAM);
      });
      void pushRecent({
        query: trimmed,
        scope: SEARCH_RECENTS_SCOPE,
        scopeLabel: 'Search',
        scopeHref: searchRerunHref(trimmed),
      });
    },
    [replaceParams, pushRecent],
  );

  const handleResults = useCallback(
    (hits: AiSearchHit[]) => {
      if (!q) return;
      const nextSel = soleHitSel(hits);
      if (!nextSel) return;
      const current = searchParams.get(SEARCH_SEL_PARAM);
      if (current === nextSel) return;
      const stillInList =
        current &&
        hits.some((h) => {
          const { entityType, id } = h;
          if (!isUiEntityType(entityType)) return false;
          return formatSearchSel(entityType, id) === current;
        });
      if (stillInList && hits.length > 1) return;
      replaceParams((params) => {
        params.set(SEARCH_SEL_PARAM, nextSel);
      });
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

  const hasQuery = q.length > 0;
  const showBrowse = browseOpen && hasQuery;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <SearchStageBackground />
      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center px-4 pt-20 pb-10">
        <div
          className={cn(
            'flex w-full max-w-[560px] flex-col items-center',
            showBrowse ? 'min-h-0 flex-1' : '',
          )}
        >
          <p className="mb-4 text-center text-role-caption font-semibold text-text-muted">
            Search everything
          </p>
          <GlobalFindCombobox
            presentation="stage"
            ownsFocusEvent
            autoFocus
            query={query}
            onQueryChange={writeQuery}
            recents={recents}
            enableRecents
            onRemoveRecent={(id) => void removeRecent(id)}
            onClearRecents={() => void clearRecents()}
            onPushRecent={(entry) =>
              void pushRecent({
                query: entry.query,
                scope: SEARCH_RECENTS_SCOPE,
                scopeLabel: 'Search',
                scopeHref: entry.scopeHref,
                topHit: entry.topHit,
              })
            }
            onSelectHit={selectHit}
            onBrowseQuery={browseQuery}
            onSelectOrderId={selectOrderId}
            suppressPreview={showBrowse}
            showOpenWorkbench={false}
            listboxId="search-stage-listbox"
            trailingSuffix={
              hasQuery ? <SearchRefineControls statusOptions={statusOptions} /> : undefined
            }
          />

          {/*
            The browse list is the FIELD'S OWN EXTENSION, not a second surface.

            It used to sit 16px below on `cornerClass('field')` with
            `bg-surface-card/80 backdrop-blur-md` — a rounded glass bubble under
            a square opaque block, at a different width. That is the exact shape
            `GlobalSearchDropdown` was migrated off (its guard bans
            `backdrop-blur` / `cornerClass(` / `rounded-xl` and pins `gap={0}` +
            `border-t-0` + `matchWidth`); the stage was simply never brought
            along. Same job, same recipe: zero gap, square, opaque, and the
            field's own bottom border is the seam.
          */}
          {showBrowse ? (
            <div
              className={cn(
                'flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none',
                'border border-t-0 border-border-soft bg-surface-card',
                elevationClass('raised'),
              )}
            >
              <SearchResultsSurface
                className="min-h-0 flex-1 overflow-y-auto"
                scope="global"
                query={q}
                etype={etype}
                hstat={hstat}
                sort={sort}
                density="dropdown"
                showJourneyAction={false}
                showEmptyTeach={false}
                onSelectHit={handleSelectHit}
                onResults={handleResults}
                onStatusOptions={setStatusOptions}
              />
            </div>
          ) : (
            <p className="mt-6 max-w-sm text-center text-role-micro text-text-faint">
              Order #, PO, tracking, serial, SKU, or customer. An exact sole match opens
              automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
