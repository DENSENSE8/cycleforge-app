/**
 * Routes that render **public chrome** — the signed-out entry surfaces, which
 * get a minimal provider tree instead of the warehouse app shell.
 *
 * The app shell exists to run a warehouse: an auth context, a realtime
 * connection, an activity inbox, staff colours, the assistant dock, the nav
 * spine, the responsive layout. A signed-out visitor on the sign-in card uses
 * none of it — the whole `/signin` subtree references no shell context at all —
 * but the root layout mounted the entire stack anyway, so the one PUBLIC route
 * in the app downloaded, parsed and hydrated the whole operator client before it
 * could show a password field. It measured 185KB of unused JavaScript and a
 * bootup of 1.2s on the mobile profile it is scored at.
 *
 * The branch is gated on there being NO user as well as on the path: a signed-in
 * operator who navigates back to `/signin` (switch workspace) still gets the
 * full shell, so nothing an authenticated session can reach changes.
 */

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
