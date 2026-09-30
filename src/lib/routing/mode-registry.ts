/**
 * The route → task-mode registry (BRIEF §6: "the mode is decided by the job in
 * the region" — route + region → mode, fixed). DECLARED, not derived: every
 * page under `src/app` must resolve to an entry here (`mode-registry.test.ts`),
 * and the app frame applies the page's mode once (`RouteModeRegion`), so a
 * page cannot forget one.
 *
 * The route declares the mode, on every device (owner 2026-09-28,
 * `docs/design-system/HANDOFF-remove-desk-floor.md`): desks are `triage` on a
 * desktop, a touch laptop and an iPad alike — no Floor, no device collapse.
 * `industrial` is declared ONLY by `/m/*` OPERATION flows — moving a thing to
 * its next operation with one pressable next step (scan, unbox, pack,
 * scan-out, stock count / pair) — and paints the same on a phone and an iPad.
 * `/m/*` READING flows (tasks, daily, imports, orders, exceptions, records,
 * forms) are `triage`. A flow's subpages share its mode (prefix entries).
 *
 * Portals that escape the page's DOM (dialogs, sheets, the right rail, the
 * command palette) keep their own `ModeRegion` — they are not pages; one that
 * asks for `triage` on an `industrial` route paints the route's `industrial`
 * unless it is a `form` (`resolveRegionMode`).
 */

import type { ModeLookName, ModeName } from '@/design-system/modes/registry';

export interface ModeRouteEntry {
  /**
   * Path prefix (`/inventory` owns `/inventory/stock`), or the whole path when
   * `exact`. A `*` segment matches any one segment (`/m/r/*` + `/qc` = every
   * carton's QC), so a job under a record can wear a different mode than the record.
   */
  route: string;
  mode: ModeName;
  /** Match `route` itself only, never its children. */
  exact?: true;
  /**
   * TRIAGE ONLY: the job fills something in (a new order, a pick, labels) —
   * a `triage` region on it never takes an enclosing operation's
   * `industrial`.
   */
  form?: true;
  /** A job LOOK over the declared mode (`MODE_LOOKS`): the region stamps it where the mode resolves. */
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
  '/sourcing', '/studio', '/manuals', '/forge', '/operations', '/reports', '/calendar', '/exceptions',
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
  { route: '/shipping', mode: 'triage' },
  // Labels & docs — one job (show labels, print them): its own look.
  { route: '/shipping/label-intake', mode: 'triage', look: 'labels-documents', form: true },
  // Print station — a plain triage desk for finding and printing FNSKU labels.
  { route: '/print-station', mode: 'triage' },
  // The desk's new-sales-order form — triage on a touch screen too.
  { route: '/orders/new', mode: 'triage', form: true },
  // The desk's new-inbound-order form (PO · Return · Trade-in · Pickup).
  { route: '/incoming/new', mode: 'triage', form: true },
  { route: '/ai-chat', mode: 'assistant' },
  // Local-only Motion+ visual study (the page itself is a production 404).
  { route: '/motion-plus-button', mode: 'assistant' },
  // The phone tree: READING by default — home / daily, tasks, imports, the
  // orders queue (`/m/work` is its alias), order / shipment / repair records,
  // exceptions, receiving feed, tickets, settings, sign-in.
  { route: '/m', mode: 'triage' },
  // Taking a sales order on the phone is a form, not floor execution.
  { route: '/m/orders/new', mode: 'triage', form: true },
  // Pick is a triage task on every device, the whole flow — list, next pick,
  // scan bin, confirm unit, tote, short pick, notes (owner 2026-09-28),
  // including its identification face.
  { route: '/m/pick', mode: 'triage', form: true },
  { route: '/m/id/pick', mode: 'triage', form: true },
  // OPERATION flows — the thing moves to its next operation under the thumb.
  { route: '/m/scan', mode: 'industrial' }, // the one scan kernel
  { route: '/m/pack', mode: 'industrial' }, // packing list → start pack
  { route: '/m/p', mode: 'industrial' }, // packer evidence photos
  { route: '/m/id', mode: 'industrial' }, // scan-out + tenant identification jobs
  { route: '/m/r', mode: 'industrial' }, // carton hub: unbox → lines → QC, classify, photos
  { route: '/m/h', mode: 'industrial' }, // handling unit (box / tote) contents
  { route: '/m/u', mode: 'industrial' }, // unit hub: move / pair / stash / test, QC run
  { route: '/m/unit-photos', mode: 'industrial' }, // unit photo capture
  { route: '/m/stock/*/photos', mode: 'industrial' }, // stock product-photo capture (desk "Send to phone")
  // Quality control — a verdict / ticket / label decision, read at a glance
  // (owner 2026-09-29: triage, mobile-first, F-pattern record). The carton and
  // unit hubs around it stay industrial.
  { route: '/m/qc', mode: 'triage', form: true }, // QC line pick off the kernel
  { route: '/m/r/*/qc', mode: 'triage', form: true }, // the unbox label's landing: pick a unit
  { route: '/m/u/*/qc', mode: 'triage', form: true }, // one unit: verdict → ticket / QC label
  { route: '/m/loc', mode: 'industrial' }, // location hub: stock count ±
  { route: '/m/pair', mode: 'industrial' }, // pair a location: SKU → quantity
  { route: '/m/fnsku', mode: 'industrial' }, // FBA label reprint: copies → print
  { route: '/m/repair-scan', mode: 'industrial' }, // serial scan companion
  ...KIOSK_ROUTES,
];

/** Every declared entry, longest route first so `/m/scan` beats `/m`. */
const MODE_ROUTES = [...DECLARED_ROUTES].sort((a, b) => b.route.length - a.route.length);

/** `route` as a prefix pattern: literal segments, `*` = exactly one segment. */
function routePattern(entry: ModeRouteEntry): RegExp {
  const body = entry.route
    .split('/')
    .map((segment) => (segment === '*' ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${body}${entry.exact ? '' : '(?:/.*)?'}$`);
}

const MODE_PATTERNS = MODE_ROUTES.map((entry) => ({ entry, pattern: routePattern(entry) }));

/** The entry governing `pathname`, or `null` when no route declares it. */
export function modeRouteFor(pathname: string | null | undefined): ModeRouteEntry | null {
  if (!pathname) return null;
  return MODE_PATTERNS.find(({ pattern }) => pattern.test(pathname))?.entry ?? null;
}
