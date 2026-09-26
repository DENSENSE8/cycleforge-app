/** Resolve a {@link NavCommandDef} to a concrete `{ pathname, search }`. */

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

/** The permission this command's destination requires, or null when the destination is ungated (Home, Search). */
export function navCommandPermission(def: NavCommandDef): string | null {
  const page = getSidebarPageNav(def.pageId);
  if (!page) return null;
  if (def.childId) {
    const child = page.children?.find((c) => c.id === def.childId);
    if (child?.requires) return child.requires;
  }
  return page.requires ?? null;
}

/** True when the operator is already where the command would send them. */
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
