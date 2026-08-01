'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  APP_SIDEBAR_NAV,
  filterPageModes,
  getSidebarPageNav,
  spineSectionIdForPage,
  type SidebarNavItem,
  type SidebarPageNav,
  type SpineSectionId,
} from '@/lib/sidebar-navigation';
import { useOrgNavItems } from '@/hooks/useOrgNavItems';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import { useActiveSidebarMode } from './useActiveSidebarMode';
import { useSidebarModeNav } from './useSidebarModeNav';
import { MasterNavView } from './MasterNavView';

/** Merge a flat nav item with its mode metadata (if the page has modes). */
function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  // Carry the flat item's icon AND label so a per-org nav override (which
  // renames via the flat item) survives the merge for modeful pages too.
  return page ? { ...page, icon: item.icon, label: item.label } : item;
}

/**
 * Router-wired master nav container. Reads the active page+mode from the URL,
 * writes navigation through `useSidebarModeNav`. L2 Mode + Recents live in
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
  /** Fired after a page/mode pick (e.g. to close the slide-over). */
  onNavigate?: () => void;
  className?: string;
}) {
  const { pageId, modeId } = useActiveSidebarMode();
  const navigate = useSidebarModeNav();

  const [drillId, setDrillId] = useState<SpineSectionId | null>(null);

  // Per-org nav override applied (Phase 4). Falls back to the static defaults
  // when no override is published — behavior is unchanged until an org opts in.
  const navItems = useOrgNavItems({ permissions, mobileRestricted });
  const pages = useMemo(
    () => navItems.map(toPageNav).map((page) => filterPageModes(page, permissions)),
    [navItems, permissions],
  );

  const activePage = useMemo<SidebarPageNav>(() => {
    const found = pages.find((p) => p.id === pageId);
    if (found) return found;

    const fallbackItem = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
    if (fallbackItem) return toPageNav(fallbackItem);

    // Some surfaces are addressable by URL without owning a spine row (e.g.
    // `/fba`, which redirects into Shipping). Prefer their mode registry entry
    // so the header shows the real label — never fall through to pages[0],
    // which used to show "Operations" on /fba.
    return getSidebarPageNav(pageId) ?? pages[0]!;
  }, [pages, pageId]);

  const otherPages = useMemo(() => pages, [pages]);

  const activeSection = spineSectionIdForPage(activePage);

  // Enter the matching section drill when navigating onto a page from another
  // section (or from a top/footer pin). Manual Back leaves the root map while the
  // URL can stay in-section — do not force-reopen until the next cross-section
  // transition.
  const prevSectionRef = useRef<SpineSectionId | null>(null);
  useEffect(() => {
    if (activeSection && activeSection !== prevSectionRef.current) {
      setDrillId(activeSection);
    } else if (!activeSection) {
      setDrillId(null);
    }
    prevSectionRef.current = activeSection;
  }, [activeSection]);

  const handleNavigate = useCallback(
    (nextPageId: string, nextModeId?: string) => {
      navigate(nextPageId, nextModeId);
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
      activeModeId={modeId}
      otherPages={otherPages}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      drillId={drillId}
      onDrillChange={setDrillId}
      className={className}
    />
  );
}
