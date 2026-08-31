/**
 * Header page-face resolver — which chip + which switcher rows the
 * GlobalHeader page control shows. Pure; the React wrapper lives in
 * {@link HeaderPageSwitcher}.
 *
 * Operator 2026-08-31: this control is Scan Stations triage only. Desk /
 * table pages already name themselves in {@link DeskPageChrome}; a second
 * "Shipping" chip in the beam is a twin of that title.
 */

import {
  STATION_GROUPS,
  floorStationPages,
  getSidebarPageNav,
  type SidebarIconComponent,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';

export type HeaderMenuRow = {
  id: string;
  label: string;
  icon: SidebarIconComponent;
};

export type HeaderPageFace = {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  /** Modeful L2 children, or Scan Stations peers as menu rows. */
  menuRows?: HeaderMenuRow[];
  /** Active menu row id (child or first-class floor bench). */
  activeRowId?: string;
  /** Menu aria-label (page label or Scan Stations). */
  menuAriaLabel?: string;
  /**
   * How menu selection navigates:
   * - `child` — `navigate(pageId, childId)` for SIDEBAR_PAGE_NAV children
   * - `page` — `navigate(memberPageId)` for first-class station peers
   */
  menuNav?: 'child' | 'page';
};

function pageVisible(
  page: SidebarPageNav,
  permissions: ReadonlySet<string> | undefined,
): boolean {
  if (!page.requires) return true;
  if (!permissions) return true;
  return permissions.has(page.requires);
}

export function resolveHeaderPage(
  pageId: string,
  permissions?: ReadonlySet<string>,
): HeaderPageFace | null {
  const raw = getSidebarPageNav(pageId);
  if (!raw || raw.kind !== 'station' || raw.stationGroup !== 'floor') {
    return null;
  }

  const members = floorStationPages().filter((p) => pageVisible(p, permissions));
  const active = members.find((m) => m.id === pageId) ?? members[0];
  const stationsLabel =
    STATION_GROUPS.find((g) => g.id === 'floor')?.label ?? 'Scan Stations';
  if (members.length < 2 || !active) return null;

  return {
    id: active.id,
    label: active.label,
    icon: active.icon,
    menuRows: members.map((m) => ({
      id: m.id,
      label: m.label,
      icon: m.icon,
    })),
    activeRowId: pageId,
    menuAriaLabel: stationsLabel,
    menuNav: 'page',
  };
}
