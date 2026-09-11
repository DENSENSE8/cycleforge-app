/**
 * Mobile-first surface — machine checklist (repo-wide).
 *
 * Human SoT: docs/mobile-first/SURFACE_LAW.md
 * Cursor: .cursor/rules/mobile-first-surface.mdc
 *
 * Callers: agents / future eval:cohort mobile-first / route audits.
 * No data schemas. Operator 2026-09-10: every product verb must be doable on
 * /m first; not warehouse-OS-only.
 * User: "span repo-wide" / "do everything on the mobile app first."
 */

/** Phone shell route prefixes that count as mobile SoT entrypoints. */
export const MOBILE_FIRST_ROUTE_PREFIXES = [
  '/m/home',
  '/m/work',
  '/m/pick',
  '/m/pack',
  '/m/scan',
  '/m/unbox',
  '/m/receive',
  '/m/receiving',
  '/m/triage',
  '/m/identify',
  '/m/checklist',
  '/m/print',
  '/m/orders',
  '/m/search',
  '/m/signin',
  '/m/qr-auth',
  // Callers: mobile nav. User: "mobile first design" / complete intake on phone.
  '/m/consult',
] as const;

export type MobileFirstRoutePrefix = (typeof MOBILE_FIRST_ROUTE_PREFIXES)[number];

/**
 * Product verbs that still need a dedicated `/m` SoT (or a documented embed
 * of an existing one) before desk-only UI is considered complete.
 * Grow this list as gaps are found — never shrink to excuse desktop-only.
 */
export const MOBILE_FIRST_VERB_GAPS = [
  {
    id: 'locations-labels',
    deskHint: '/inventory/locations?tab=labels',
    mobileSoT: '/m/print' as string | null,
    note: 'Port location label printer to /m before desk Labels is “done”.',
  },
  {
    id: 'locations-bays',
    deskHint: '/inventory/locations?tab=bays',
    mobileSoT: '/m/print' as string | null,
    note: 'Port bay label printer to /m.',
  },
  {
    id: 'locations-rooms',
    deskHint: '/inventory/locations?tab=rooms',
    mobileSoT: null as string | null,
    note: 'Rooms CRUD / browse on /m.',
  },
] as const;

export function isMobileFirstPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/m' || pathname.startsWith('/m/')) return true;
  return false;
}

export function hasRegisteredMobilePrefix(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return MOBILE_FIRST_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
