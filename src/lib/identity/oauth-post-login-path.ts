/**
 * Where federated login lands after the umbrella session is minted.
 * Pure on purpose so the redirect contract is unit-tested with no DB.
 */

/** Paths the OAuth start query may name as the sign-in door. Anything else is `/signin`. */
export function resolveSigninDoorPath(signinPath: string | null | undefined): '/signin' | '/m/signin' {
  return signinPath === '/m/signin' ? '/m/signin' : '/signin';
}

/**
 * True when `url` is a path that stays on this origin. Same escapes as the
 * OAuth callback: `//evil.com`, `/\evil.com`, and tab/CR/LF collapsing.
 */
export function isSafeAppPath(url: string): boolean {
  if (!url.startsWith('/')) return false;
  const stripped = url.replace(/[\t\r\n]/g, '');
  return stripped.startsWith('/') && !stripped.startsWith('//') && !stripped.startsWith('/\\');
}

/**
 * Where the OAuth callback sends the browser after minting the umbrella session.
 *
 * Shared org → the existing staff-name picker on /signin (or /m/signin).
 * Individual org → `next` when it is a same-origin path, otherwise `/`.
 */
export function resolveOAuthPostLoginPath(input: {
  sharedStaffOrg: boolean;
  next: string | null | undefined;
  signinPath: string | null | undefined;
}): string {
  const nextRaw = (input.next ?? '').trim();
  const next = nextRaw && isSafeAppPath(nextRaw) ? nextRaw.replace(/[\t\r\n]/g, '') : '';

  if (!input.sharedStaffOrg) {
    return next || '/';
  }

  const params = new URLSearchParams();
  params.set('choose_staff', '1');
  if (next) params.set('next', next);
  return `${resolveSigninDoorPath(input.signinPath)}?${params.toString()}`;
}
