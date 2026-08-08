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

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';

function SearchPageFallback() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card">
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
  const { sel, setSel } = useSearchSelParam();

  // There is no standalone `/search` landing: the header find dropdown is the
  // results list, and picking a result opens `?sel=` detail. With neither a
  // selection nor a query, bounce to the desk so no blank white page ever
  // paints. `?q=` deep-links still open the browse list (back-compat only —
  // nothing in the UI routes there anymore).
  useEffect(() => {
    if (!sel && !q) router.replace('/dashboard');
  }, [sel, q, router]);

  if (!sel) {
    if (!q) return null; // redirecting — never a blank body
    return <SearchBrowseShell setSel={setSel} />;
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
