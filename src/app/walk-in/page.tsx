'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useWalkInTaskRedirect } from '@/hooks/useWalkInTaskRedirect';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';
import { retiredWalkInHistoryTarget } from '@/lib/dashboard/dashboard-domains';

/**
 * `/walk-in` — retired front door for Sales history.
 *
 * History lives on `/dashboard?mode=sales` (Local Pickup: `?mode=pickup`).
 * Intake deep-links (`?new=` / `?openRepair=`) still redirect to the Walk-In
 * station via {@link useWalkInTaskRedirect} before the history redirect runs.
 *
 * Client replace (not a permanent Next `redirects()` 308) so bookmarks keep
 * `tab` / mode without trapping bad params — same class as `?mode=search` →
 * `/search` on the dashboard page.
 */
function WalkInRedirectContent() {
  // Boundary-parse on arrival. WALK_IN_ROUTE_PARAMS declares the legacy
  // deep-link keys (`openRepair`, `new`, `search`, `tab`) precisely so this hook
  // cannot strip them out from under the redirects below.
  useSurfaceParamHygiene();
  const redirectingToStation = useWalkInTaskRedirect();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (redirectingToStation) return;
    router.replace(retiredWalkInHistoryTarget(searchParams));
  }, [redirectingToStation, router, searchParams]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-card">
      <LoadingSpinner size="lg" className="text-emerald-600" />
    </div>
  );
}

export default function WalkInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
          <LoadingSpinner size="lg" className="text-emerald-600" />
        </div>
      }
    >
      <WalkInRedirectContent />
    </Suspense>
  );
}
