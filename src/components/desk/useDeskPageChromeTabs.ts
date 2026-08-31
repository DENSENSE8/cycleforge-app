'use client';

/**
 * Nav → {@link DeskPageChrome} adapter: a desk's page tabs ARE its former
 * `SIDEBAR_PAGE_NAV` children, and this is the one place that knows it.
 *
 * It lives in the APP, not the design system, on purpose. `DeskPageChrome`
 * moved into `@/design-system/components/desk` on 2026-08-31 as the one page
 * frame; a design-system component that imported `sidebar-navigation`,
 * `AuthContext` and `next/navigation` would have dragged the whole app spine
 * into the system it is supposed to be independent of. So the system takes
 * data, and this is the file that knows where the data comes from.
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
import type { DeskPageTab } from '@/design-system/components/DeskPageChrome';

export interface DeskPageChromeTabs {
  /**
   * The desk's page title — the nav entry's own `label`, so the header and the
   * spine row say the same word by construction. Empty only when the path
   * resolves to no nav page at all.
   *
   * The PAGE label ("Shipping"), not the active child's ("To ship"): the child
   * is already named on the tab directly underneath, and a title that reprints
   * the lit tab is a row spent saying nothing.
   */
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

  /**
   * The page's own nav entry, permission-filtered. Resolved WITHOUT the
   * desk-chrome gate, because the title and the tabs are two questions:
   *
   * - **Title** — every page has a name, tabs or not. A single-surface desk
   *   (Inbound, Support, Studio, Reports) wears the same header as a multi-tab
   *   one and simply draws no tab row, so gating the title on `deskChrome`
   *   printed an empty `<h1>` on exactly the pages that most needed a name.
   * - **Tabs** — only a page that opted in draws them, because opting in is
   *   what withdraws the spine's drill-down. Drawing tabs for a page whose
   *   children are still spine rows would state the same navigation twice.
   */
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
      (tabbedPage?.children ?? []).map((child) => ({ id: child.id, label: child.label })),
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
