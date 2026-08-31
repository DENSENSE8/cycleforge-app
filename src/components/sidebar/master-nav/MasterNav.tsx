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
import { useOrgNavItems } from '@/hooks/useOrgNavItems';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import { hydrateSpineSlots, SPINE_STATIONS_SLOT_ID } from '@/lib/nav/spine-slots';
import { useActiveSidebarChild } from './useActiveSidebarChild';
import { useSidebarChildNav } from './useSidebarChildNav';
import { MasterNavView } from './MasterNavView';

/** Merge a flat nav item with its child-page metadata (if the page has any). */
function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  return page ? { ...page, icon: item.icon, label: item.label } : item;
}

/**
 * Router-wired master nav. Org hide/rename via {@link useOrgNavItems}; staff
 * `prefs.spineSlots` only reorders the map (Scan Stations is one slot).
 * Absent prefs → full catalog order. Scan Stations list-replaces into benches.
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

  const [drillId, setDrillId] = useState<string | null>(null);

  const navItems = useOrgNavItems({ permissions, mobileRestricted });
  const pages = useMemo(
    () =>
      navItems
        .map(toPageNav)
        .map((page) => filterPageChildren(page, permissions))
        .filter(isSidebarPageReachable),
    [navItems, permissions],
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

  const activeSection = spineSectionIdForPage(activePage);

  // Enter Scan Stations when navigating onto a floor bench from another
  // section. Manual Back leaves the root map while the URL can stay on a
  // bench — do not force-reopen until the next cross-section floor entry.
  const prevSectionRef = useRef<typeof activeSection>(null);
  useEffect(() => {
    if (activeSection === 'floor' && activeSection !== prevSectionRef.current) {
      setDrillId(SPINE_STATIONS_SLOT_ID);
    } else if (activeSection !== 'floor') {
      setDrillId((current) => (current === SPINE_STATIONS_SLOT_ID ? null : current));
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
    <MasterNavView
      activePage={activePage}
      activeChildId={childId}
      otherPages={pages}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      drillId={drillId}
      onDrillChange={setDrillId}
      spineOrder={spineOrder}
      onSpineOrderChange={handleSpineOrderChange}
      className={className}
    />
  );
}
