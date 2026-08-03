'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { getSidebarNavPageId, resolveSidebarChild } from '@/lib/sidebar-navigation';

/**
 * Single resolver for "which page + which child am I on" — reads the live URL via
 * the same `SIDEBAR_PAGE_NAV.resolveChild()` the panels will adopt, so the closed
 * header label and the L2 rail's active pill stay in lockstep with deep-links.
 * `childId` is `null` for single-surface pages (no child rows).
 *
 * Receiving-family paths use {@link getSidebarNavPageId} (Arrival / Unbox / …)
 * for MasterNav L1 identity; those pages have no children. Panel mount still uses
 * `getSidebarRouteKey` → `receiving`.
 */
export function useActiveSidebarChild(): { pageId: string; childId: string | null } {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Pass search so Products → Labels resolves to Print Labels (Print Stations).
  const pageId = getSidebarNavPageId(pathname, searchParams);
  const childId = resolveSidebarChild(pageId, {
    pathname: pathname ?? '',
    params: searchParams,
  });
  return { pageId, childId };
}
