'use client';

/**
 * House CHILD-PAGE switcher for GlobalHeader (renamed from HeaderModeSwitcher
 * 2026-08-03 — a "mode" is a child page).
 *
 * Closed = the active child's icon; open = AnchoredLayer over this page's
 * {@link SIDEBAR_PAGE_NAV} children. Navigates via {@link useSidebarChildNav}.
 * Returns null on a page with fewer than two children.
 *
 * **It survives the spine flatten deliberately.** The flatten made a page's
 * children ordinary spine rows, so this is a second door onto the same
 * destinations — but `ResponsiveLayout` holds `navOpen` in an unpersisted
 * `useState(false)`, so the spine is CLOSED on every cold load. Deleting this
 * would leave a bench operator with no visible way to switch a page's children
 * until they open a column that does not remember being open.
 */

import { useMemo, useRef, useState } from 'react';
import { AnchoredLayer, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSidebarChildNav } from '@/components/sidebar/master-nav/useSidebarChildNav';
import {
  filterPageChildren,
  getSidebarPageNav,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from './header-shell';

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

  const page = useMemo(() => {
    const raw = getSidebarPageNav(pageId);
    return raw ? filterPageChildren(raw, permissions) : null;
  }, [pageId, permissions]);

  const children = page?.children;
  const hasChildPages = Boolean(children && children.length > 1);
  const active = children?.find((c) => c.id === childId) ?? children?.[0];

  if (!hasChildPages || !active || !page) return null;

  const ActiveIcon = active.icon;

  const select = (nextId: string) => {
    setOpen(false);
    if (nextId !== childId) navigate(pageId, nextId);
  };

  return (
    <div ref={wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label={`Page — ${active.label}`} asChild>
        <IconButton
          size="md"
          ariaLabel={`${page.label} page — ${active.label}`}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<ActiveIcon className={TOP_CHROME_ICON_GLYPH} />}
        />
      </HoverTooltip>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
        gap={8}
      >
        <div
          role="menu"
          aria-label={`${page.label} pages`}
          className="min-w-[11rem] overflow-hidden rounded-xl border border-border-soft bg-surface-card p-1 shadow-[0_12px_40px_rgba(20,30,55,0.16)]"
        >
          {children!.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === (childId ?? active.id);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => select(item.id)}
                className={cn(
                  'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-default',
                  'hover:bg-surface-sunken',
                  focusRing('control', 'accent'),
                  isActive && 'bg-surface-sunken font-medium',
                )}
              >
                <Icon className={cn(TOP_CHROME_ICON_GLYPH, 'shrink-0 text-text-muted')} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {isActive ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </AnchoredLayer>
    </div>
  );
}
