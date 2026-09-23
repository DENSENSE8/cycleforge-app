'use client';

/**
 * `/search` — cross-entity FIND workbench. Consumes {@link SearchFindSurface}.
 *
 * Callers: desktop shell. Query: `?q=` / `?sel=`. Phone SoT is `/m/search`,
 * which mounts the same body at `density="compact"`.
 * User: searching for orders I must see who packed/picked/scanned out and identifier routing.
 */

import { Suspense } from 'react';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { SearchFindSurface, SearchPrimaryPaintShell } from '@/components/ui/search-find';

export default function SearchPage() {
  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      <SurfaceParamHygiene />
      <Suspense fallback={<UniversalLoader isLoading label="Loading search" className="h-full" />}>
        <SearchPrimaryPaintShell>
          <SearchFindSurface density="comfortable" />
        </SearchPrimaryPaintShell>
      </Suspense>
    </div>
  );
}
