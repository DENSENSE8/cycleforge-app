'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { hasSidebarContextPanel } from '@/lib/sidebar-navigation';
import { isDashboardRepairsMode } from '@/lib/dashboard/dashboard-domains';

/**
 * Does the current location actually have a context panel to render?
 *
 * It is primarily a route-key question. Repair Service is the one dashboard
 * child that deliberately has no context rail: inspect the query here, at the
 * parent eligibility boundary, so `ContextPanelLayout` does not mount an empty
 * column around a child that returns `null`.
 *
 * One consumer: `ContextPanelLayout`, which uses it to decide whether to mount
 * the rail column beside the workspace at all.
 */
export function useHasSidebarContext(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname === '/dashboard' && isDashboardRepairsMode(searchParams)) return false;
  return hasSidebarContextPanel(pathname);
}
