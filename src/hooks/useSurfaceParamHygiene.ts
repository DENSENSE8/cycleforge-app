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
    if (cleaned.toString() === current.toString()) return;
    const qs = cleaned.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, searchParams, router]);
}
