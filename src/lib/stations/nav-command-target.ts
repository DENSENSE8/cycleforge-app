/**
 * Resolve a {@link NavCommandDef} to a concrete `{ pathname, search }`.
 *
 * Split from `nav-command-codes.ts` on purpose: the registry is pure data and
 * stays free of the nav graph; this half reaches into `SIDEBAR_PAGE_NAV` for
 * the destination's own `to()` delta and hands it to `applyChildTarget`, which
 * already owns param isolation (construct-don't-copy at a migrated route).
 *
 * It also owns {@link navCommandPermission}: the gate is DERIVED from the nav
 * entry rather than copied onto the command, so a sticker can never disagree
 * with the page it opens. Checking it is still the CALLER's job, before it
 * navigates, because a refusal must nack at the scan bar rather than land the
 * operator on a denial page.
 */

import {
  applyChildTarget,
  getSidebarHref,
  getSidebarPageNav,
  resolveSidebarChild,
} from '@/lib/sidebar-navigation';
import type { NavCommandDef } from './nav-command-codes';

export interface NavCommandTarget {
  pathname: string;
  /** No leading `?`. Empty string when the destination carries no params. */
  search: string;
}

export interface NavCommandOrigin {
  pathname: string;
  params: URLSearchParams;
}

/**
 * The destination for `def` from `origin`, or null when the command names a
 * page/child this build does not have (a stale sticker after a nav rename).
 */
export function resolveNavCommandTarget(
  def: NavCommandDef,
  origin: NavCommandOrigin,
): NavCommandTarget | null {
  const page = getSidebarPageNav(def.pageId);

  if (def.childId) {
    const child = page?.children?.find((c) => c.id === def.childId);
    if (!child) return null;
    return applyChildTarget(origin, child.to());
  }

  const href = getSidebarHref(def.pageId);
  if (!href) return null;
  // A page href may itself carry params (`/dashboard?mode=sales`), so split it
  // rather than assuming a bare pathname.
  const [pathname, search = ''] = href.split('?');
  return applyChildTarget(origin, {
    pathname,
    params: Object.fromEntries(new URLSearchParams(search)),
  });
}

/**
 * The permission this command's destination requires, or null when the
 * destination is ungated (Home, Search).
 *
 * `child.requires ?? page.requires` is the same resolution `filterPageChildren`
 * and `pageVisible` use to decide whether to render the row at all — reading it
 * from the same place is what guarantees a scannable jump and a clickable one
 * are gated identically.
 */
export function navCommandPermission(def: NavCommandDef): string | null {
  const page = getSidebarPageNav(def.pageId);
  if (!page) return null;
  if (def.childId) {
    const child = page.children?.find((c) => c.id === def.childId);
    if (child?.requires) return child.requires;
  }
  return page.requires ?? null;
}

/**
 * True when the operator is already where the command would send them.
 *
 * Compared on the RESOLVED CHILD, not on the URL string: `/test` and
 * `/test?staff=7` are both Ready to Pack, and re-pushing the second as the
 * first would silently drop a filter the operator set by hand.
 */
export function isAlreadyAtNavCommand(
  def: NavCommandDef,
  origin: NavCommandOrigin,
): boolean {
  const page = getSidebarPageNav(def.pageId);
  const href = getSidebarHref(def.pageId);
  const basePath = (href ?? '').split('?')[0];
  if (!basePath) return false;
  const onPage =
    origin.pathname === basePath || origin.pathname.startsWith(`${basePath}/`);
  if (!onPage) return false;
  if (!def.childId || !page?.resolveChild) return true;
  return resolveSidebarChild(def.pageId, origin) === def.childId;
}
