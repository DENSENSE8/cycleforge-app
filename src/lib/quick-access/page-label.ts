import { ADMIN_SECTION_OPTIONS, getAdminSection } from '@/components/admin/admin-sections';
import {
  SETTINGS_SECTION_OPTIONS,
  resolveSettingsSectionFromPath,
} from '@/components/settings/settings-sections';
import {
  isSidebarNavActive,
  masterNavItemForHref,
  masterNavItemForPath,
  masterNavLabelForPath,
  type SidebarNavItem,
} from '@/lib/sidebar-navigation';

export function resolveQuickAccessHref(
  pathname: string | null,
  searchParams: { toString(): string } | null,
): string {
  if (!pathname) return '';
  const search = searchParams?.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function specialSectionLabel(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname === '/signin') return 'Sign in';
  if (pathname === '/') return 'Home';

  const settingsFromPath = resolveSettingsSectionFromPath(pathname);
  if (settingsFromPath) {
    const opt = SETTINGS_SECTION_OPTIONS.find((s) => s.id === settingsFromPath);
    if (opt) return opt.label;
  }

  const section = searchParams.get('section');
  if (pathname === '/settings' && section) {
    const opt = SETTINGS_SECTION_OPTIONS.find((s) => s.id === section);
    if (opt) return opt.label;
  }

  if (pathname === '/admin' || pathname.startsWith('/admin')) {
    const resolved = getAdminSection(section);
    const opt = ADMIN_SECTION_OPTIONS.find((s) => s.value === resolved);
    if (opt) return opt.label;
    return 'Admin';
  }

  return null;
}

/**
 * Human-readable label for a stored quick-access href.
 * App surfaces use live MasterNav L1 names — never `document.title` and never
 * a stale parallel title map.
 */
export function resolveQuickAccessLabel(href: string): string {
  try {
    const url = new URL(href, 'http://local');
    const special = specialSectionLabel(url.pathname, url.searchParams);
    if (special) return special;
    return masterNavLabelForPath(url.pathname, url.searchParams);
  } catch {
    return href;
  }
}

/**
 * Label for pinning the current page. Same resolver as stored pins so a pin
 * taken on To-ship still reads Shipping.
 */
export function resolveQuickAccessLabelFromLocation(
  pathname: string | null,
  searchParams: { toString(): string } | null,
  _organizationName?: string | null,
): string {
  const href = resolveQuickAccessHref(pathname, searchParams);
  return href ? resolveQuickAccessLabel(href) : 'Page';
}

/** Paint-time pin copy: live MasterNav / settings / admin, else stored name. */
export function displayQuickAccessLabel(href: string, storedLabel: string): string {
  try {
    const url = new URL(href, 'http://local');
    const special = specialSectionLabel(url.pathname, url.searchParams);
    if (special) return special;
    const item = masterNavItemForPath(url.pathname, url.searchParams);
    if (item) return item.label;
  } catch {
    /* keep stored */
  }
  return storedLabel.trim() || resolveQuickAccessLabel(href);
}

export function masterNavFaceForPinHref(href: string): SidebarNavItem | undefined {
  return masterNavItemForHref(href);
}

/**
 * Same MasterNav L1 — Unbox with `?unboxview=` / table query, or a legacy
 * `/receiving` pin, is still Unbox. Not an exact href match.
 */
export function pinMatchesLocation(
  pinHref: string,
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): boolean {
  const here = masterNavItemForPath(pathname, searchParams ?? null);
  const pinItem = masterNavItemForHref(pinHref);
  if (here && pinItem) return here.id === pinItem.id;
  return isSidebarNavActive(pathname, pinHref);
}

export function pinsCoverPageId(
  pageId: string,
  pins: readonly { href: string }[],
): boolean {
  return pins.some((p) => masterNavItemForHref(p.href)?.id === pageId);
}

/** One current pin: exact href, else the query-less same-page pin, else first match. */
export function resolveActivePinHref(
  pins: readonly { href: string }[],
  currentHref: string,
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): string | null {
  if (pins.some((p) => p.href === currentHref)) return currentHref;
  const matches = pins.filter((p) =>
    pinMatchesLocation(p.href, pathname, searchParams),
  );
  if (matches.length === 0) return null;
  const canonical = matches.find((p) => {
    try {
      return new URL(p.href, 'http://local').search === '';
    } catch {
      return !p.href.includes('?');
    }
  });
  return (canonical ?? matches[0]!).href;
}

/**
 * Drop pages the Pinned cluster already lists. Industry standard: a pinned
 * row is *moved* to the top cluster, not copied — one destination, one row,
 * so the section below never repeats what Pinned already shows.
 */
export function pagesNotPinned<T extends { id: string }>(
  pages: readonly T[],
  pins: readonly { href: string }[],
): T[] {
  if (pins.length === 0) return [...pages];
  return pages.filter((page) => !pinsCoverPageId(page.id, pins));
}
