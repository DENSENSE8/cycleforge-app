'use client';

/** Nav → {@link DeskPageChrome} adapter: */

import { createElement, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import {
  applyChildTarget,
  filterPageChildren,
  getSidebarPageNav,
  hasDeskPageChrome,
} from '@/lib/sidebar-navigation';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import type { DeskPageTab } from '@/design-system/components/DeskPageChrome';

interface DeskPageChromeTabs {
  /** The desk's page title — the nav entry's own `label`, so the header and the spine row say the same word by construction. */
  title: string;
  /**
   * Empty when the current page has not opted into `deskChrome` — the frame
   * then draws a header and a card with no tab row, which is the honest shape
   * for a single-surface desk.
   */
  tabs: DeskPageTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function useDeskPageChromeTabs(): DeskPageChromeTabs {
  const { user } = useAuth();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pageId, childId } = useActiveSidebarChild();

  /** The page's own nav entry, permission-filtered. */
  const page = useMemo(() => {
    const permissions = user?.permissions ? new Set(user.permissions) : undefined;
    const raw = getSidebarPageNav(pageId);
    return raw ? filterPageChildren(raw, permissions) : null;
  }, [user?.permissions, pageId]);

  /** Null unless this page draws its children as in-page tabs. */
  const tabbedPage = useMemo(
    () => (page && hasDeskPageChrome(page) ? page : null),
    [page],
  );

  const tabs = useMemo<DeskPageTab[]>(
    () =>
      (tabbedPage?.children ?? []).map((child) => {
        const ChildIcon = child.icon;
        return {
          id: child.id,
          label: child.label,
          icon: ChildIcon
            ? createElement(ChildIcon, {
                className: navIconStrokeClass('h-3.5 w-3.5 shrink-0'),
              })
            : undefined,
        };
      }),
    [tabbedPage],
  );

  const onTabChange = useCallback(
    (id: string) => {
      if (id === childId) return;
      const child = tabbedPage?.children?.find((c) => c.id === id);
      if (!child) return;
      const { pathname: nextPath, search } = applyChildTarget(
        { pathname, params: searchParams },
        child.to(),
      );
      router.push(search ? `${nextPath}?${search}` : nextPath);
    },
    [childId, tabbedPage, pathname, router, searchParams],
  );

  return {
    title: page?.label ?? '',
    tabs,
    // Nothing lit when no child resolves, rather than falling back to the first tab.
    activeTab: childId ?? '',
    onTabChange,
  };
}
