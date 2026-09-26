'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { hasSidebarContextPanel } from '@/lib/sidebar-navigation';
import { isDashboardRepairsMode } from '@/lib/dashboard/dashboard-domains';

/** Does the current location actually have a context panel to render? */
export function useHasSidebarContext(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname === '/dashboard' && isDashboardRepairsMode(searchParams)) return false;
  return hasSidebarContextPanel(pathname);
}
