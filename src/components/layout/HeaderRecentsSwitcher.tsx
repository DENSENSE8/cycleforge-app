'use client';

/**
 * Cross-page MRU jump control for GlobalHeader (house SoT).
 * Closed = History icon ("More recent"); open = up to {@link MAX_RECENT_PAGES}
 * prior displays from {@link useRecentPages}. Navigates via
 * {@link useSidebarChildNav}. Collapsed by default — no always-visible chips
 * in the spine header (those were removed; this popover is the only MRU face).
 *
 * Menu chrome = {@link HeaderChromeMenu} / {@link HeaderChromeMenuItem} (shared
 * with Page + Pins).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnchoredLayer, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { History } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgNavItems } from '@/hooks/useOrgNavItems';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import {
  filterPageChildren,
  getSidebarPageNav,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSidebarChildNav } from '@/components/sidebar/master-nav/useSidebarChildNav';
import {
  MAX_RECENT_PAGES,
  useRecentPages,
} from '@/components/sidebar/master-nav/useRecentPages';
import { cn } from '@/utils/_cn';
import {
  HeaderChromeMenu,
  HeaderChromeMenuEmpty,
  HeaderChromeMenuItem,
} from './header-chrome-menu';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
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
  const navigate = useSidebarChildNav();
  const { recents: recentPageRefs, pushRecent } = useRecentPages();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Header is always-visible chrome — keep MRU fresh even when the spine is
  // collapsed (MasterNav no longer owns pushRecent).
  useEffect(() => {
    pushRecent(pageId, childId);
  }, [pageId, childId, pushRecent]);

  const navItems = useOrgNavItems({ permissions });
  const pages = useMemo(
    () => navItems.map(toPageNav).map((page) => filterPageChildren(page, permissions)),
    [navItems, permissions],
  );

  const hasChildPages = Boolean(
    pages.find((p) => p.id === pageId)?.children &&
      (pages.find((p) => p.id === pageId)?.children?.length ?? 0) > 1,
  );

  const entries = useMemo(() => {
    const currentKey = `${pageId}:${childId ?? ''}`;
    const out: {
      key: string;
      label: string;
      icon: SidebarPageNav['icon'];
      pageId: string;
      childId: string | null;
      href: string;
    }[] = [];
    for (const ref of recentPageRefs) {
      if (out.length >= MAX_RECENT_PAGES) break;
      const key = `${ref.pageId}:${ref.childId ?? ''}`;
      if (key === currentKey) continue;
      if (hasChildPages && ref.pageId === pageId) continue;
      const page = pages.find((p) => p.id === ref.pageId);
      if (!page) continue;
      const child = ref.childId ? page.children?.find((c) => c.id === ref.childId) : undefined;
      if (ref.childId && !child && page.children && page.children.length > 0) continue;
      const label =
        child && page.children && page.children.length > 1
          ? `${page.label} · ${child.label}`
          : child?.label ?? page.label;
      out.push({
        key,
        label,
        icon: child?.icon ?? page.icon,
        pageId: ref.pageId,
        childId: ref.childId,
        href: page.href,
      });
    }
    return out;
  }, [hasChildPages, recentPageRefs, pages, pageId, childId]);

  const select = useCallback(
    (entry: (typeof entries)[number]) => {
      setOpen(false);
      navigate(entry.pageId, entry.childId ?? undefined);
    },
    [navigate],
  );

  return (
    <div ref={wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label="More recent" asChild>
        <IconButton
          size="md"
          ariaLabel="More recent"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<History className={TOP_CHROME_ICON_FACE} />}
        />
      </HoverTooltip>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
        gap={0}
      >
        <HeaderChromeMenu ariaLabel="More recent displays">
          {entries.length === 0 ? (
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
      </AnchoredLayer>
    </div>
  );
}
