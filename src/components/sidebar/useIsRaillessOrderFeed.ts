'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { isRaillessOrderFeedSurface } from '@/lib/sidebar-navigation';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';

/**
 * Does the current location run the To-ship order feed **rail-less** (Pattern E —
 * no left context column)? True for the dedicated desk (`/shipping/orders`) and
 * the `/dashboard` outbound domain; false everywhere else (inbound / sales keep
 * their pickers). Wraps the pure {@link isRaillessOrderFeedSurface} with the
 * pathname + `?mode=` domain the frame needs.
 *
 * One consumer: `ContextPanelLayout`, which subtracts this from `hasPanel` so the
 * column collapses instead of reserving reclaimed table width.
 */
export function useIsRaillessOrderFeed(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDashboardOutboundDomain =
    getDashboardDomainFromSearch(searchParams) === 'outbound';
  return isRaillessOrderFeedSurface(pathname, isDashboardOutboundDomain);
}
