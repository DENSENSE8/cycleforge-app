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
import { applyOrgNavToPage } from '@/lib/nav/org-nav';
import { useOrgNavDefinition, useOrgNavItems } from '@/hooks/useOrgNavItems';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import { hydrateSpineSlots } from '@/lib/nav/spine-slots';
import { useActiveSidebarChild } from './useActiveSidebarChild';
import { useSidebarChildNav } from './useSidebarChildNav';
import { MasterNavView } from './MasterNavView';

/** Merge a flat nav item with its child-page metadata (if the page has any). */
function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  return page
    ? { ...page, icon: item.icon, label: item.label, spineFlat: item.spineFlat ?? page.spineFlat }
    : item;
}

/**
 * Router-wired master nav. Org hide/rename via {@link useOrgNavItems}; staff
 * `prefs.spineSlots` reorders Stations / Workspaces / remaining L1.
 * Absent prefs → Stations, Workspaces, then Studio / Admin.
 */
export function MasterNav({
  permissions,
  mobileRestricted = false,
  onNavigate,
  className,
}: {
  permissions?: ReadonlySet<string>;
  mobileRestricted?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const { pageId, childId } = useActiveSidebarChild();
  const navigate = useSidebarChildNav();
  const { prefs, update: updatePrefs } = useStaffPreferences();
  const orgNav = useOrgNavDefinition();

  const navItems = useOrgNavItems({ permissions, mobileRestricted });
  const pages = useMemo(
    () =>
      navItems
        .map(toPageNav)
        .map((page) => applyOrgNavToPage(page, orgNav))
        .map((page) => filterPageChildren(page, permissions))
        .filter(isSidebarPageReachable),
    [navItems, permissions, orgNav],
  );

  const spineOrder = useMemo(
    () => hydrateSpineSlots(prefs?.spineSlots, navItems),
    [prefs?.spineSlots, navItems],
  );

  const handleSpineOrderChange = useCallback(
    (next: string[]) => {
      updatePrefs({ spineSlots: next });
    },
    [updatePrefs],
  );

  const activePage = useMemo<SidebarPageNav>(() => {
    const found = pages.find((p) => p.id === pageId);
    if (found) return found;

    const fallbackItem = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
    if (fallbackItem) return toPageNav(fallbackItem);

    return getSidebarPageNav(pageId) ?? pages[0]!;
  }, [pages, pageId]);

  const handleNavigate = useCallback(
    (nextPageId: string, nextChildId?: string) => {
      navigate(nextPageId, nextChildId);
      onNavigate?.();
    },
    [navigate, onNavigate],
  );

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
      otherPages={pages}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      spineOrder={spineOrder}
      onSpineOrderChange={handleSpineOrderChange}
      className={className}
    />
  );
}
