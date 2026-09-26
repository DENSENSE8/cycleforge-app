'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { dispatchGlobalSearchFocus } from '@/lib/global-search-focus';
import {
  applyChildTarget,
  getSidebarHref,
  getSidebarNavPageId,
  getSidebarPageNav,
} from '@/lib/sidebar-navigation';

/** The write half of the master nav (plan §3.3 + D2). */
export function useSidebarChildNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (pageId: string, childId?: string) => {
      const page = getSidebarPageNav(pageId);
      const samePage = getSidebarNavPageId(pathname, searchParams) === pageId;

      // Single-surface page, unknown page, or "just go there":
      if (!page || !childId) {
        // Search is header-find only — never push bare `/search` (blank page).
        if (pageId === 'search') {
          dispatchGlobalSearchFocus();
          return;
        }
        if (samePage && !childId) {
          return;
        }
        const href = getSidebarHref(pageId) ?? pathname ?? '/';
        router.push(href);
        return;
      }

      const child = page.children?.find((c) => c.id === childId);
      if (!child) {
        router.push(page.href);
        return;
      }

      const base = samePage
        ? { pathname: pathname ?? page.href, params: searchParams }
        : { pathname: page.href, params: new URLSearchParams() };
      const { pathname: nextPath, search } = applyChildTarget(base, child.to());
      const url = search ? `${nextPath}?${search}` : nextPath;

      if (samePage) router.replace(url);
      else router.push(url);
    },
    [router, pathname, searchParams],
  );
}
