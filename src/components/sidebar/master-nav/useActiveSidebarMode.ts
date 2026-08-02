'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { getSidebarNavPageId, resolveSidebarMode } from '@/lib/sidebar-navigation';

/**
 * Single resolver for "which page + which mode am I on" — reads the live URL via
 * the same `SIDEBAR_PAGE_NAV.resolveMode()` the panels will adopt, so the closed
 * header label and the L2 rail's active pill stay in lockstep with deep-links.
 * `modeId` is `null` for single-surface pages (no mode row).
 *
 * Receiving-family paths use {@link getSidebarNavPageId} (Arrival / Unbox / …)
 * for MasterNav L1 identity; those pages are modeless. Panel mount still uses
 * `getSidebarRouteKey` → `receiving`.
 */
export function useActiveSidebarMode(): { pageId: string; modeId: string | null } {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Pass search so Products → Labels resolves to Print Labels (Print Stations).
  const pageId = getSidebarNavPageId(pathname, searchParams);
  const modeId = resolveSidebarMode(pageId, {
    pathname: pathname ?? '',
    params: searchParams,
  });
  return { pageId, modeId };
}
