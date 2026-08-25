import { ADMIN_SECTION_OPTIONS, getAdminSection } from '@/lib/admin/admin-sections';
import {
  SETTINGS_SECTION_OPTIONS,
  resolveSettingsSectionFromPath,
} from '@/lib/settings/settings-sections';
import { PRODUCT_NAME } from '@/lib/branding/constants';
import { getSidebarTitle } from '@/lib/sidebar-titles';

export function resolveQuickAccessHref(
  pathname: string | null,
  searchParams: { toString(): string } | null,
): string {
  if (!pathname) return '';
  const search = searchParams?.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Human-readable label for a stored quick-access href. Uses route + query
 * metadata — never the generic document title / org name fallback.
 */
function resolveQuickAccessLabel(href: string): string {
  try {
    const url = new URL(href, 'http://local');
    const pathname = url.pathname;
    const section = url.searchParams.get('section');

    if (pathname === '/signin') return 'Sign in';
    if (pathname === '/') return 'Home';

    const settingsFromPath = resolveSettingsSectionFromPath(pathname);
    if (settingsFromPath) {
      const opt = SETTINGS_SECTION_OPTIONS.find((s) => s.id === settingsFromPath);
      if (opt) return opt.label;
    }

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

    return getSidebarTitle(pathname);
  } catch {
    return href;
  }
}

/**
 * Label for pinning the current page. Prefers a real page title when available,
 * otherwise falls back to route metadata.
 */
export function resolveQuickAccessLabelFromLocation(
  pathname: string | null,
  searchParams: { toString(): string } | null,
  organizationName?: string | null,
): string {
  if (typeof document !== 'undefined') {
    const title = document.title?.trim();
    if (title && title !== PRODUCT_NAME && title !== organizationName) return title;
  }
  const href = resolveQuickAccessHref(pathname, searchParams);
  return href ? resolveQuickAccessLabel(href) : 'Page';
}
