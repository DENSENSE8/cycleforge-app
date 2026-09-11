'use client';

/**
 * `/m/search` — FIND SoT column (class B). Same body as desktop `/search`.
 *
 * Callers: mobile drawer Find row. Query: `?q=` / `?sel=`.
 * User: searching for orders I must see who packed/picked/scanned out and identifier routing.
 */

import { Suspense } from 'react';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { SearchFindSurface } from '@/components/search/SearchFindSurface';
import { SearchPrimaryPaintShell } from '@/components/search/SearchPrimaryPaintShell';

export default function MobileSearchPage() {
  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      <SurfaceParamHygiene />
      <Suspense fallback={<UniversalLoader isLoading label="Loading search" className="h-full" />}>
        <SearchPrimaryPaintShell>
          <SearchFindSurface queryField />
        </SearchPrimaryPaintShell>
      </Suspense>
    </div>
  );
}
