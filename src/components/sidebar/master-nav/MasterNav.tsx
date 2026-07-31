'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  APP_SIDEBAR_NAV,
  filterPageModes,
  getSidebarPageNav,
  spineDrillIdForPage,
  type MainGroupId,
  type SidebarNavItem,
  type SidebarPageNav,
  type SpineDrillId,
} from '@/lib/sidebar-navigation';
import {
  getParkedSurfaceMeta,
  isParkedSurfaceBlocked,
  isParkedSurfaceKey,
  type ParkedSurfaceKey,
} from '@/lib/dogfood/parked-surfaces';
import { PARKED_SURFACE_ICONS } from '@/components/dogfood/ParkedSurface';
import { useOrgNavItems } from '@/hooks/useOrgNavItems';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import { useActiveSidebarMode } from './useActiveSidebarMode';
import { useSidebarModeNav } from './useSidebarModeNav';
import { MasterNavView } from './MasterNavView';

/** Parked Overview / Library stand-ins still need a Main nest slot. */
const PARKED_MAIN_GROUP: Partial<Record<ParkedSurfaceKey, MainGroupId>> = {
  home: 'overview',
  operations: 'overview',
  studio: 'library',
  'ai-chat': 'overview',
};

const PARKED_STOCK_IDS = new Set<ParkedSurfaceKey>(['sourcing', 'fba']);

function parkedStandInPage(pageId: ParkedSurfaceKey): SidebarPageNav {
  const meta = getParkedSurfaceMeta(pageId);
  const Icon = PARKED_SURFACE_ICONS[pageId];
  if (PARKED_STOCK_IDS.has(pageId)) {
    return {
      id: pageId,
      label: meta.label,
      href: meta.href,
      icon: Icon,
      kind: 'stock',
    };
  }
  const mainGroup = PARKED_MAIN_GROUP[pageId] ?? 'overview';
  return {
    id: pageId,
    label: meta.label,
    href: meta.href,
    icon: Icon,
    kind: 'main',
    mainGroup,
  };
}

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

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [drillId, setDrillId] = useState<SpineDrillId | null>(null);

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
      const modeful = getSidebarPageNav(pageId);
      // While blocked: header shows the real label (stand-in UI, no mode cluster).
      if (isParkedSurfaceBlocked(pageId)) {
        return parkedStandInPage(pageId);
      }
      if (modeful) return modeful;
      return parkedStandInPage(pageId);
    }

    const fallbackItem = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
    return fallbackItem ? toPageNav(fallbackItem) : pages[0]!;
  }, [pages, pageId]);

  const otherPages = useMemo(() => pages, [pages]);

  // Row keys are `${drillId|top|bottom}-${page id}` (see SidebarNavList.renderRow).
  const activeSection = spineDrillIdForPage(activePage);
  const activeRowKey = activePage
    ? `${activeSection ?? activePage.kind ?? 'bottom'}-${activePage.id}`
    : null;

  // The page you are ON opens with its modes already expanded, so revealing the
  // sidebar shows where you are AND the sibling modes you can reach — one look,
  // no click. Re-runs on page change only, so a manual expand elsewhere in the
  // list survives until you navigate.
  useEffect(() => {
    setExpandedKey(activeRowKey);
  }, [activeRowKey]);

  // Enter the matching section drill when navigating onto a page from another
  // section (or from a top/footer pin). Manual Back leaves the root map while the
  // URL can stay in-section — do not force-reopen until the next cross-section
  // transition.
  const prevSectionRef = useRef<SpineDrillId | null>(null);
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
      otherPages={otherPages}
      expandedKey={expandedKey}
      onToggleRow={setExpandedKey}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      drillId={drillId}
      onDrillChange={setDrillId}
      className={className}
    />
  );
}
