'use client';

/**
 * Nav → {@link DeskPageChrome} adapter: a desk's page tabs ARE its former
 * `SIDEBAR_PAGE_NAV` children, and this is the one place that knows it.
 *
 * The chrome takes tabs as data and never reads the route; the nav entry keeps
 * owning the URL contract (`to()` writes it, `resolveChild()` reads it back).
 * Drawing the band from that same data is what stops the spine's idea of a
 * desk's pages and the desk's own tab strip from drifting apart.
 *
 * **The tab is a URL, not a param.** Shipping's three desk pages are already
 * route segments (`/shipping/orders|fba|labels`) — being on the path IS the
 * tab, so the band needs no `?tab=` of its own, nothing to declare with
 * `useSurfaceParamHygiene`, and every existing bookmark keeps working.
 *
 * Selecting the tab you are already on is a no-op: a child's `to()` constructs
 * a fresh param set (that is how leaving Labels drops its `?open=`), so
 * re-navigating to the lit tab would read as "clear my filters".
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import {
  applyChildTarget,
  filterPageChildren,
  getSidebarPageNav,
  hasDeskPageChrome,
} from '@/lib/sidebar-navigation';
import type { DeskPageTab } from './DeskPageChrome';

export interface DeskPageChromeTabs {
  /**
   * The desk's page title — the nav entry's own `label`, so the header and the
   * spine row say the same word by construction. Empty when the current page
   * has not opted into desk chrome.
   *
   * The PAGE label ("Shipping"), not the active child's ("To ship"): the child
   * is already named on the tab directly underneath, and a title that reprints
   * the lit tab is a row spent saying nothing.
   */
  title: string;
  /** Empty when the current page has not opted in — render the body bare. */
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

  const page = useMemo(() => {
    const permissions = user?.permissions ? new Set(user.permissions) : undefined;
    const raw = getSidebarPageNav(pageId);
    const filtered = raw ? filterPageChildren(raw, permissions) : null;
    return filtered && hasDeskPageChrome(filtered) ? filtered : null;
  }, [user?.permissions, pageId]);

  const tabs = useMemo<DeskPageTab[]>(
    () => (page?.children ?? []).map((child) => ({ id: child.id, label: child.label })),
    [page],
  );

  const onTabChange = useCallback(
    (id: string) => {
      if (id === childId) return;
      const child = page?.children?.find((c) => c.id === id);
      if (!child) return;
      const { pathname: nextPath, search } = applyChildTarget(
        { pathname, params: searchParams },
        child.to(),
      );
      router.push(search ? `${nextPath}?${search}` : nextPath);
    },
    [childId, page, pathname, router, searchParams],
  );

  return {
    title: page?.label ?? '',
    tabs,
    // Nothing lit when no child resolves, rather than falling back to the first
    // tab. Today the Support alias (`/shipping/orders?context=support`, a ticket
    // surface rather than a tab) is the only cause, but this deliberately does
    // not encode that: the previous version fell back to `tabs[0]`, and when
    // retiring Labels gave null a second cause the band started lighting To ship
    // on a page the operator was not on. A tab claiming to be somewhere you are
    // not is worse than an unlit band, which reads honestly as "none of these".
    activeTab: childId ?? '',
    onTabChange,
  };
}
