/**
 * Dogfood prod-surface parking — nav + URL soft-gate.
 *
 * Surfaces listed here are off the master nav (`PARKED_SIDEBAR_NAV_IDS`) and,
 * by default, render `ParkedSurface` instead of the real workspace (main content
 * + sidebar context). Unlock the real UI only with
 * `DOGFOOD_FULL_SURFACE` / `NEXT_PUBLIC_DOGFOOD_FULL_SURFACE` (topic worktrees).
 *
 * @see src/components/dogfood/DogfoodSurfaceGate.tsx
 * @see src/lib/sidebar-navigation.ts (APP_SIDEBAR_NAV omits these ids)
 */

export const PARKED_SURFACE_KEYS = [
  'home',
  'sourcing',
  'inventory',
  'warehouse',
  'fba',
  'studio',
  'ai-chat',
] as const;

export type ParkedSurfaceKey = (typeof PARKED_SURFACE_KEYS)[number];

/** Same membership as `PARKED_SURFACE_KEYS` — used by nav tests + gate. */
export const PARKED_SIDEBAR_NAV_IDS = new Set<string>(PARKED_SURFACE_KEYS);

export interface ParkedSurfaceMeta {
  key: ParkedSurfaceKey;
  /** Human label (matches former nav label). */
  label: string;
  /** Canonical path for this surface (deep-link / docs). */
  href: string;
  /** One-line why it's parked. */
  blurb: string;
  /** Primary CTA for daily ops. */
  primaryCta: { href: string; label: string };
  /** Optional secondary CTA. */
  secondaryCta?: { href: string; label: string };
}

export const PARKED_SURFACE_META: Record<ParkedSurfaceKey, ParkedSurfaceMeta> = {
  home: {
    key: 'home',
    label: 'Home',
    href: '/',
    blurb: 'We’re still building this view. Your day-to-day work lives in shipping and the stations.',
    primaryCta: { href: '/dashboard', label: 'Go to Orders / Shipping' },
    secondaryCta: { href: '/pack', label: 'Open Packing' },
  },
  sourcing: {
    key: 'sourcing',
    label: 'Sourcing',
    href: '/sourcing',
    blurb: 'Sourcing is still being built. You can keep working from orders and receiving for now.',
    primaryCta: { href: '/dashboard', label: 'Go to Orders / Shipping' },
    secondaryCta: { href: '/unbox', label: 'Open Unbox' },
  },
  inventory: {
    key: 'inventory',
    label: 'Inventory',
    href: '/inventory',
    blurb: 'This inventory workspace is still in progress. Stock work continues through packing and receiving.',
    primaryCta: { href: '/dashboard', label: 'Go to Orders / Shipping' },
    secondaryCta: { href: '/pack', label: 'Open Packing' },
  },
  warehouse: {
    key: 'warehouse',
    label: 'Warehouse',
    href: '/warehouse',
    blurb: 'Warehouse map and bins are still in progress. Receiving and shipping remain available.',
    primaryCta: { href: '/unbox', label: 'Open Unbox' },
    secondaryCta: { href: '/dashboard', label: 'Go to Orders / Shipping' },
  },
  fba: {
    key: 'fba',
    label: 'FBA prep',
    href: '/fba',
    blurb: 'FBA prep is still in progress. For outbound work, use Orders / Shipping or labels.',
    primaryCta: { href: '/dashboard', label: 'Go to Orders / Shipping' },
    secondaryCta: { href: '/outbound', label: 'Open Outbound labels' },
  },
  studio: {
    key: 'studio',
    label: 'Studio',
    href: '/studio',
    blurb: 'Studio is still in progress. Floor activity is available under Operations.',
    primaryCta: { href: '/operations', label: 'Go to Operations' },
    secondaryCta: { href: '/dashboard', label: 'Go to Orders / Shipping' },
  },
  'ai-chat': {
    key: 'ai-chat',
    label: 'AI Chat',
    href: '/ai-chat',
    blurb: 'This chat workspace is still in progress. You can continue from Operations or shipping.',
    primaryCta: { href: '/operations', label: 'Go to Operations' },
    secondaryCta: { href: '/dashboard', label: 'Go to Orders / Shipping' },
  },
};

function envTruthy(name: string): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return false;
  const n = raw.trim().toLowerCase();
  return n === '1' || n === 'true' || n === 'on' || n === 'yes';
}

/**
 * When true, mount the real parked-page workspace (main + sidebar context).
 * When false, show `ParkedSurface` stand-ins instead.
 *
 * **Default is parked** everywhere (local, Preview, Production). Unlock only via:
 *   - `DOGFOOD_FULL_SURFACE=1` (server)
 *   - `NEXT_PUBLIC_DOGFOOD_FULL_SURFACE=1` (client shell + server)
 * Topic worktrees set these in `.env.local` while working on a parked surface.
 */
export function isParkedSurfaceLive(): boolean {
  return (
    envTruthy('DOGFOOD_FULL_SURFACE') || envTruthy('NEXT_PUBLIC_DOGFOOD_FULL_SURFACE')
  );
}

/** True when this route key is a parked surface **and** the real UI is locked. */
export function isParkedSurfaceBlocked(routeKey: string | null | undefined): boolean {
  if (!routeKey || !isParkedSurfaceKey(routeKey)) return false;
  return !isParkedSurfaceLive();
}

export function isParkedSurfaceKey(id: string): id is ParkedSurfaceKey {
  return PARKED_SIDEBAR_NAV_IDS.has(id);
}

export function getParkedSurfaceMeta(key: ParkedSurfaceKey): ParkedSurfaceMeta {
  return PARKED_SURFACE_META[key];
}
