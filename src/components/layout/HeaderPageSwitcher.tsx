'use client';

/**
 * House page identity + CHILD-PAGE / station-subgroup switcher for GlobalHeader.
 *
 * Closed face = icon + display name for the current page (or active child).
 * Compact {@link HEADER_PAGE_FACE_WIDTH} chip — same width as the open menu.
 * Find sits flush to its right. Never a beam-filling bar.
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
import { AnchoredLayer } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
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
  HEADER_PAGE_FACE_WIDTH,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

/**
 * Shared face chrome — menu trigger and static chip stay pixel-matched.
 *
 * **Quiet label, `role-body` (2026-08-20).** This face names the page you
 * are already ON — a READOUT, not a destination — so the LABEL alone stays
 * `text-text-muted` (the 2026-08-19 "quiet by design" ruling: it is the one
 * thing on the beam that cannot be clicked-to-go-anywhere, and full ink here
 * out-shouted Pins / Recents / the toggle beside it). Size moved up a step
 * same-day, `role-caption` (12px) → `role-body` (14px), to match the
 * spine's same-day label bump (`SidebarNavList.tsx`) — quiet and legible are
 * independent axes; the mute ruling only ever governed ink. The glyph keeps
 * the beam's shared full-ink token from {@link HEADER_ICON_BTN_CLASS}
 * unchanged, so only the label is quiet, never the icon.
 */
/** Host that owns the face width — the dropdown anchors to this box. */
const PAGE_FACE_WRAP_CLASS = cn(
  'relative flex h-full shrink-0 items-stretch',
  HEADER_PAGE_FACE_WIDTH,
);

const PAGE_FACE_CLASS = cn(
  HEADER_ICON_BTN_CLASS,
  'flex h-full min-h-8 min-w-0 w-full select-none items-center justify-start gap-1 px-1.5',
  'bg-surface-card',
  'text-role-body font-medium leading-none',
  focusRing('control', 'accent'),
);

/** The face's content — ONE render for the static chip and the menu trigger. */
function PageFaceContent({ Icon, label }: { Icon: SidebarIconComponent; label: string }) {
  return (
    <>
      {/*
        The glyph is a plain child span, never `Button`'s `icon` prop: that prop
        wraps the node in `iconBox[size]` and forces `[&>svg]:h-full`, so a
        `size="sm"` Button drew this at **14px** while every other beam glyph —
        including this face's own static twin — drew at 16px. The prop silently
        overrode the size token, which is why "the icon sizing doesn't match"
        survived a pass that set the token correctly.
      */}
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className={cn(TOP_CHROME_ICON_FACE, 'flex shrink-0 items-center justify-center')}>
          <Icon className="h-full w-full" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-text-muted" title={label}>{label}</span>
      </span>
    </>
  );
}

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
      <div className={PAGE_FACE_WRAP_CLASS}>
        <span className={PAGE_FACE_CLASS} aria-label={page.label}>
          <PageFaceContent Icon={FaceIcon} label={faceLabel} />
        </span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={PAGE_FACE_WRAP_CLASS}>
      <button
        type="button"
        aria-label={`${page.menuAriaLabel ?? page.label} — ${faceLabel}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(PAGE_FACE_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
      >
        <PageFaceContent Icon={FaceIcon} label={faceLabel} />
      </button>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-stretch"
        gap={0}
      >
        <HeaderChromeMenu
          ariaLabel={page.menuAriaLabel ?? `${page.label} pages`}
          className={cn(HEADER_PAGE_FACE_WIDTH, 'min-w-0')}
        >
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
