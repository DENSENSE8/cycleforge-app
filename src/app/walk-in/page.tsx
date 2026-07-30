'use client';

import { Suspense } from 'react';
import { WalkInHistoryHub } from '@/components/walk-in/WalkInHistoryHub';
import { WalkInHistorySidebar } from '@/components/walk-in/WalkInHistorySidebar';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useWalkInTaskRedirect } from '@/hooks/useWalkInTaskRedirect';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';

/**
 * `/walk-in` — front-desk history Monitor (recent repairs / sales / pickups).
 * Active intake & processing live on Receiving Walk-In (`/pickup?job=`).
 * Legacy task deep-links (`?mode=sales`, `?new=true`, `?openRepair=`) redirect
 * to the station via `useWalkInTaskRedirect`.
 */
function WalkInPageContent() {
  // Boundary-parse on arrival. WALK_IN_ROUTE_PARAMS declares the legacy
  // deep-link keys (`openRepair`, `new`, `search`, `tab`) precisely so this hook
  // cannot strip them out from under the redirect below.
  useSurfaceParamHygiene();
  const redirecting = useWalkInTaskRedirect();
  useRealtimeInvalidation({ repair: true, walkIn: true });

  if (redirecting) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-card">
        <LoadingSpinner size="lg" className="text-orange-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-surface-card">
      <RouteShell
        actions={<WalkInHistorySidebar />}
        history={<WalkInHistoryHub />}
      />
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
      <WalkInPageContent />
    </Suspense>
  );
}
