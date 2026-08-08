'use client';

/**
 * House page identity + CHILD-PAGE / station-subgroup switcher for GlobalHeader.
 *
 * Closed face = icon + display name for the current page (or active child).
 * On modeful pages (≥2 children) the face opens an {@link AnchoredLayer} over
 * this page's {@link SIDEBAR_PAGE_NAV} children and navigates via
 * {@link useSidebarChildNav}. First-class Receiving benches compose peers from
 * {@link stationSubgroupMembers} (same SoT as MasterNav) — never the legacy
 * `receiving` children list. Other modeless pages (Packing, Scan out, Search, …)
 * render the same face as a static identity chip — never return null just
 * because there is nothing to switch.
 *
 * Identity resolves from {@link SIDEBAR_PAGE_NAV}, falling back to
 * {@link APP_SIDEBAR_NAV} for top pins and other rows with no page-nav entry
 * so every signed-in desktop route that has a nav id shows a name.
 *
 * Menu chrome = {@link HeaderChromeMenu} / {@link HeaderChromeMenuItem} (shared
 * with Recents + Pins).
 *
 * **It survives the spine flatten deliberately.** The flatten made a page's
 * children ordinary spine rows, so this is a second door onto the same
 * destinations — but `ResponsiveLayout` holds `navOpen` in an unpersisted
 * `useState(false)`, so the spine is CLOSED on every cold load. Deleting the
 * switcher half would leave a bench operator with no visible way to switch a
 * page's children until they open a column that does not remember being open.
 */

import { useMemo, useRef, useState } from 'react';
import { AnchoredLayer, Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSidebarChildNav } from '@/components/sidebar/master-nav/useSidebarChildNav';
import {
  APP_SIDEBAR_NAV,
  filterPageChildren,
  getSidebarPageNav,
  getStationSubgroupDef,
  stationSubgroupMembers,
  stationSubgroupOfPage,
  type SidebarIconComponent,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import {
  HeaderChromeMenu,
  HeaderChromeMenuItem,
} from './header-chrome-menu';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  TOP_CHROME_ICON_GLYPH,
} from './header-shell';

/**
 * Shared face chrome — interactive Button and static chip stay pixel-matched.
 * Mute tone is owned by {@link HEADER_ICON_BTN_CLASS} (`text-text-muted`) —
 * same DS token as Recents / Pins / WO. Never re-declare `text-text-default`
 * here; that forked the page face from the rest of the nav cluster.
 */
const PAGE_FACE_CLASS = cn(
  HEADER_ICON_BTN_CLASS,
  // Beam-height face; w-auto so icon+label is not crushed to the icon-cell width.
  'inline-flex h-full min-h-8 w-auto shrink-0 select-none items-center justify-center gap-1 px-1.5',
  'text-role-caption font-medium transition-colors duration-150 ease-out',
);

type HeaderMenuRow = {
  id: string;
  label: string;
  icon: SidebarIconComponent;
};

type HeaderPageFace = {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  /** Modeful L2 children, or station-subgroup peers as menu rows. */
  menuRows?: HeaderMenuRow[];
  /** Active menu row id (child or first-class subgroup member). */
  activeRowId?: string;
  /** Menu aria-label (page label or subgroup name). */
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
  return !page.requires || (permissions?.has(page.requires) ?? false);
}

function resolveHeaderPage(
  pageId: string,
  permissions: ReadonlySet<string> | undefined,
): HeaderPageFace | null {
  const raw = getSidebarPageNav(pageId);
  if (raw) {
    const filtered = filterPageChildren(raw, permissions);
    const subgroup = stationSubgroupOfPage(filtered);
    // First-class subgroup leaves (Arrival / Unbox / …) — not the legacy
    // `receiving` family entry (which still has children for deep-links).
    if (subgroup && !filtered.children?.length) {
      const members = stationSubgroupMembers(subgroup).filter((p) =>
        pageVisible(p, permissions),
      );
      const active = members.find((m) => m.id === pageId) ?? members[0];
      const def = getStationSubgroupDef(subgroup);
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
          menuAriaLabel: def ? `${def.label} stations` : `${active.label} pages`,
          menuNav: 'page',
        };
      }
    }

    const children = filtered.children;
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

export function HeaderPageSwitcher() {
  const { user } = useAuth();
  const permissions = useMemo(
    () => (user?.permissions ? new Set(user.permissions) : undefined),
    [user?.permissions],
  );
  const { pageId, childId } = useActiveSidebarChild();
  const navigate = useSidebarChildNav();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const page = useMemo(
    () => resolveHeaderPage(pageId, permissions),
    [pageId, permissions],
  );

  const menuRows = page?.menuRows;
  const switchable = Boolean(menuRows && menuRows.length > 1);
  const resolvedRowId =
    page?.menuNav === 'page'
      ? page.activeRowId ?? pageId
      : childId;
  const activeRow =
    menuRows?.find((r) => r.id === resolvedRowId) ?? menuRows?.[0];

  if (!page) return null;

  const FaceIcon: SidebarIconComponent = activeRow?.icon ?? page.icon;
  const faceLabel = activeRow?.label ?? page.label;

  const select = (nextId: string) => {
    setOpen(false);
    if (nextId === resolvedRowId) return;
    if (page.menuNav === 'page') {
      navigate(nextId);
      return;
    }
    navigate(page.id, nextId);
  };

  if (!switchable) {
    return (
      <div className="relative flex h-full shrink-0 items-stretch">
        <span className={PAGE_FACE_CLASS} aria-label={page.label}>
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            <FaceIcon className="h-full w-full" aria-hidden />
          </span>
          <span className="max-w-[10rem] truncate">{faceLabel}</span>
        </span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative flex h-full shrink-0 items-stretch">
      <Button
        variant="ghost"
        size="sm"
        ariaLabel={`${page.menuAriaLabel ?? page.label} — ${faceLabel}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(PAGE_FACE_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
        icon={<FaceIcon className={TOP_CHROME_ICON_GLYPH} />}
      >
        <span className="max-w-[10rem] truncate">{faceLabel}</span>
      </Button>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
        gap={0}
      >
        <HeaderChromeMenu ariaLabel={page.menuAriaLabel ?? `${page.label} pages`}>
          {menuRows!.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === (resolvedRowId ?? activeRow?.id);
            return (
              <HeaderChromeMenuItem
                key={item.id}
                icon={<Icon />}
                label={item.label}
                active={isActive}
                activeCheck
                onClick={() => select(item.id)}
              />
            );
          })}
        </HeaderChromeMenu>
      </AnchoredLayer>
    </div>
  );
}
