'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { getSidebarRouteKey, hasSidebarContextPanel } from '@/lib/sidebar-navigation';
import {
  getDashboardDomainFromSearch,
  getDashboardModeFromSearch,
} from '@/lib/dashboard/dashboard-domains';

/**
 * Does the current location actually have a context panel to render?
 *
 * `hasSidebarContextPanel` answers it from the route key alone, which is right
 * for every route but one: the dashboard's Receiving mode is a Monitor, so
 * `DashboardOrdersContextPanel` returns `null` there even though the `dashboard`
 * key otherwise has a panel. That single exception lives here rather than in the
 * route-key contract, which would otherwise have to learn about params.
 *
 * One consumer now: `ContextPanelLayout`, which uses it to decide whether to
 * mount the rail column beside the workspace at all. That single owner is the
 * point — while the answer was also feeding the nav spine's body choice, the two
 * could disagree, and `/dashboard?mode=inbound` held a 360px column whose body
 * had nothing to render.
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
