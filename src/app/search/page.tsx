'use client';

/**
 * `/search` — cross-entity find workbench.
 *
 * Contract:
 *   • Find lives in {@link CommandBar} (header icon / ⌘K popover).
 *   • `?q=` + no `?sel=` → browse list ({@link SearchBrowseShell}).
 *   • No `?q=` → detail workspace (recent rail auto-selects the latest find).
 *   • `?sel=type:id` → full-bleed {@link SearchDetailWorkspace} entity shell.
 *     ORDER renders the scan-station composition in preview stance.
 *   • `?q=` is the query; client refine: `?etype=` / `?hstat=` / `?colsort=`.
 *   • Sole / exact identifier hits set `?sel=` in-page (do not navigate away).
 *
 * Region contract: Workbench. Context rail = `SearchRecentRail` (recent finds,
 * the way back to a record you just had open) — find itself still lives only in
 * the header.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { SearchPrimaryPaintShell } from '@/components/search/SearchPrimaryPaintShell';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';

function SearchPageContent() {
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const { sel, setSel } = useSearchSelParam();

  if (q && !sel) {
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
      <Suspense fallback={<UniversalLoader isLoading label="Loading search" className="h-full" />}>
        <SearchPrimaryPaintShell>
          <SearchPageContent />
        </SearchPrimaryPaintShell>
      </Suspense>
    </div>
  );
}
