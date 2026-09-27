/**
 * Shared org/workspace switch helpers.
 * the new tenant. The landing URL RESPECTS THE SURFACE (operator 2026-09-15):
 */

import { isMobileFirstPath } from '@/lib/mobile/mobile-first-surface';
import { resolveLandingPath, withWelcomeHandoff } from '@/lib/auth/landing-path';

export function orgInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'W'
  );
}

/** Map a switch-org error code to a friendly, human line. */
function switchOrgErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'MULTI_ORG_NOT_PROVISIONED':
      return 'Multi-workspace switching isn’t set up for this account yet. Contact your administrator.';
    case 'NOT_A_MEMBER':
      return 'You’re not a member of that workspace.';
    case 'NOT_AUTHENTICATED':
      return 'Your session has expired — please sign in again.';
    default:
      return 'Couldn’t switch workspace. Please try again.';
  }
}

type SwitchOrgResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * POST /api/auth/switch-org. On success, hard-navigates (does not return) to
 * the target profile's SURFACE-AWARE landing (`resolveLandingPath`, mobile when
 * the switch started on a phone route); a desktop landing plays the welcome
 * for the new profile via `?welcome=1`. On failure, returns a friendly error
 * string.
 */
export async function requestSwitchOrg(organizationId: string): Promise<SwitchOrgResult> {
  try {
    const r = await fetch('/api/auth/switch-org', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId }),
    });
    const data = (await r.json().catch(() => ({}))) as {
      error?: string;
      role?: string | null;
      defaultHomePath?: string | null;
      defaultHomePathMobile?: string | null;
    };
    if (!r.ok) {
      return { ok: false, error: switchOrgErrorMessage(data.error) };
    }
    const mobile = isMobileFirstPath(window.location.pathname);
    const landing = resolveLandingPath({
      role: data.role,
      defaultHomePath: data.defaultHomePath,
      defaultHomePathMobile: data.defaultHomePathMobile,
      mobile,
    });
    // Hard reload — NOT router.push.
    window.location.assign(mobile ? landing : withWelcomeHandoff(landing));
    return { ok: true };
  } catch {
    return { ok: false, error: switchOrgErrorMessage(undefined) };
  }
}
