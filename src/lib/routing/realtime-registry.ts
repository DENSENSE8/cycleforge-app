/**
 * The route → live-domain registry — the sibling of `mode-registry.ts`, and
 * the same longest-prefix lookup. The app frame mounts ONE
 * `useRealtimeInvalidation` with the flags this resolves (`RouteRealtimeMount`),
 * so a page cannot forget its live layer and two pages cannot mount it twice.
 *
 * DERIVED FROM WHAT THE ROUTE'S PAGES READ (2026-09-27), per domain:
 * - `dashboard` — `['dashboard-table', …]`, `shipped-table*`, the outbound
 *   station queues (orders channel: `order.changed` / `order.assignments` /
 *   `queue.assignments` / `order.picked`).
 * - `receiving` — the receiving feeds, lines, PO + photo reads (station
 *   channel: `receiving-log.changed` / `receiving-photo.changed` /
 *   `shipment.changed` / `email-signal.changed`).
 * - `repair` — `qk.repairs.*` (repairs channel: `repair.changed`).
 * - `walkIn` — `qk.walkInSales.*` (walk-in channel: `sale.completed`).
 *
 * The mode never enters here: Floor, triage and the phone floor get the same
 * subscriptions — only the chrome differs. Routes with no entry (kiosk, auth,
 * settings, inventory — `/inventory/stock` keeps its own `activity.logged`
 * page subscription, which re-reads the RSC loader) mount no live layer and
 * show no sync indicator.
 */

export type RealtimeDomain = 'dashboard' | 'receiving' | 'repair' | 'walkIn';

export interface RealtimeRouteEntry {
  /** Path prefix (`/shipping` owns `/shipping/orders`). */
  route: string;
  domains: readonly RealtimeDomain[];
}

const DECLARED_ROUTES: readonly RealtimeRouteEntry[] = [
  // Outbound desks (To ship, Shortage, Shipped, Exceptions, FBA, scan-out) — triage and Floor alike.
  { route: '/shipping', domains: ['dashboard'] },
  // Packing station: the unshipped queue beside the pack scan.
  { route: '/pack', domains: ['dashboard'] },
  { route: '/packer', domains: ['dashboard'] },
  // Picker desk: the unshipped queue beside the pick scan.
  { route: '/pick', domains: ['dashboard'] },
  // Quality Control bench: the testing rail + lines (receiving feeds) and the
  // All triage tab, which folds the unshipped queue in.
  { route: '/test', domains: ['dashboard', 'receiving'] },
  { route: '/tech', domains: ['dashboard', 'receiving'] },
  // Review station: outbound pairing reads.
  { route: '/review', domains: ['dashboard'] },
  // Receiving surfaces (`ReceivingSurfacePage`): rails, lines, incoming tiles.
  { route: '/receiving', domains: ['receiving'] },
  { route: '/incoming', domains: ['receiving'] },
  { route: '/triage', domains: ['receiving'] },
  { route: '/unbox', domains: ['receiving'] },
  // Repair intake + Local Pickup are receiving modes that also read repairs.
  { route: '/repair', domains: ['receiving', 'repair'] },
  { route: '/pickup', domains: ['receiving', 'repair'] },
  // Sales: repair tickets + walk-in sales history.
  { route: '/dashboard', domains: ['repair', 'walkIn'] },
  // Operations board: the repair queue tiles.
  { route: '/operations', domains: ['repair'] },
  // Phone tree.
  { route: '/m/orders', domains: ['dashboard'] },
  { route: '/m/work', domains: ['dashboard'] },
  // Pick queue: the To-ship desk's rows and counts (owner 2026-09-28).
  { route: '/m/pick', domains: ['dashboard'] },
  { route: '/m/r', domains: ['receiving'] },
  { route: '/m/receiving', domains: ['receiving'] },
  { route: '/m/rs', domains: ['repair'] },
];

/** Longest route first so a nested declaration beats its parent prefix. */
const REALTIME_ROUTES = [...DECLARED_ROUTES].sort((a, b) => b.route.length - a.route.length);

/** The entry governing `pathname`, or `null` when the route has no live layer. */
export function realtimeRouteFor(pathname: string | null | undefined): RealtimeRouteEntry | null {
  if (!pathname) return null;
  for (const entry of REALTIME_ROUTES) {
    if (pathname === entry.route || pathname.startsWith(`${entry.route}/`)) return entry;
  }
  return null;
}

export interface RealtimeFlags {
  dashboard: boolean;
  receiving: boolean;
  repair: boolean;
  walkIn: boolean;
  /** Replay (refetch) after a dropped socket — wherever the order desks are live. */
  reconnect: boolean;
}

/** `useRealtimeInvalidation` options for `pathname`; all false off the registry. */
export function realtimeFlagsFor(pathname: string | null | undefined): RealtimeFlags {
  const domains = realtimeRouteFor(pathname)?.domains ?? [];
  const dashboard = domains.includes('dashboard');
  return {
    dashboard,
    receiving: domains.includes('receiving'),
    repair: domains.includes('repair'),
    walkIn: domains.includes('walkIn'),
    reconnect: dashboard,
  };
}
