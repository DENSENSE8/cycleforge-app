'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  APP_SIDEBAR_NAV,
  filterPageChildren,
  getSidebarPageNav,
  isSidebarPageReachable,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { useOrgNavItems } from '@/hooks/useOrgNavItems';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import { useActiveSidebarChild } from './useActiveSidebarChild';
import { useSidebarChildNav } from './useSidebarChildNav';
import { MasterNavView } from './MasterNavView';

/** Merge a flat nav item with its child-page metadata (if the page has any). */
function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  // Carry the flat item's icon AND label so a per-org nav override (which
  // renames via the flat item) survives the merge for pages with children too.
  return page ? { ...page, icon: item.icon, label: item.label } : item;
}

/**
 * Router-wired master nav container. Reads the active page + child from the URL,
 * writes navigation through `useSidebarChildNav`. The page switcher + Recents live in
 * GlobalHeader — this spine is page-list identity only (no MRU chips).
 */
export function MasterNav({
  permissions,
  mobileRestricted = false,
  onNavigate,
  className,
}: {
  permissions?: ReadonlySet<string>;
  mobileRestricted?: boolean;
  /** Fired after a page/child pick (e.g. to close the slide-over). */
  onNavigate?: () => void;
  className?: string;
}) {
  const { pageId, childId } = useActiveSidebarChild();
  const navigate = useSidebarChildNav();

  // Per-org nav override applied (Phase 4). Falls back to the static defaults
  // when no override is published — behavior is unchanged until an org opts in.
  const navItems = useOrgNavItems({ permissions, mobileRestricted });
  const pages = useMemo(
    () =>
      navItems
        .map(toPageNav)
        .map((page) => filterPageChildren(page, permissions))
        // A page whose every child was permission-filtered is unreachable — drop
        // it rather than render a dead header (see `isSidebarPageReachable`).
        .filter(isSidebarPageReachable),
    [navItems, permissions],
  );

  const activePage = useMemo<SidebarPageNav>(() => {
    const found = pages.find((p) => p.id === pageId);
    if (found) return found;

    const fallbackItem = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
    if (fallbackItem) return toPageNav(fallbackItem);

    // Some surfaces are addressable by URL without owning a spine row (e.g.
    // `/fba`, which redirects into Shipping). Prefer their child registry entry
    // so the header shows the real label — never fall through to pages[0],
    // which used to show "Operations" on /fba.
    return getSidebarPageNav(pageId) ?? pages[0]!;
  }, [pages, pageId]);

  const otherPages = useMemo(() => pages, [pages]);

  // There is no drill state here any more (2026-08-02). The spine body is one
  // flat map, so there is nothing to auto-enter on a cross-section navigation
  // and nothing for a Back button to leave — which also retires the whole
  // "auto-drill must not steal focus" hazard the effect that lived here carried.

  const handleNavigate = useCallback(
    (nextPageId: string, nextChildId?: string) => {
      navigate(nextPageId, nextChildId);
      onNavigate?.();
    },
    [navigate, onNavigate],
  );

  // Hovering a destination warms its data (nav-data-prefetch registry) so the
  // subsequent click paints from cache instead of a skeleton. Deduped by
  // react-query staleTime, so repeat hovers are free.
  const queryClient = useQueryClient();
  const handleRowHover = useCallback(
    (page: SidebarPageNav) => prefetchNavData(page.href, queryClient),
    [queryClient],
  );

  if (!activePage) return null;

  return (
    <MasterNavView
      activePage={activePage}
      activeChildId={childId}
      otherPages={otherPages}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      className={className}
    />
  );
}
