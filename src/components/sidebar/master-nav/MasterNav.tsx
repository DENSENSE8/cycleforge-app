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
  onNavigate,
  layout,
  className,
}: {
  permissions?: ReadonlySet<string>;
  mobileRestricted?: boolean;
  /** Fired after a page/mode pick (e.g. to close the mobile drawer). */
  onNavigate?: () => void;
  /** The workspace body shown below the header when closed. */
  renderContext?: () => ReactNode;
  /** Menu placement — see {@link MasterNavView}'s `layout`. */
  layout?: 'floating' | 'docked';
  className?: string;
}) {
  const { pageId, modeId } = useActiveSidebarMode();
  const navigate = useSidebarModeNav();
  const { recents: recentModeRefs, pushRecent: pushRecentMode } = useRecentModes();

  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setExpandedKey(null);
  }, []);

  // Pin page+mode for header jump chips (name-of-now stays the label).
  useEffect(() => {
    pushRecentMode(pageId, modeId);
  }, [pageId, modeId, pushRecentMode]);

  // Close the menu whenever the route resolves to a new page/mode.
  useEffect(() => {
    setOpen(false);
    setExpandedKey(null);
  }, [pageId, modeId]);

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

  const handleNavigate = useCallback(
    (nextPageId: string, nextModeId?: string) => {
      navigate(nextPageId, nextModeId);
      setOpen(false);
      setExpandedKey(null);
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
      open={open}
      onOpen={() => setOpen(true)}
      pageModes={pageModes}
      recentModes={recentModes}
      otherPages={otherPages}
      expandedKey={expandedKey}
      onToggleRow={setExpandedKey}
      onNavigate={handleNavigate}
      onRowHover={handleRowHover}
      onRequestClose={closeMenu}
      renderContext={renderContext}
      layout={layout}
      className={className}
    />
  );
}
