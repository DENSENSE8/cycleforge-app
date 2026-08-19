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
  TOP_CHROME_ICON_FACE,
} from './header-shell';

/**
 * Shared face chrome — interactive Button and static chip stay pixel-matched.
 *
 * **Quiet by design (2026-08-19).** This face names the page you are already
 * ON, so it is a READOUT, not a destination — it says where you are, and the
 * operator never needs to find it. It briefly ran at `role-title` (18px,
 * constant black) to match the spine row of the same name; at that size the
 * one thing on the beam that cannot be clicked-to-go-anywhere was also the
 * loudest thing on it, out-shouting Pins, Recents and the toggle beside it.
 * It is `role-caption` now — one step under the spine's `role-nav` rows — and
 * the LABEL alone takes `text-text-muted`, while the glyph keeps the beam's
 * shared ink from {@link HEADER_ICON_BTN_CLASS} so the icon row reads as one
 * set. Emphasis on this beam is contrast, never size or weight.
 */
const PAGE_FACE_CLASS = cn(
  HEADER_ICON_BTN_CLASS,
  // Beam-height face; w-auto so icon+label is not crushed to the icon-cell width.
  'inline-flex h-full min-h-8 w-auto shrink-0 select-none justify-center gap-1 px-1.5',
  // The face stays CENTRED in the beam so its glyph sits on the same row as
  // Panel · Pin · History beside it. Bottom-alignment is an INNER concern —
  // the icon+label group aligns on its own bottom edge (see PageFaceContent)
  // and that group is then centred as a unit. Bottom-aligning the face itself
  // pushed the glyph off the shared icon row, which is worse than the
  // misalignment it was fixing.
  'items-center',
  // `font-medium` is explicit because ONE branch is a `Button`, whose base
  // carries `font-semibold`; without it the interactive face would sit a weight
  // above its own static twin. Emphasis on this beam is contrast, not weight.
  'text-role-caption font-medium leading-none transition-colors duration-150 ease-out',
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
      <span className="flex min-w-0 items-end gap-1">
        <span className={cn(TOP_CHROME_ICON_FACE, 'flex shrink-0 items-center justify-center')}>
          <Icon className="h-full w-full" aria-hidden />
        </span>
        {/*
          `items-end` on the pair, `leading-none` on the word: the label's box is
          bottom-aligned to the glyph's, so the type sits on the icon's floor
          rather than on the middle of a line box taller than the glyph. The
          pair is 16px tall either way, so the beam still centres it on the same
          row as every other header glyph.
        */}
        <span className="max-w-[10rem] truncate text-text-muted" title={label}>{label}</span>
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
      <div className="relative flex h-full shrink-0 items-stretch">
        <span className={PAGE_FACE_CLASS} aria-label={page.label}>
          <PageFaceContent Icon={FaceIcon} label={faceLabel} />
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
      >
        <PageFaceContent Icon={FaceIcon} label={faceLabel} />
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
