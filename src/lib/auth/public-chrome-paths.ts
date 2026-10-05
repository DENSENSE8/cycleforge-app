/** Routes that render **public chrome** — the signed-out entry surfaces, which get a minimal provider tree instead of the warehouse app shell. */

import { PRINT_STATION_PATHS } from '@/lib/nav/route-tree';

/** Exact paths served with public chrome when signed out. */
const PUBLIC_CHROME_PATHS: ReadonlySet<string> = new Set([
  '/signin',
  '/signin/reset',
  '/signup',
  '/account/signin',
]);

/** Prefixes served with public chrome when signed out (share links). */
const PUBLIC_CHROME_PREFIXES: readonly string[] = ['/share/'];

export function isPublicChromePath(pathname: string): boolean {
  if (PUBLIC_CHROME_PATHS.has(pathname)) return true;
  return PUBLIC_CHROME_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Device surfaces served with public chrome EVEN WHEN a staff session exists:
 * the enrolled print station (`/print-station/device`) runs on its own device
 * credential, so the staff shell — and its `StaffPrintBridgeMount`, which would
 * make the computer a second, browser station — must never mount there.
 */
export function isDevicePublicChromePath(pathname: string): boolean {
  const device = PRINT_STATION_PATHS.device;
  return pathname === device || pathname.startsWith(`${device}/`);
}
