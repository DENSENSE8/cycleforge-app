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
import { MAX_RECENT_MODES, useRecentModes } from './useRecentModes';
import { MasterNavView, type MasterNavPageModeChip } from './MasterNavView';
import type { MasterNavRecentModeChip } from './MasterNavHeader';
import type { ReactNode } from 'react';

/** Merge a flat nav item with its mode metadata (if the page has modes). */
function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  // Carry the flat item's icon AND label so a per-org nav override (which
  // renames via the flat item) survives the merge for modeful pages too.
  return page ? { ...page, icon: item.icon, label: item.label } : item;
}

/**
 * Router-wired master nav container (plan §3). Reads the active page+mode from
 * the URL, writes navigation through `useSidebarModeNav`, and pins recents. This
 * is what P2 mounts into `DashboardSidebar`; P1 exercises it behind a flag.
 *
 * NB: clicking a row genuinely navigates — do not mount this in a pure showroom
 * Bay (use {@link MasterNavView} with local state there instead).
 */
export function MasterNav({
  permissions,
  mobileRestricted = false,
  renderContext,
  hasContext = false,
  onOpenNav,
  onNavigate,
  className,
}: {
  permissions?: ReadonlySet<string>;
  mobileRestricted?: boolean;
  /** Fired after a page/mode pick (e.g. to close the slide-over). */
  onNavigate?: () => void;
  /** The route's context panel — the spine's resting body when `hasContext`. */
  renderContext?: () => ReactNode;
  /** Mounted as a route's resident column — see {@link MasterNavView}. */
  hasContext?: boolean;
  /** Open the page-list slide-over (wired from the resident column's band). */
  onOpenNav?: () => void;
  className?: string;
}) {
  const { pageId, modeId } = useActiveSidebarMode();
  const navigate = useSidebarModeNav();
  const { recents: recentModeRefs, pushRecent: pushRecentMode } = useRecentModes();

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Pin page+mode for header jump chips (name-of-now stays the label).
  useEffect(() => {
    pushRecentMode(pageId, modeId);
  }, [pageId, modeId, pushRecentMode]);

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
    return fallbackItem ? toPageNav(fallbackItem) : pages[0];
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

  const isModeful = Boolean(activePage?.modes && activePage.modes.length > 1);

  // Same-page L2 modes feed the hover dropdown under the header trigger.
  const pageModes = useMemo<MasterNavPageModeChip[]>(() => {
    if (!isModeful || !activePage.modes) return [];
    const activeId = modeId ?? activePage.modes[0]?.id;
    return activePage.modes.map((mode) => ({
      id: mode.id,
      label: mode.label,
      icon: mode.icon,
      active: mode.id === activeId,
      group: mode.group,
      onSelect: () => handleNavigate(activePage.id, mode.id),
    }));
  }, [isModeful, activePage, modeId, handleNavigate]);

  // Header chips: prior cross-context jumps only (never the one you're on), max 3.
  // Same-page modes stay in the hover dropdown — chips are cross-context jumps.
  const recentModes = useMemo<MasterNavRecentModeChip[]>(() => {
    const currentKey = `${pageId}:${modeId ?? ''}`;
    const chips: MasterNavRecentModeChip[] = [];
    for (const ref of recentModeRefs) {
      if (chips.length >= MAX_RECENT_MODES) break;
      const key = `${ref.pageId}:${ref.modeId ?? ''}`;
      if (key === currentKey) continue;
      if (isModeful && ref.pageId === pageId) continue;
      const page = pages.find((p) => p.id === ref.pageId);
      if (!page) continue;
      const mode = ref.modeId ? page.modes?.find((m) => m.id === ref.modeId) : undefined;
      // Mode id unknown / gated out — skip when the stored mode no longer exists.
      if (ref.modeId && !mode && page.modes && page.modes.length > 0) continue;
      // Modes own glyphs (heavy stroke); modeless page jumps use the page SoT icon
      // (light stroke) — same as MasterNav L1 rows. Never invent a text mark.
      const label =
        mode && page.modes && page.modes.length > 1
          ? `${page.label} · ${mode.label}`
          : mode?.label ?? page.label;
      chips.push({
        key,
        label,
        icon: mode?.icon ?? page.icon,
        iconLayer: mode ? 'mode' : 'page',
        onSelect: () => handleNavigate(ref.pageId, ref.modeId ?? undefined),
        onHover: () => prefetchNavData(page.href, queryClient),
      });
    }
    return chips;
  }, [isModeful, recentModeRefs, pages, pageId, modeId, handleNavigate, queryClient]);

  if (!activePage) return null;

  return (
    <MasterNavView
      activePage={activePage}
      activeModeId={modeId}
      onOpen={() => onOpenNav?.()}
      pageModes={pageModes}
      recentModes={recentModes}
      otherPages={otherPages}
      expandedKey={expandedKey}
      onToggleRow={setExpandedKey}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      renderContext={renderContext}
      hasContext={hasContext}
      className={className}
    />
  );
}
