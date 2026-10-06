/**
 * The route → task-mode registry (BRIEF §6: "the mode is decided by the job in
 * the region" — route + region → mode, fixed). DECLARED, not derived: every
 * page under `src/app` must resolve to an entry here (`mode-registry.test.ts`),
 * and the app frame applies the page's mode once (`RouteModeRegion`), so a
 * page cannot forget one.
 *
 * The route declares the mode on every device. Ordinary application routes,
 * including the full mobile tree, use the readable triage presentation.
 */

import type { ModeLookName, ModeName } from '@/design-system/modes/registry';
import { RECEIVING_PATHS } from '@/lib/nav/route-tree';

export interface ModeRouteEntry {
  /**
   * Path prefix (`/inventory` owns `/inventory/stock`), or the whole path when
   * `exact`.
   */
  route: string;
  mode: ModeName;
  /** Match `route` itself only, never its children. */
  exact?: true;
  /** A job LOOK over the declared mode (`MODE_LOOKS`): the region stamps it where the mode resolves. */
  look?: ModeLookName;
}

const DESK_TRIAGE_ROUTES = [
  // Outbound + sales
  '/counter', '/fba', '/pack', '/packer', '/pick', '/pickup', '/walk-in', '/tracking-exceptions',
  // Inbound
  '/incoming', RECEIVING_PATHS.purchasing, '/triage', '/receiving', '/unbox', '/carton',
  // Inventory + warehouse
  '/inventory', '/warehouse', '/replenish', '/bin',
  // Repair + test
  '/repair', '/tech', '/test', '/wipe',
  // Records + catalog
  '/dashboard', '/fulfilled', '/products', '/search', '/serial', '/photos', '/ops', '/review', '/signals',
  '/sourcing', '/stations', '/studio', '/tote', '/manuals', '/forge', '/operations', '/reports', '/calendar', '/exceptions',
  '/open-links', '/onboarding', '/settings', '/admin',
  // The Support workspace (owner 2026-10-04: a top-level workspace at /support)
  '/support',
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
  { route: '/shipping', mode: 'triage' },
  // Labels & docs — one job (show labels, print them): its own look.
  { route: '/shipping/label-intake', mode: 'triage', look: 'labels-documents' },
  // Print station — a plain triage desk for finding and printing FNSKU labels.
  { route: '/print-station', mode: 'triage' },
  // The desk's new-sales-order form — triage on a touch screen too.
  { route: '/orders/new', mode: 'triage' },
  { route: '/ai-chat', mode: 'assistant' },
  // Local-only Motion+ visual study (the page itself is a production 404).
  { route: '/motion-plus-button', mode: 'assistant' },
  // The full phone tree uses the same readable triage presentation.
  { route: '/m', mode: 'triage' },
  ...KIOSK_ROUTES,
];

/** Every declared entry, longest route first so `/m/scan` beats `/m`. */
const MODE_ROUTES = [...DECLARED_ROUTES].sort((a, b) => b.route.length - a.route.length);

/** `route` as a whole-segment prefix pattern. */
function routePattern(entry: ModeRouteEntry): RegExp {
  const body = entry.route
    .split('/')
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('/');
  return new RegExp(`^${body}${entry.exact ? '' : '(?:/.*)?'}$`);
}

const MODE_PATTERNS = MODE_ROUTES.map((entry) => ({ entry, pattern: routePattern(entry) }));

/** The entry governing `pathname`, or `null` when no route declares it. */
export function modeRouteFor(pathname: string | null | undefined): ModeRouteEntry | null {
  if (!pathname) return null;
  return MODE_PATTERNS.find(({ pattern }) => pattern.test(pathname))?.entry ?? null;
}
