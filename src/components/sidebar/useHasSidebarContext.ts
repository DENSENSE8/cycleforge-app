'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { getSidebarRouteKey, hasSidebarContextPanel } from '@/lib/sidebar-navigation';
import {
  getDashboardDomainFromSearch,
  getDashboardModeFromSearch,
} from '@/lib/dashboard/dashboard-domains';

/**
 * Does the current location actually put a body in the sidebar spine?
 *
 * `hasSidebarContextPanel` answers it from the route key alone, which is right
 * for every route but one: the dashboard's Receiving mode is a Monitor, so
 * `DashboardOrdersContextPanel` returns `null` there even though the `dashboard`
 * key otherwise has a panel. That single exception lives here rather than in the
 * route-key contract, which would otherwise have to learn about params.
 *
 * **Two consumers, and they must agree.** `MasterNavView` uses it to decide the
 * spine's resting body (a `false` shows the page list instead of an empty pane),
 * and `useSidebarPin` uses it to decide whether the route may hold a resident
 * column at all. When they disagreed, `/dashboard?mode=inbound` kept a 360px
 * column whose body had nothing to render — the exact empty-column bug the spine
 * migration set out to remove.
 */
export function useHasSidebarContext(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!hasSidebarContextPanel(pathname)) return false;
  if (getSidebarRouteKey(pathname) !== 'dashboard') return true;
  // Search keeps its recents sidebar; Receiving (inbound) has no order feed.
  if (getDashboardModeFromSearch(searchParams) === 'search') return true;
  return getDashboardDomainFromSearch(searchParams) !== 'inbound';
}
