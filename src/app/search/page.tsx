'use client';

/**
 * `/search` — cross-entity search Workbench (master–detail).
 *
 * Contract:
 *   • `?q=` is the query (global header + rail SearchBar both sync via URL).
 *   • `?sel=type:id` is durable selection — main pane embeds that entity shell.
 *   • Client refine: `?etype=` / `?hstat=` / `?colsort=` over the retrieved top-50.
 *   • Hit list lives in the context rail (`SearchSidebarPanel`); this page is
 *     the detail workspace only.
 *   • A SOLE / exact identifier hit sets `?sel=` in-page (does not navigate away).
 *     Canonical `searchHitHref` remains for hit-row / notification deep links.
 *   • Empty land auto-reruns this staff member's most recent query.
 *
 * Region contract: Workbench master–detail
 * (`.claude/rules/display/workbench.md`).
 */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import { SEARCH_RECENTS_SCOPE, searchRerunHref } from '@/lib/search/search-page-recents';
import {
  SEARCH_SEL_PARAM,
  parseSearchSel,
} from '@/lib/search/search-selection';

function SearchPageFallback() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas">
      <span className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading search…
      </span>
    </div>
  );
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const sel = useMemo(
    () => parseSearchSel(searchParams.get(SEARCH_SEL_PARAM)),
    [searchParams],
  );

  const { push: pushRecent, recents, isLoading: recentsLoading } = useStaffSearchRecents({
    scope: SEARCH_RECENTS_SCOPE,
  });

  // Record every distinct query against staff recents (DB).
  const lastRecorded = useRef<string>('');
  useEffect(() => {
    if (!q || q === lastRecorded.current) return;
    lastRecorded.current = q;
    void pushRecent({
      query: q,
      scope: SEARCH_RECENTS_SCOPE,
      scopeLabel: 'Search',
      scopeHref: searchRerunHref(q),
    });
  }, [q, pushRecent]);

  // Empty land → auto-rerun the most recent staff query once recents settle.
  const autoReranRef = useRef(false);
  useEffect(() => {
    if (q || recentsLoading || autoReranRef.current) return;
    const latest = recents[0]?.query?.trim();
    if (!latest) return;
    autoReranRef.current = true;
    router.replace(searchRerunHref(latest));
  }, [q, recents, recentsLoading, router]);

  return <SearchDetailWorkspace sel={sel} hasQuery={Boolean(q)} />;
}

export default function SearchPage() {
  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      <Suspense fallback={<SearchPageFallback />}>
        <SearchPageContent />
      </Suspense>
    </div>
  );
}
