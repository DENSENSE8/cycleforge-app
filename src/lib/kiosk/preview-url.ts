/**
 * Resolve the landscape kiosk shell URL for staff desktop preview.
 * Prefer the tenant kiosk origin so production staff-host `/kiosk/*` redirects
 * do not strip the `/kiosk/v2` path. Fall back to same-origin for local E2E.
 */

import { kioskOriginForSlug } from '@/lib/tenancy/kiosk-host';

export const KIOSK_SHELL_PREVIEW_PATH = '/kiosk/v2';

export function resolveKioskShellPreviewUrl(
  organizationSlug: string | null | undefined,
): string {
  const slug = String(organizationSlug ?? '').trim().toLowerCase();
  if (slug) {
    try {
      return `${kioskOriginForSlug(slug)}${KIOSK_SHELL_PREVIEW_PATH}`;
    } catch {
      /* invalid slug — fall through */
    }
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${KIOSK_SHELL_PREVIEW_PATH}`;
  }
  return KIOSK_SHELL_PREVIEW_PATH;
}

/** Open the landscape kiosk shell in a new tab (desktop testing). */
export function openKioskShellPreview(organizationSlug: string | null | undefined): void {
  const url = resolveKioskShellPreviewUrl(organizationSlug);
  window.open(url, '_blank', 'noopener,noreferrer');
}
