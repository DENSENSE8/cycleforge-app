'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  APP_SIDEBAR_NAV,
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
import { useActiveSidebarMode } from './useActiveSidebarMode';
import { useSidebarModeNav } from './useSidebarModeNav';
import { useRecentPages } from './useRecentPages';
import { MAX_RECENT_MODES, useRecentModes } from './useRecentModes';
import { MasterNavView } from './MasterNavView';
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
 * Drop modes the user can't access (per-mode `requires`, e.g. admin sub-sections)
 * so the dropdown matches the page body's own permission filtering. Modes without
 * `requires` are always visible; gated modes need the permission present.
 */
function filterPageModes(page: SidebarPageNav, permissions?: ReadonlySet<string>): SidebarPageNav {
  if (!page.modes) return page;
  const modes = page.modes.filter((mode) => !mode.requires || (permissions?.has(mode.requires) ?? false));
  return modes.length === page.modes.length ? page : { ...page, modes };
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
  showModeRail = true,
  railPageIds,
  renderContext,
  onNavigate,
  className,
}: {
  permissions?: ReadonlySet<string>;
  mobileRestricted?: boolean;
  showModeRail?: boolean;
  /** Fired after a page/mode pick (e.g. to close the mobile drawer). */
  onNavigate?: () => void;
  /**
   * Restrict the L2 rail to these page ids (the pages whose panels have already
   * dropped their own pill-row). When omitted, the rail shows for every modeful
   * page. Used during the phased cutover so un-migrated pages keep their own
   * switcher instead of getting a doubled one.
   */
  railPageIds?: ReadonlySet<string>;
  /** `panel` mode only: the workspace body shown below the rail when closed. */
  renderContext?: () => ReactNode;
  className?: string;
}) {
  const { pageId, modeId } = useActiveSidebarMode();
  const navigate = useSidebarModeNav();
  const { recents, pushRecent } = useRecentPages();
  const { recents: recentModeRefs, pushRecent: pushRecentMode } = useRecentModes();

  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setExpandedKey(null);
  }, []);

  // Pin the page you land on so it's a recent next time you're elsewhere.
  useEffect(() => {
    pushRecent(pageId);
  }, [pageId, pushRecent]);

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
      // While blocked: header shows the real label, no mode rail (stand-in UI).
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

  // Recents = fast switch-back only (never the page you're on). Grouped sections
  // mirror APP_SIDEBAR_NAV order so the active page sits in its real slot (e.g.
  // Sourcing between Walk-In and Products) with the blue row highlight.
  const recentPages = useMemo(
    () =>
      recents
        .filter((id) => id !== pageId)
        .map((id) => pages.find((p) => p.id === id))
        .filter((p): p is SidebarPageNav => Boolean(p)),
    [recents, pages, pageId],
  );
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

  // Header chips: prior modes only (never the one you're on), max 3.
  // Same-page modes stay on ModeRail — chips are cross-context jumps only.
  const recentModes = useMemo<MasterNavRecentModeChip[]>(() => {
    const currentKey = `${pageId}:${modeId ?? ''}`;
    const railOwnsPage = Boolean(activePage?.modes && activePage.modes.length > 1);
    const chips: MasterNavRecentModeChip[] = [];
    for (const ref of recentModeRefs) {
      if (chips.length >= MAX_RECENT_MODES) break;
      const key = `${ref.pageId}:${ref.modeId ?? ''}`;
      if (key === currentKey) continue;
      if (railOwnsPage && ref.pageId === pageId) continue;
      const page = pages.find((p) => p.id === ref.pageId);
      if (!page) continue;
      const mode = ref.modeId ? page.modes?.find((m) => m.id === ref.modeId) : undefined;
      // Mode id unknown / gated out — fall back to page chrome when modeless or
      // when the stored mode no longer exists in the filtered nav.
      if (ref.modeId && !mode && page.modes && page.modes.length > 0) continue;
      const icon = mode?.icon ?? page.icon;
      const label =
        mode && page.modes && page.modes.length > 1
          ? `${page.label} · ${mode.label}`
          : mode?.label ?? page.label;
      chips.push({
        key,
        label,
        icon,
        onSelect: () => handleNavigate(ref.pageId, ref.modeId ?? undefined),
      });
    }
    return chips;
  }, [recentModeRefs, pages, pageId, modeId, activePage, handleNavigate]);

  if (!activePage) return null;

  // Rail shows only for pages cleared for it (or all, when no allowlist).
  const railOn = showModeRail && (!railPageIds || railPageIds.has(activePage.id));

  return (
    <MasterNavView
      activePage={activePage}
      activeModeId={modeId}
      open={open}
      onOpen={() => setOpen(true)}
      recentPages={recentPages}
      recentModes={recentModes}
      otherPages={otherPages}
      expandedKey={expandedKey}
      onToggleRow={setExpandedKey}
      onNavigate={handleNavigate}
      onRequestClose={closeMenu}
      showModeRail={railOn}
      renderContext={renderContext}
      className={className}
    />
  );
}
