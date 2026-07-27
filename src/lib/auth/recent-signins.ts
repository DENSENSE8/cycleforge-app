/** Client-side "recent sign-ins" list for the staff picker (localStorage). */

export const RECENT_SIGNINS_KEY = 'cf.recentSignins';
export const MAX_RECENT_SIGNINS = 3;

export function readRecentSignins(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SIGNINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === 'number');
  } catch {
    return [];
  }
}

export function writeRecentSignin(staffId: number): void {
  try {
    const prev = readRecentSignins().filter((n) => n !== staffId);
    const next = [staffId, ...prev].slice(0, MAX_RECENT_SIGNINS);
    window.localStorage.setItem(RECENT_SIGNINS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Which sign-in method last worked on this device — used purely to promote that
 * one method on the next visit so the returning user doesn't re-scan the list.
 *
 * Redirect flows (OAuth / SSO / magic link) navigate away before we learn the
 * outcome, so those are recorded on *attempt*; password and passkey are recorded
 * on *success*. It is a display hint, never an authorization fact.
 */
export type SigninMethod =
  | 'password'
  | 'google'
  | 'microsoft'
  | 'sso'
  | 'magic-link'
  | 'passkey';

const LAST_SIGNIN_METHOD_KEY = 'cf.lastSigninMethod';

const SIGNIN_METHODS: readonly SigninMethod[] = [
  'password',
  'google',
  'microsoft',
  'sso',
  'magic-link',
  'passkey',
];

export function readLastSigninMethod(): SigninMethod | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_SIGNIN_METHOD_KEY);
    return SIGNIN_METHODS.includes(raw as SigninMethod) ? (raw as SigninMethod) : null;
  } catch {
    return null;
  }
}

export function writeLastSigninMethod(method: SigninMethod): void {
  try {
    window.localStorage.setItem(LAST_SIGNIN_METHOD_KEY, method);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Last email used at the email+password sign-in — prefilled on next visit. */
export const LAST_SIGNIN_EMAIL_KEY = 'cf.lastSigninEmail';

export function readLastSigninEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LAST_SIGNIN_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeLastSigninEmail(email: string): void {
  try {
    const trimmed = email.trim();
    if (!trimmed) return;
    window.localStorage.setItem(LAST_SIGNIN_EMAIL_KEY, trimmed);
  } catch {
    /* ignore quota / private mode */
  }
}
