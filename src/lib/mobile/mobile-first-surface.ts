/**
 * Mobile-first surface predicate.
 *
 * Human SoT: docs/mobile-first/SURFACE_LAW.md
 *
 * Callers: `identity/switch-org.ts` (a switch started on a phone route lands
 * on `/m/home`, not the desk). No data schemas.
 */

export function isMobileFirstPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/m' || pathname.startsWith('/m/')) return true;
  return false;
}
