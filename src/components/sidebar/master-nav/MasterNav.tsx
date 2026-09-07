'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  APP_SIDEBAR_NAV,
  filterPageChildren,
  getSidebarPageNav,
  isSidebarPageReachable,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { useOrgNavDefinition, useOrgNavItems } from '@/hooks/useOrgNavItems';
import { applyOrgNavToPage } from '@/lib/nav/org-nav';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import { migrateSpineSlots } from '@/lib/nav/spine-slots';
import { useActiveSidebarChild } from './useActiveSidebarChild';
import { useSidebarChildNav } from './useSidebarChildNav';
import { PinHotkeysListener } from '@/components/layout/PinHotkeysListener';
import { MasterNavView } from './MasterNavView';

/** Merge a flat nav item with its child-page metadata (if the page has any). */
function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  return page ? { ...page, icon: item.icon, label: item.label } : item;
}

/**
 * Router-wired master nav. Org hide/rename via {@link useOrgNavItems}; staff
 * `prefs.spineSlots` hydrates catalog *display* order only — the map is not
 * sortable. Pins drop onto the Pinned cluster (per-staff `quickAccess`).
 * Home stays at the top (Media Library became a Workspaces row on 2026-09-05).
 * Stations, Workspaces, Automations and Admin are COLLAPSIBLE sections —
 * shadcn Collapsible, fold state per device via `useSpineSectionCollapse`,
 * never list-replace drills. Pinned has no disclosure.
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
  const { prefs, update } = useStaffPreferences();
  const definition = useOrgNavDefinition();

  const { user } = useAuth();
  const navItems = useOrgNavItems({
    permissions,
    mobileRestricted,
    organizationEnvironment: user?.organizationEnvironment ?? null,
  });
  const pages = useMemo(
    () =>
      navItems
        .map(toPageNav)
        .map((page) => applyOrgNavToPage(page, definition))
        .map((page) => filterPageChildren(page, permissions))
        .filter(isSidebarPageReachable),
    [navItems, permissions, definition],
  );

  // Rolling a new DEFAULT order onto an operator who already arranged their
  // spine: float the new lead row to the front of THEIR order, keep everything
  // else where they put it, and stamp the generation so it happens exactly
  // once — drag Automations back down and it stays down.
  const migration = useMemo(
    () => migrateSpineSlots(prefs?.spineSlots, navItems, prefs?.spineSlotsVersion),
    [prefs?.spineSlots, prefs?.spineSlotsVersion, navItems],
  );
  const spineOrder = migration.slots;
  const stampedRef = useRef(false);
  useEffect(() => {
    if (!migration.stamp || stampedRef.current) return;
    stampedRef.current = true;
    update(migration.stamp);
  }, [migration.stamp, update]);

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

  // Opening a specific session is ONE navigation. It used to call
  // `onNavigate('home')` (routing to bare `/`) and then push
  // `/?session=<id>` — two pushes, two renders, a history entry on `/` the
  // operator never asked for. Here the drawer closes and the URL lands once.
  const router = useRouter();
  const handleOpenHref = useCallback(
    (href: string) => {
      router.push(href);
      onNavigate?.();
    },
    [router, onNavigate],
  );

  const queryClient = useQueryClient();
  const handleRowHover = useCallback(
    (page: SidebarPageNav) => prefetchNavData(page.href, queryClient),
    [queryClient],
  );

  if (!activePage) return null;

  return (
    <>
      <PinHotkeysListener />
      <MasterNavView
        activePage={activePage}
        activeChildId={childId}
        otherPages={pages}
        onNavigate={handleNavigate}
        onOpenHref={handleOpenHref}
        onRowHover={handleRowHover}
        spineOrder={spineOrder}
        className={className}
      />
    </>
  );
}
