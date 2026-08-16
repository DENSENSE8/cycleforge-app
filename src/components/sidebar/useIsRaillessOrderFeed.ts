'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { isRaillessOrderFeedSurface } from '@/lib/sidebar-navigation';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';

/**
 * Does the current location run **rail-less** (Pattern E — no left context
 * column)? True for To-ship (`/shipping/orders` + `/dashboard` outbound) and the
 * Inbound desk (`/incoming`); false elsewhere (scan stations keep recents;
 * `/dashboard` inbound / sales keep their pickers). Wraps the pure
 * {@link isRaillessOrderFeedSurface} with the pathname + `?mode=` domain the
 * frame needs.
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
