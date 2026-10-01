import type { DeviceKind } from '@/lib/auth/session';

/**
 * Phone browsers that signed in through the web door are stored as `personal`.
 * `deviceKind === 'phone'` is only the QR/enrollment door, and its 4-hour
 * window must not be forced onto a warehouse phone that stays signed in.
 * The user agent on the session row was written by the server at sign-in.
 */
export function userAgentIsPhone(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (/iPad|Tablet/i.test(userAgent)) return false;
  return /iPhone|iPod|Android.*Mobile|Mobile.*Android|Windows Phone|IEMobile|webOS|BlackBerry/i.test(userAgent);
}

export function sessionIsPhoneExecution(session: {
  deviceKind: DeviceKind | string;
  userAgent: string | null;
}): boolean {
  return session.deviceKind === 'phone' || userAgentIsPhone(session.userAgent);
}
