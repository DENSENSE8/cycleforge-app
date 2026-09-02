import {
  masterNavLabelForPath,
} from '@/lib/sidebar-navigation';

/**
 * Resolve the MasterNav L1 title for a pathname.
 *
 * SoT is {@link APP_SIDEBAR_NAV} via {@link masterNavLabelForPath} — never a
 * parallel map (`Media` vs Media Library, `Testing` vs Quality Control).
 * Pass search params so `/test?view=testing` and `/shipping/scan-out` resolve
 * to the same words as the spine.
 */
export function getSidebarTitle(
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): string {
  return masterNavLabelForPath(pathname, searchParams);
}
