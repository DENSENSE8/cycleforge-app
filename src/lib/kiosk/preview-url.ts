/** Resolve the landscape kiosk shell URL for staff desktop preview. */

export const KIOSK_SHELL_PREVIEW_PATH = '/kiosk/v2';

export function resolveKioskShellPreviewUrl(
  _organizationSlug?: string | null | undefined,
): string {
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
