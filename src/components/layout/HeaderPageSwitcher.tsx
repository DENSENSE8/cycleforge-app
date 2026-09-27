'use client';

/**
 * Identity + switcher for GlobalHeader.
 * {@link DeskPageChrome} already owns the page title (operator 2026-08-31).
 */

import { useMemo, useRef, useState } from 'react';
import { AnchoredLayer } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSidebarChildNav } from '@/components/sidebar/master-nav/useSidebarChildNav';
import { type SidebarIconComponent } from '@/lib/sidebar-navigation';
import { resolveHeaderPage } from './header-page-face';
import { cn } from '@/utils/_cn';
import {
  HeaderChromeMenu,
  HeaderChromeMenuItem,
} from './header-chrome-menu';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_PAGE_FACE_WIDTH,
  HEADER_PAGE_MENU_SCROLL_CLASS,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

/** Shared face chrome — menu trigger and static chip stay pixel-matched. */
/** Host that owns the face width — the dropdown anchors to this box. */
const PAGE_FACE_WRAP_CLASS = cn(
  'relative flex h-full shrink-0 items-center',
  HEADER_PAGE_FACE_WIDTH,
);

/** A 32px rounded chip — the header key's corner and the search well's hairline ring. */
const PAGE_FACE_CLASS = cn(
  HEADER_ICON_BTN_CLASS,
  'flex h-8 min-w-0 w-full select-none items-center justify-start gap-1 px-1.5',
  'bg-surface-card ring-1 ring-inset ring-border-hairline',
  'text-role-body font-medium leading-none',
  focusRing('control', 'accent'),
);

/** The face's content — ONE render for the static chip and the menu trigger. */
function PageFaceContent({ Icon, label }: { Icon: SidebarIconComponent; label: string }) {
  return (
    <>
      {/* The glyph is a plain child span, never `Button`'s `icon` prop: */}
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className={cn(TOP_CHROME_ICON_FACE, 'flex shrink-0 items-center justify-center')}>
          <Icon className="h-full w-full" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-text-muted" title={label}>{label}</span>
      </span>
    </>
  );
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

  if (!page || !switchable) return null;

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
        gap={4}
      >
        <HeaderChromeMenu
          ariaLabel={page.menuAriaLabel ?? `${page.label} pages`}
          className={cn(HEADER_PAGE_FACE_WIDTH, 'min-w-0', HEADER_PAGE_MENU_SCROLL_CLASS)}
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
