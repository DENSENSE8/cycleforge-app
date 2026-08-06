'use client';

/**
 * `/search` — cross-entity find workbench.
 *
 * Contract:
 *   • Find lives in {@link GlobalHeaderSearch} only (never a locked-width stage).
 *   • No `?sel=` → {@link SearchBrowseShell} (empty hint / full-bleed multi-hit
 *     browse; identifier resolve publishes header pending pulse).
 *   • `?sel=type:id` → full-bleed {@link SearchDetailWorkspace} entity shell.
 *   • `?q=` is the query; client refine: `?etype=` / `?hstat=` / `?colsort=`.
 *   • Sole / exact identifier hits set `?sel=` in-page (do not navigate away).
 *
 * Region contract: Workbench. No context rail.
 */

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
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
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const sel = useMemo(
    () => parseSearchSel(searchParams.get(SEARCH_SEL_PARAM)),
    [searchParams],
  );

  if (!sel) {
    return <SearchBrowseShell />;
  }

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
