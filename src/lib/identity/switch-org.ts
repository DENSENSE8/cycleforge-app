/**
 * Shared org/workspace switch helpers.
 *
 * The spine footer workspace rows (`SpineWorkspaceSwitch`, inside the account
 * ⋯ menu at the bottom of the nav) and Settings → Organization compose from
 * this module — never fork a second fetch / error map / hard-reload contract.
 *
 * switch-org response shape (see src/app/api/auth/switch-org):
 *   200 { ok: true, organizationId, unchanged?: true, staffId?, session? }
 *   400 { error: 'INVALID_REQUEST' }    409 { error: 'MULTI_ORG_NOT_PROVISIONED' }
 *   401 { error: 'NOT_AUTHENTICATED' }  403 { error: 'NOT_A_MEMBER' }
 *   500 { error: 'INTERNAL' }
 *
 * On success the server revokes the old session and mints a new one for the
 * target org's staff profile, so callers HARD-reload to `/dashboard` — never
 * router.push — to reset React Query caches, Ably subscriptions, and the RLS
 * GUC cleanly to the new tenant.
 */

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
 * POST /api/auth/switch-org. On success, hard-navigates to `/dashboard`
 * (does not return). On failure, returns a friendly error string.
 */
export async function requestSwitchOrg(organizationId: string): Promise<SwitchOrgResult> {
  try {
    const r = await fetch('/api/auth/switch-org', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId }),
    });
    if (!r.ok) {
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: switchOrgErrorMessage(data.error) };
    }
    // Hard reload — NOT router.push.
    window.location.assign('/dashboard');
    return { ok: true };
  } catch {
    return { ok: false, error: switchOrgErrorMessage(undefined) };
  }
}
