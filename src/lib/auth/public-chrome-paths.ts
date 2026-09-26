/** Routes that render **public chrome** — the signed-out entry surfaces, which get a minimal provider tree instead of the warehouse app shell. */

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
