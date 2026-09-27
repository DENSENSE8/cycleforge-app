'use client';

/**
 * The page's live layer, mounted ONCE by the warehouse frame
 * (`WarehouseShell`; the kiosk and public frames have no live layer), the
 * sibling of `RouteModeRegion`: the route's realtime domains
 * (`src/lib/routing/realtime-registry.ts`) drive the one
 * `useRealtimeInvalidation`, and the refresh bus → cache bridge makes every
 * local `refreshDomain(…)` invalidate its readers. Pages do not mount their
 * own. The mode is not an input — Floor and triage subscribe identically.
 */

import { usePathname } from 'next/navigation';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useRefreshDomainQueries } from '@/lib/refresh/query-keys';
import { realtimeFlagsFor } from '@/lib/routing/realtime-registry';

export function RouteRealtimeMount(): null {
  useRealtimeInvalidation(realtimeFlagsFor(usePathname()));
  useRefreshDomainQueries();
  return null;
}
