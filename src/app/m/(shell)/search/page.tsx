'use client';

import { Suspense } from 'react';
import { SearchFindSurface, SearchPrimaryPaintShell } from '@/components/ui/search-find';
import { SurfaceParamHygiene } from '@/components/ui/surface-param-hygiene';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function MobileSearchPage() {
  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-surface-card">
      <SurfaceParamHygiene />
      <Suspense fallback={<UniversalLoader isLoading label="Loading search" className="h-full" />}>
        <SearchPrimaryPaintShell>
          <SearchFindSurface density="compact" />
        </SearchPrimaryPaintShell>
      </Suspense>
    </div>
  );
}
