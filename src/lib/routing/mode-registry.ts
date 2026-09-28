/**
 * The route → task-mode registry (BRIEF §6: "the mode is decided by the job in
 * the region" — route + region → mode, fixed). DECLARED, not derived: every
 * page under `src/app` must resolve to an entry here (`mode-registry.test.ts`),
 * and the app frame applies the page's mode once (`RouteModeRegion`), so a
 * page cannot forget one.
 *
 * `runtime` — the route's own layout declares the mode because it switches
 * while the page is open. Only `/shipping` does (Floor ⇄ triage,
 * `src/app/shipping/layout.tsx`).
 *
 * Portals that escape the page's DOM (dialogs, sheets, the right rail, the
 * command palette) keep their own `ModeRegion` — they are not pages.
 */

import type { ModeLookName, ModeName } from '@/design-system/modes/registry';

export type RouteMode = ModeName | 'runtime';

export interface ModeRouteEntry {
  /** Path prefix (`/inventory` owns `/inventory/stock`), or the whole path when `exact`. */
  route: string;
  mode: RouteMode;
  /** Match `route` itself only, never its children. */
  exact?: true;
  /**
   * TRIAGE ONLY (owner 2026-09-27): the declared `triage` holds on a phone and
   * a touch screen too instead of collapsing to `industrial` — a form (the new
   * sales order) or a one-job desk that never offers Floor (Labels & docs).
   * The lane-policy pass (`HANDOFF-lane-mode-policy.md`) turns this into the
   * `triage` policy.
   */
  form?: true;
  /**
   * A job LOOK over the declared mode (`MODE_LOOKS`): the region stamps it
   * where the mode resolves. A `runtime` route's layout applies it, and a
   * look route never takes the layout's Floor.
   */
  look?: ModeLookName;
}

const DESK_TRIAGE_ROUTES = [
  // Outbound + sales
  '/counter', '/fba', '/pack', '/packer', '/pick', '/pickup', '/walk-in', '/tracking-exceptions',
  // Inbound
  '/incoming', '/triage', '/receiving', '/unbox', '/carton',
  // Inventory + warehouse
  '/inventory', '/warehouse', '/replenish', '/bin',
  // Repair + test
  '/repair', '/tech', '/test', '/wipe',
  // Records + catalog
  '/dashboard', '/products', '/search', '/serial', '/photos', '/ops', '/review', '/signals',
  '/sourcing', '/studio', '/manuals', '/forge', '/operations', '/reports', '/calendar',
  '/open-links', '/support', '/onboarding', '/settings', '/admin',
  // Identifier doors that resolve and redirect (GS1 links, short links, QR)
  '/01', '/414', '/l', '/o', '/p', '/q', '/qr', '/s',
  // Auth + public entry
  '/signin', '/signup', '/account', '/invite', '/share', '/offline', '/not-authorized', '/pay',
] as const;

/**
 * The customer-facing kiosk — its own system, never a desk: the counter tablet
 * runs its own shell (`KioskAppShell`) and its own mode, and nothing else in
 * the app may resolve to `counter` (owner 2026-09-27: keep it separate).
 */
const KIOSK_ROUTES: readonly ModeRouteEntry[] = [{ route: '/kiosk', mode: 'counter' }];

const DECLARED_ROUTES: readonly ModeRouteEntry[] = [
  { route: '/', mode: 'triage', exact: true },
  ...DESK_TRIAGE_ROUTES.map((route): ModeRouteEntry => ({ route, mode: 'triage' })),
  { route: '/shipping', mode: 'runtime' },
  // Labels & docs — one job (show labels, print them): triage only, its own
  // look, never Floor even inside the dual Outbound lane (owner 2026-09-27).
  { route: '/shipping/label-intake', mode: 'runtime', look: 'labels-documents', form: true },
  // The desk's new-sales-order form — triage on a touch screen too.
  { route: '/orders/new', mode: 'triage', form: true },
  // The desk's new-inbound-order form (PO · Return · Trade-in · Pickup).
  { route: '/incoming/new', mode: 'triage', form: true },
  { route: '/ai-chat', mode: 'assistant' },
  // The phone tree asks for triage; `resolveRegionMode` paints it industrial on
  // a phone (BRIEF §12). The scan floor and the orders queue are industrial by job.
  { route: '/m', mode: 'triage' },
  { route: '/m/scan', mode: 'industrial' },
  { route: '/m/orders', mode: 'industrial', exact: true },
  // Taking a sales order on the phone is a form, not floor execution.
  { route: '/m/orders/new', mode: 'triage', form: true },
  { route: '/m/work', mode: 'industrial' },
  ...KIOSK_ROUTES,
];

/** Every declared entry, longest route first so `/m/scan` beats `/m`. */
const MODE_ROUTES = [...DECLARED_ROUTES].sort((a, b) => b.route.length - a.route.length);

/** The entry governing `pathname`, or `null` when no route declares it. */
export function modeRouteFor(pathname: string | null | undefined): ModeRouteEntry | null {
  if (!pathname) return null;
  for (const entry of MODE_ROUTES) {
    if (pathname === entry.route) return entry;
    if (!entry.exact && pathname.startsWith(`${entry.route}/`)) return entry;
  }
  return null;
}
