'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  APP_SIDEBAR_NAV,
  filterPageModes,
  getSidebarPageNav,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import {
  getParkedSurfaceMeta,
  isParkedSurfaceBlocked,
  isParkedSurfaceKey,
} from '@/lib/dogfood/parked-surfaces';
import { PARKED_SURFACE_ICONS } from '@/components/dogfood/ParkedSurface';
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
  onOpenNav,
  onNavigate,
  className,
}: {
  permissions?: ReadonlySet<string>;
  mobileRestricted?: boolean;
  /** Fired after a page/mode pick (e.g. to close the slide-over). */
  onNavigate?: () => void;
  /** Open the page-list spine (wired from the band's chevron, where shown). */
  onOpenNav?: () => void;
  className?: string;
}) {
  const { pageId, modeId } = useActiveSidebarMode();
  const navigate = useSidebarModeNav();

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

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

    // Parked surfaces are off APP_SIDEBAR_NAV but still addressable by URL.
    // Never fall through to pages[0] (was showing "Operations" on /fba).
    if (isParkedSurfaceKey(pageId)) {
      const meta = getParkedSurfaceMeta(pageId);
      const Icon = PARKED_SURFACE_ICONS[pageId];
      const modeful = getSidebarPageNav(pageId);
      // While blocked: header shows the real label (stand-in UI, no mode cluster).
      if (isParkedSurfaceBlocked(pageId)) {
        return {
          id: pageId,
          label: meta.label,
          href: meta.href,
          icon: Icon,
          kind: 'main',
        };
      }
      if (modeful) return modeful;
      return {
        id: pageId,
        label: meta.label,
        href: meta.href,
        icon: Icon,
        kind: 'main',
      };
    }

    const fallbackItem = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
    return fallbackItem ? toPageNav(fallbackItem) : pages[0]!;
  }, [pages, pageId]);

  const otherPages = useMemo(() => pages, [pages]);

  // Row keys are `${group kind}-${page id}` (see SidebarNavList.renderRow).
  const activeRowKey = activePage ? `${activePage.kind ?? 'bottom'}-${activePage.id}` : null;

  // The page you are ON opens with its modes already expanded, so revealing the
  // sidebar shows where you are AND the sibling modes you can reach — one look,
  // no click. Re-runs on page change only, so a manual expand elsewhere in the
  // list survives until you navigate.
  useEffect(() => {
    setExpandedKey(activeRowKey);
  }, [activeRowKey]);

  const handleNavigate = useCallback(
    (nextPageId: string, nextModeId?: string) => {
      navigate(nextPageId, nextModeId);
      // Expansion is owned by the active-page effect above — clearing it here
      // would collapse the row a beat before the new route re-expands it.
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
      onOpen={() => onOpenNav?.()}
      otherPages={otherPages}
      expandedKey={expandedKey}
      onToggleRow={setExpandedKey}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      className={className}
    />
  );
}
