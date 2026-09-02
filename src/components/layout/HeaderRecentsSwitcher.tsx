'use client';

/**
 * Header door for this staffer's work sessions.
 *
 * Closed face / menu copy and glyphs come from {@link APP_SIDEBAR_NAV}
 * MasterNav L1 rows — never desk-tab compounds (`Shipping · To ship`) and
 * never session.title.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { History } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgNavItems } from '@/hooks/useOrgNavItems';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import {
  filterPageChildren,
  getMasterNavItem,
  getSidebarPageNav,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSidebarChildNav } from '@/components/sidebar/master-nav/useSidebarChildNav';
import {
  recentsAsMasterNavRows,
  useRecentPages,
} from '@/components/sidebar/master-nav/useRecentPages';
import { cn } from '@/utils/_cn';
import {
  HeaderChromeMenu,
  HeaderChromeMenuEmpty,
  HeaderChromeMenuItem,
  HeaderChromeMenuLayer,
} from './header-chrome-menu';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  HEADER_PAGE_FACE_WIDTH,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  return page ? { ...page, icon: item.icon, label: item.label } : item;
}

export function HeaderRecentsSwitcher() {
  const { user } = useAuth();
  const permissions = useMemo(
    () => (user?.permissions ? new Set(user.permissions) : undefined),
    [user?.permissions],
  );
  const { pageId, childId } = useActiveSidebarChild();
  const pathname = usePathname();
  const navigate = useSidebarChildNav();
  const { recents: recentPageRefs, recentsReady, pushRecent } = useRecentPages();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pageId || pageId === 'unknown') return;
    pushRecent(pageId, childId);
  }, [pageId, childId, pushRecent]);

  const navItems = useOrgNavItems({ permissions });
  const pages = useMemo(
    () => navItems.map(toPageNav).map((page) => filterPageChildren(page, permissions)),
    [navItems, permissions],
  );

  const entries = useMemo(() => {
    if (!recentsReady) return [];
    const out: {
      key: string;
      label: string;
      icon: SidebarPageNav['icon'];
      pageId: string;
      childId: string | null;
      href: string;
    }[] = [];
    for (const ref of recentsAsMasterNavRows(recentPageRefs, pageId, childId, pathname)) {
      const page = pages.find((p) => p.id === ref.pageId);
      if (!page) continue;
      const child = ref.childId ? page.children?.find((c) => c.id === ref.childId) : undefined;
      out.push({
        key: page.id,
        label: page.label,
        icon: page.icon,
        pageId: page.id,
        childId: child?.id ?? null,
        href: page.href,
      });
    }
    return out;
  }, [recentPageRefs, recentsReady, pages, pageId, childId, pathname]);

  const select = useCallback(
    (entry: (typeof entries)[number]) => {
      setOpen(false);
      navigate(entry.pageId, entry.childId ?? undefined);
    },
    [navigate],
  );

  const currentNav = pageId !== 'unknown' ? getMasterNavItem(pageId) : undefined;
  const FaceIcon = currentNav?.icon;
  const faceLabel = currentNav?.label ?? null;

  return (
    <div
      ref={wrapRef}
      className={cn(HEADER_ICON_WRAP, faceLabel && HEADER_PAGE_FACE_WIDTH)}
    >
      {faceLabel ? (
        <HoverTooltip label={faceLabel} disabled={open} asChild>
          <button
            type="button"
            aria-label={faceLabel}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              HEADER_ICON_BTN_CLASS,
              DROPDOWN_SHELL_CORNER,
              open && HEADER_ICON_BTN_OPEN_CLASS,
      'flex h-full min-w-0 w-full select-none items-center justify-start gap-1 px-1.5',
              'text-role-body font-medium leading-none',
            )}
          >
            {FaceIcon ? (
              <FaceIcon className={cn(TOP_CHROME_ICON_FACE, 'shrink-0')} />
            ) : (
              <History className={cn(TOP_CHROME_ICON_FACE, 'shrink-0')} />
            )}
            <span className="min-w-0 flex-1 truncate text-left text-text-muted">{faceLabel}</span>
          </button>
        </HoverTooltip>
      ) : (
        <HoverTooltip label="More recent" disabled={open} asChild>
          <IconButton
            size="md"
            ariaLabel="More recent"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              HEADER_ICON_BTN_CLASS,
              DROPDOWN_SHELL_CORNER,
              open && HEADER_ICON_BTN_OPEN_CLASS,
            )}
            icon={<History className={TOP_CHROME_ICON_FACE} />}
          />
        </HoverTooltip>
      )}

      <HeaderChromeMenuLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
      >
        <HeaderChromeMenu ariaLabel="More recent">
          {!recentsReady ? null : entries.length === 0 ? (
            <HeaderChromeMenuEmpty>No recent displays</HeaderChromeMenuEmpty>
          ) : (
            entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <HeaderChromeMenuItem
                  key={entry.key}
                  icon={<Icon />}
                  label={entry.label}
                  onClick={() => select(entry)}
                  onMouseEnter={() => prefetchNavData(entry.href, queryClient)}
                />
              );
            })
          )}
        </HeaderChromeMenu>
      </HeaderChromeMenuLayer>
    </div>
  );
}
