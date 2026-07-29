'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import { stripCrossSurfaceParams } from '@/lib/surface-isolation';

/**
 * Boundary parse on mount / navigation: drop every URL param the current route
 * does not declare.
 *
 * This is rule 2 of the isolation contract (`@/lib/routing/route-params`), and
 * it is what makes a stale deep-link, a pasted URL, or a back-button entry safe
 * without anyone maintaining a denylist. A route with a spec keeps only what it
 * owns or carries, with values that pass their schema; everything else falls
 * back to the residual cross-family strip until its surface gets a spec.
 */
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
