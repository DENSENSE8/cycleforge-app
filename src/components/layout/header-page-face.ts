/**
 * Header page-face resolver — which chip + which switcher rows the
 * GlobalHeader page control shows. Pure; the React wrapper lives in
 * {@link HeaderPageSwitcher}.
 */

import {
  APP_SIDEBAR_NAV,
  STATION_GROUPS,
  filterPageChildren,
  floorStationPages,
  getSidebarPageNav,
  hasDeskPageChrome,
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
  if (raw) {
    const filtered = filterPageChildren(raw, permissions);
    // Floor benches share one flat switcher — same catalog as Scan Stations.
    if (filtered.kind === 'station' && filtered.stationGroup === 'floor') {
      const members = floorStationPages().filter((p) => pageVisible(p, permissions));
      const active = members.find((m) => m.id === pageId) ?? members[0];
      const stationsLabel =
        STATION_GROUPS.find((g) => g.id === 'floor')?.label ?? 'Scan Stations';
      if (members.length > 1 && active) {
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
    }

    // A desk that draws its own children as in-page tabs keeps a plain identity
    // face here — the switcher exists so a page's children stay reachable with
    // the spine closed, and on those desks the tab band already is that door.
    const children = hasDeskPageChrome(filtered) ? undefined : filtered.children;
    return {
      id: filtered.id,
      label: filtered.label,
      icon: filtered.icon,
      menuRows:
        children && children.length > 1
          ? children.map((c) => ({ id: c.id, label: c.label, icon: c.icon }))
          : undefined,
      menuNav: children && children.length > 1 ? 'child' : undefined,
      menuAriaLabel: `${filtered.label} pages`,
    };
  }
  // Top pins + other APP_SIDEBAR_NAV-only rows (Search, Chat, …) have no
  // SIDEBAR_PAGE_NAV entry — still show their icon + label in the header.
  const nav = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
  if (!nav || pageId === 'unknown') return null;
  return { id: nav.id, label: nav.label, icon: nav.icon };
}
