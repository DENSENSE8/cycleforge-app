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

import type { ModeName } from '@/design-system/modes/registry';

export type RouteMode = ModeName | 'runtime';

export interface ModeRouteEntry {
  /** Path prefix (`/inventory` owns `/inventory/stock`), or the whole path when `exact`. */
  route: string;
  mode: RouteMode;
  /** Match `route` itself only, never its children. */
  exact?: true;
}

const DESK_TRIAGE_ROUTES = [
  // Outbound + sales
  '/counter', '/fba', '/pack', '/packer', '/pickup', '/walk-in', '/tracking-exceptions',
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
  '/signin', '/signup', '/account', '/invite', '/share', '/offline', '/not-authorized',
] as const;

const DECLARED_ROUTES: readonly ModeRouteEntry[] = [
  { route: '/', mode: 'triage', exact: true },
  ...DESK_TRIAGE_ROUTES.map((route): ModeRouteEntry => ({ route, mode: 'triage' })),
  { route: '/shipping', mode: 'runtime' },
  { route: '/ai-chat', mode: 'assistant' },
  { route: '/kiosk', mode: 'counter' },
  // The phone tree asks for triage; `resolveRegionMode` paints it industrial on
  // a phone (BRIEF §12). The scan floor and the orders queue are industrial by job.
  { route: '/m', mode: 'triage' },
  { route: '/m/scan', mode: 'industrial' },
  { route: '/m/orders', mode: 'industrial', exact: true },
  { route: '/m/work', mode: 'industrial' },
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
