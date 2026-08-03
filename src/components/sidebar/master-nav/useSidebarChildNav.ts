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

/**
 * The write half of the master nav (plan §3.3 + D2). `navigate(pageId, childId?)`:
 *   • No `childId` → land on the page's bare href (resolves to its default child).
 *   • With `childId` → apply that child's `to()` on top of the current params.
 *   • Page change → `router.push` (new history entry); same-page child flip →
 *     `router.replace` (matches what every panel does today, so back-button
 *     semantics are unchanged).
 * Unrelated query params are preserved on same-page flips via `applyChildTarget`.
 */
export function useSidebarChildNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (pageId: string, childId?: string) => {
      const page = getSidebarPageNav(pageId);
      const samePage = getSidebarNavPageId(pathname, searchParams) === pageId;

      // Single-surface page, unknown page, or "just go there": bare href.
      // Resolve through `getSidebarHref` so childless pages (operations, admin,
      // settings, …) — which aren't in SIDEBAR_PAGE_NAV — still land on their
      // real route instead of falling back to the current pathname (no-op).
      if (!page || !childId) {
        if (samePage && !childId) {
          // Re-click Search while already on `/search` — refocus the rail field.
          if (pageId === 'search') dispatchGlobalSearchFocus();
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
