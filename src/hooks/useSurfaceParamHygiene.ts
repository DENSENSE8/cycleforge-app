'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import { stripCrossSurfaceParams } from '@/lib/surface-isolation';

/** Boundary parse on mount / navigation: */
export function useSurfaceParamHygiene(): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const current = new URLSearchParams(searchParams.toString());
    const spec = routeParamsFor(pathname);
    const cleaned = spec
      ? parseRouteParams(spec, current)
      : stripCrossSurfaceParams(pathname, current);
    // A pure key reorder is already clean — replacing for it costs a server round trip per URL write.
    // `sort()` is stable, so a repeated key (`unit`) keeps its order.
    const sortedCleaned = new URLSearchParams(cleaned);
    sortedCleaned.sort();
    const sortedCurrent = new URLSearchParams(current);
    sortedCurrent.sort();
    if (sortedCleaned.toString() === sortedCurrent.toString()) return;
    const qs = cleaned.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, searchParams, router]);
}
