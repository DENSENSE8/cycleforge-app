'use client';

/**
 * `/search` — cross-entity find workbench.
 *
 * Contract:
 *   • Find lives in {@link GlobalHeaderSearch} only (never a locked-width stage).
 *   • No `?sel=` → {@link SearchBrowseShell} (empty hint / full-bleed multi-hit
 *     browse; identifier resolve publishes header pending pulse).
 *   • `?sel=type:id` → full-bleed {@link SearchDetailWorkspace} entity shell.
 *     ORDER renders the scan-station composition in preview stance.
 *   • `?q=` is the query; client refine: `?etype=` / `?hstat=` / `?colsort=`.
 *   • Sole / exact identifier hits set `?sel=` in-page (do not navigate away).
 *
 * Region contract: Workbench. Context rail = `SearchRecentRail` (recent finds,
 * the way back to a record you just had open) — find itself still lives only in
 * the header.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RouteLoading } from '@/design-system/components/RouteLoading';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { SearchPrimaryPaintShell } from '@/components/search/SearchPrimaryPaintShell';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';

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

  return (
    <SearchDetailWorkspace
      sel={sel}
      hasQuery={Boolean(q)}
      onExit={() => setSel(null)}
    />
  );
}

export default function SearchPage() {
  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      {/* Leaf route — `/search` has no child segments, so `page.tsx` is the
          right host (a route WITH children needs this in `layout.tsx`). The
          spec is `SEARCH_ROUTE_PARAMS` (`query-mode-routes.ts`): it owns
          q · sel · etype · hstat and carries staff · colsort · coldir, which
          is every key this surface reads. */}
      <SurfaceParamHygiene />
      <Suspense fallback={<RouteLoading label="Loading search…" />}>
        <SearchPrimaryPaintShell>
          <SearchPageContent />
        </SearchPrimaryPaintShell>
      </Suspense>
    </div>
  );
}
