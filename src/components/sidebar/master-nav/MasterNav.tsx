'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  APP_SIDEBAR_NAV,
  filterPageChildren,
  getSidebarPageNav,
  isSidebarPageReachable,
  spineSectionIdForPage,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { useOrgNavDefinition, useOrgNavItems } from '@/hooks/useOrgNavItems';
import { applyOrgNavToPage } from '@/lib/nav/org-nav';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import { hydrateSpineSlots, spineParentDrillId } from '@/lib/nav/spine-slots';
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
 * Home · Media Library stay at the top of every drill.
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
  const { prefs } = useStaffPreferences();
  const definition = useOrgNavDefinition();

  const [drillId, setDrillId] = useState<string | null>(null);

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

  const spineOrder = useMemo(
    () => hydrateSpineSlots(prefs?.spineSlots, navItems),
    [prefs?.spineSlots, navItems],
  );

  const activePage = useMemo<SidebarPageNav>(() => {
    const found = pages.find((p) => p.id === pageId);
    if (found) return found;

    const fallbackItem = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
    if (fallbackItem) return toPageNav(fallbackItem);

    return getSidebarPageNav(pageId) ?? pages[0]!;
  }, [pages, pageId]);

  const activeSection = spineSectionIdForPage(activePage);

  // Enter Scan Stations / Desks when navigating onto that family from another
  // section. Manual Back leaves the root map while the URL can stay on the
  // surface — do not force-reopen until the next cross-section entry.
  const prevSectionRef = useRef<typeof activeSection>(null);
  useEffect(() => {
    const nextDrill = spineParentDrillId(activeSection);
    if (nextDrill && activeSection !== prevSectionRef.current) {
      setDrillId(nextDrill);
    } else if (!nextDrill) {
      setDrillId(null);
    }
    prevSectionRef.current = activeSection;
  }, [activeSection]);

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
    <>
      <PinHotkeysListener />
      <MasterNavView
        activePage={activePage}
        activeChildId={childId}
        otherPages={pages}
        onNavigate={handleNavigate}
        onRowHover={handleRowHover}
        drillId={drillId}
        onDrillChange={setDrillId}
        spineOrder={spineOrder}
        className={className}
      />
    </>
  );
}
