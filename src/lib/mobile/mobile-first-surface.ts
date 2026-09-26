/** Mobile-first surface predicate. */

export function isMobileFirstPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/m' || pathname.startsWith('/m/')) return true;
  return false;
}
