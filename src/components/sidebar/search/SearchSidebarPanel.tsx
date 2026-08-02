'use client';

/**
 * SearchSidebarPanel — context-rail map for `/search` Workbench master–detail.
 *
 * SidebarShell + SearchBar (`?q=`, in-field refine) + comfortable hit list.
 * Selection writes `?sel=type:id`; the main pane embeds the entity detail.
 * Empty query shows staff recents (page auto-reruns the latest on land).
 *
 * This rail owns the entry-path search field on `/search` — the global header
 * launcher is hidden on that route (GlobalHeaderActions).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SearchBar } from '@/components/ui/SearchBar';
import { SearchRefineControls } from '@/components/search/SearchRefineControls';
import { SearchRecentsDropdown } from '@/components/search/SearchRecentsDropdown';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import { GLOBAL_SEARCH_FOCUS_EVENT } from '@/lib/global-search-focus';
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
  parseSearchSel,
  soleHitSel,
} from '@/lib/search/search-selection';
import { isUiEntityType } from '@/lib/search/search-hit';

export function SearchSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const q = (searchParams.get('q') ?? '').trim();
  const sel = useMemo(
    () => parseSearchSel(searchParams.get(SEARCH_SEL_PARAM)),
    [searchParams],
  );
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

  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  // Re-click Search while already on `/search` — the header launcher is
  // unmounted here, so this panel owns the focus event. (⌘K opens the palette.)
  useEffect(() => {
    const focusInput = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener(GLOBAL_SEARCH_FOCUS_EVENT, focusInput);
    return () => window.removeEventListener(GLOBAL_SEARCH_FOCUS_EVENT, focusInput);
  }, []);

  const [statusOptions, setStatusOptions] = useState<string[]>([]);

  const {
    recents,
    remove: removeRecent,
    clear: clearRecents,
  } = useStaffSearchRecents({ scope: SEARCH_RECENTS_SCOPE });

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    },
    [router, searchParams],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      const trimmed = value.trim();
      replaceParams((params) => {
        if (trimmed) params.set('q', trimmed);
        else params.delete('q');
        // New query clears a stale selection until sole-hit / click re-sets it.
        params.delete(SEARCH_SEL_PARAM);
      });
    },
    [replaceParams],
  );

  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      event.preventDefault();
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
      if (!nextSel) return;
      // Auto-select sole hit. Multi-hit lists keep an existing sel when still present.
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

  const hasQuery = q.length > 0;

  return (
    <SidebarShell
      className={appChromeClass}
      headerAbove={
        <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
          <SearchBar
            size="compact"
            variant="blue"
            value={searchInput}
            onChange={handleSearchChange}
            onClear={() => handleSearchChange('')}
            placeholder="Order, serial, tracking…"
            autoFocus
            inputRef={inputRef}
            trailingPrefix={
              hasQuery ? <SearchRefineControls statusOptions={statusOptions} /> : undefined
            }
          />
        </div>
      }
      bodyClassName="flex flex-col overflow-hidden p-0"
    >
      {hasQuery ? (
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
          activeSel={sel}
          onSelectHit={handleSelectHit}
          onResults={handleResults}
          onStatusOptions={setStatusOptions}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
          <SearchRecentsDropdown
            recents={recents}
            onSelect={(entry) => router.push(searchRerunHref(entry.query))}
            onRemove={removeRecent}
            onClearAll={() => void clearRecents()}
          />
        </div>
      )}
    </SidebarShell>
  );
}
