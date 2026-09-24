/**
 * Mobile navigation registry — the single SoT for `/m` navigation.
 *
 * Callers: `MobileSidebarDrawer` (destinations + active-route identification),
 * the dormant bottom nav (tab destinations), and — via `packages/shared` — the
 * Expo app's L1 module map. Human law: docs/mobile-first/SURFACE_LAW.md §8;
 * boundary law: ARCHITECTURE.md ("component split").
 *
 * This module is deliberately React-free: destinations are plain data, icons
 * are the renderer's concern (chrome law: pages are text; modes own glyphs —
 * the drawer keeps its own id→glyph map).
 *
 * Operator: 2026-09-14 — "focusing on the routing for the sidebar navigation
 * identification … first building a solid foundation."
 */

import type { MobileNavTabId } from '@/lib/auth/mobile-display-config';
import { BarChart3, Inbox, ListChecks, PackageOpen, Printer } from '@/components/Icons';
import { domainLane } from '@/lib/nav/lanes';
import { TECH_NAV_ICONS } from '@/lib/nav/station-nav-icons';
import { OUTBOUND_WORKFLOW_SURFACES } from '@/lib/mobile/mobile-first-surface';
import { MOBILE_LABEL_INTAKE_PATH } from '@/lib/shipping/orders-desk';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';

// ─── Destination tree (sidebar drawer) ───────────────────────────────────────

/**
 * A row INSIDE a group. **There is no `icon` field here, and that is the
 * point** — operator ruling 2026-09-14, *"icon at the parent level only"*. The
 * law is expressed as a TYPE rather than as a convention in the renderer, so a
 * child glyph is not something a future edit can add by accident.
 */
export type MobileNavChild = {
  kind: 'leaf';
  id: string;
  label: string;
  href: string;
  /**
   * Permission this destination needs, or omitted when every signed-in staffer
   * may reach it. The drawer DROPS a row the viewer cannot use — absent, never
   * disabled, matching the desk spine's `requires` and the registry rule that a
   * row which 403s is worse than one that was never offered.
   *
   * It is a REGISTRY field, not a renderer check keyed by id, for the same
   * reason the parent icon is: a law expressed in the renderer is a law the
   * next surface forgets.
   */
  requires?: string;
};

/** An L0 row — a parent in its own right, so it wears a glyph. */
export type MobileNavLeaf = MobileNavChild & {
  icon: SidebarIconComponent;
};

/** A LANE. Always a parent, so the glyph is required. */
export type MobileNavGroup = {
  kind: 'group';
  id: string;
  label: string;
  icon: SidebarIconComponent;
  /** Any of these path prefixes marks the group (and its row) active. */
  matchPrefixes: string[];
  children: readonly MobileNavChild[];
};

export type MobileNavItem = MobileNavLeaf | MobileNavGroup;

// Lane faces come from `@/lib/nav/lanes` — the SAME registry the desk spine
// groups by. A hand-copied 'Outbound' string here is exactly the phone/desk
// drift the handoff is about, so the label and the parent icon are read, never
// retyped.
//
// `inbound` is the exception and is NOT read from there: the phone's inbound
// parent is faced `Unbox` + `PackageOpen` by operator ruling (see the
// destination list below). Keeping a `domainLane('inbound')` binding that
// nothing consumes would imply the desk face still governs that row.
const OUTBOUND = domainLane('fulfillment');

// Single source of truth for the drawer's destinations.
//
// **Operator ruling (2026-09-14):** the mobile app's live surface is the
// unbox photo feed, picks, location scanning, and the identification kernel.
// Find was deleted with that pass. Packing returned 2026-09-17 as its own
// partial phone surface. **Daily came back** the same day as a real surface:
// `/m/home` is the phone face of the shift
// checklist (the mobile SoT for the check verb), and it leads the drawer
// because it is the first thing a staffer runs on a shift.
//
// `Checklists` (`/m/checklist`) is **DELETED** (operator 2026-09-15: *"remove
// the checklist from the mobile display and the checklist components, they are
// old components from the mobile app itself … I'm removing and simplifying the
// display in general so I can build upon a simplified display language"*).
//
// It was the SKU kit-parts / QC-template editor, and four documents recorded
// the earlier ruling that the row be KEPT *"until the operator gates its
// fate"* — this is that gate. The row, the route and
// `src/components/mobile/checklist/**` are gone; kit-parts and QC templates
// are authored on the desk (SKU catalog admin), which is where the authoring
// verb already lived. **Do not restore this row** — restore recipe is in
// docs/warehouse-os/DELETED-MANIFEST.md.
//
// **Scan is deliberately absent** (2026-08-21). It now has a permanent seat in
// the top-right corner of every mobile screen (`MobileScanCta`), so a row here
// would be a second door to one destination.
//
// **The lanes arrived 2026-09-14.** The drawer was a flat list plus one
// `receiving` group while the desk spine had grouped into lanes, so the two
// surfaces named the same work differently. The phone's ROWS stay phone routes
// — `/m` owns its own verbs, it is not a desk mirror — but the PARENTS are the
// desk's lanes, read from the shared registry:
//
// • `receiving` → **Inbound** (`inbound`), the lane's own face.
// • **Outbound** (`fulfillment`) is new, and it is what finally gives `/m/work`
//   a front door: it was the mobile landing default with NO drawer row at all
//   (plan §0.3 orphan). Its rows are the two the U2 survival table clears:
//   `/m/work` (**KEPT** — §1.7 repointed every near-nav exit and the auth
//   landing here) and `/m/pick` (**LIVE** — "picks", the ruling's second keep).
//
// **`Add order` (`/m/orders/new`) lost its row here (2026-09-14).** §1.7 marks
// it **GATED** — outside the ruling's four keeps with no recorded exception —
// and the same table's N9 consequence is law: *"the drawer may only row up LIVE
// and KEPT routes"*. The row it had was the anomaly that table flags, and
// composing the Outbound lane around it would have re-granted it by
// coat-tails. The ROUTE is untouched and still resolves; only the door is gone,
// pending an operator ruling.
// **Inbound keeps its PARENT, and the parent is named Unbox** (operator
// 2026-09-15, in two steps). First: *"remove the inbound walk-in, consult,
// repair and unbox — just keep the photo feed only."* Then, on seeing the
// result: *"the photo feed should still display as a child under unbox as the
// parent."*
//
// So the lane's five children (`Unbox`, `Photo feed`, `Walk-In`, `Consult`,
// `Repair`) are down to ONE — `Photo feed` — but it stays a CHILD. The parent
// is the altitude that answers "what is this work", and inbound work on the
// phone is unboxing; the child answers "which face of it", and today there is
// exactly one. A second face (QC inspect, place-at-location) lands beside it
// without re-shaping the drawer.
//
// The FACE is `Unbox` + `PackageOpen`, not `INBOUND.label` ("Inbound") and not
// `INBOUND.icon` (`Inbox`). This is the one deliberate divergence from the
// shared lane face, and it is an operator ruling rather than drift:
//
// • LABEL — the desk lane is named for the DIRECTION because a desk holds
//   deliveries, sourcing and unfound alike, while the phone holds the single
//   verb a floor staffer performs.
// • GLYPH — operator 2026-09-15: *"ensure the unbox parent level navigation is
//   still the package open, not the inbox."* `Inbox` is a mail tray: a place
//   things arrive. `PackageOpen` is a carton being opened: the act. The repo
//   already treats `PackageOpen` as the Unbox mark — `STATION_GLYPH_KEYS
//   ['receiving.receive']` is `PackageOpen` and `station-nav-icons.test.ts`
//   sanctions the Receiving-page/Unbox-child sharing of it — so a row named
//   Unbox wearing `Inbox` was the outlier, not this.
//
// Both halves are asserted as a CLOSED SET in `nav-registry.test.ts`
// (`PHONE_LANE_FACES`), so a second divergence has to be ruled, not drifted
// into.
//
// The old `Unbox` CHILD (`/m/unbox`) is DELETED — route plus
// `redesign/Receive.tsx`, its sole consumer. It was a second scan door (Track
// U), which is exactly why its NAME being free lets the parent take it without
// a parent/child stutter (`nav-name-collisions.ts` gates that).
//
// `/m/consult` and the `?mode=local-pickup` / `?mode=repair` surfaces keep
// their ROUTES — removing a door is not deleting a surface, and `/m/consult`
// hosts `KioskV2Runtime`, which the kiosk faces still mount. The `?mode=`
// branches in `ReceivingLive.tsx` went with the rows: they were placeholder
// cards telling a phone operator to go use a desktop station, which is the
// refusal `SURFACE_LAW` §10 names outright.
export const MOBILE_NAV_DESTINATIONS: readonly MobileNavItem[] = [
  { kind: 'leaf', id: 'daily', label: 'Daily', href: '/m/home', icon: ListChecks },
  {
    kind: 'group',
    id: 'inbound',
    label: 'Unbox',
    icon: PackageOpen,
    matchPrefixes: ['/m/receiving', '/m/r/'],
    children: [{ kind: 'leaf', id: 'photos', label: 'Photo feed', href: '/m/receiving' }],
  },
  {
    kind: 'group',
    id: 'fulfillment',
    label: OUTBOUND.label,
    icon: OUTBOUND.icon,
    // `matchPrefixes` describes ROUTES, not rows: `/m/orders/[orderId]` still
    // resolves and belongs to this lane, so a deep-link there marks Outbound
    // active even though no row points at it.
    matchPrefixes: ['/m/work', '/m/pick', '/m/pack', '/m/orders', '/m/shipping', '/m/exceptions', MOBILE_LABEL_INTAKE_PATH],
    children: [
      {
        kind: 'leaf',
        id: 'orders',
        label: OUTBOUND_WORKFLOW_SURFACES.orders.label,
        href: OUTBOUND_WORKFLOW_SURFACES.orders.canonicalMobilePath,
      },
      {
        kind: 'leaf',
        id: 'picks',
        label: OUTBOUND_WORKFLOW_SURFACES.picks.label,
        href: OUTBOUND_WORKFLOW_SURFACES.picks.canonicalMobilePath,
      },
      {
        kind: 'leaf',
        id: 'packing',
        label: 'Packing',
        href: '/m/pack',
      },
      {
        kind: 'leaf',
        id: 'shipping-packing',
        label: OUTBOUND_WORKFLOW_SURFACES.shipping.label,
        href: OUTBOUND_WORKFLOW_SURFACES.shipping.canonicalMobilePath,
      },
      {
        kind: 'leaf',
        id: 'exceptions',
        label: OUTBOUND_WORKFLOW_SURFACES.exceptions.label,
        href: OUTBOUND_WORKFLOW_SURFACES.exceptions.canonicalMobilePath,
      },
      // Label intake — the V1 label-ingestion ledger; the SAME component the
      // desk row `/shipping/label-intake` mounts, so upload, reprocess and
      // apply are all phone-completable.
      {
        kind: 'leaf',
        id: 'label-intake',
        label: 'Label intake',
        href: MOBILE_LABEL_INTAKE_PATH,
        requires: 'packing.review',
      },
    ],
  },
  // An L0 row, the phone twin of the desk's Quality Control station row (same
  // glyph). QC is its own scan TYPE (operator 2026-09-24), run on the one scan
  // kernel armed for QC — not a second scan door, not a face of Unbox, not a
  // Repair door. Gated on `tech.qc_pass`, the permission the checklist read
  // and write carry, so a staffer who would 403 on the first step never sees it.
  {
    kind: 'leaf',
    id: 'qc',
    label: 'Quality control',
    href: QC_SCAN_HREF,
    icon: TECH_NAV_ICONS.testing,
    requires: 'tech.qc_pass',
  },
  // CROSS-LANE, so an L0 row rather than a member of any lane: a shift report
  // spans Inbound and Outbound alike. Gated on `operations.view` — the Monitor
  // lane's own permission, and the TIGHTER of the two candidates:
  // `reports.view` exists but is granted broadly (including the viewer role),
  // which would contradict the operator's *"view only in a manager"*. A floor
  // staffer reads their OWN day on `/m/home`.
  {
    kind: 'leaf',
    id: 'reports',
    label: 'Reports',
    href: '/m/reports',
    icon: BarChart3,
    requires: 'operations.view',
  },
  // CROSS-LANE for the same reason Reports is, and an L0 row for the same
  // reason: an arrival notice, a mention and an SLA breach belong to no single
  // lane, so seating this under Inbound would name only one of its senders.
  //
  // **Why the row exists at all.** The desk header inbox came back 2026-09-22
  // carrying the "watch a tracking number" control, and `SURFACE_LAW` §1
  // refuses a desk-only surface without a `/m` twin or a recorded exception —
  // this is the twin, not a mirror: `/m/inbox` owns the whole verb (watch,
  // stop, read) rather than reflecting the desk panel. The operator's own
  // framing is a floor one (2026-09-22: *"if you are looking forward to
  // receiving a package … input a tracking number"*); the number is read off a
  // phone and the carton is scanned with one.
  //
  // Gated on `home.inbox.view` — the permission `GET /api/inbox` and
  // `PATCH /api/inbox/[id]` already carry, so a staffer who would 404 at the
  // data never sees the door. The Home Inbox org flag is a SEPARATE axis and
  // is deliberately not a nav condition: the screen answers "not enabled here"
  // in one plain line, which a missing row could not.
  {
    kind: 'leaf',
    id: 'inbox',
    label: 'Inbox',
    href: '/m/inbox',
    icon: Inbox,
    requires: 'home.inbox.view',
  },
  // NO separate Tasks row (operator 2026-09-23: *"there should just be only one
  // task system"*). A thrown task and a daily check are two stores but ONE list
  // on the phone: `/m/home` renders both, ticks both, and `work_orders.claim`
  // decides only whether the assigned-work rows appear on it. A second door to
  // the same work is how an operator ends up asking which list is real.
  { kind: 'leaf', id: 'print', label: 'Print', href: '/m/print', icon: Printer },
];

// ─── Active-route identification ─────────────────────────────────────────────

/**
 * Active-route identification for BOTH altitudes — an L0 row and a row inside
 * a lane now answer the same question.
 *
 * There used to be a second predicate (`isChildActive`) that also compared the
 * `?mode=` a child href encoded against the current query, because Inbound had
 * three children sharing `/m/receiving` and differing only by mode — without
 * that comparison all three lit at once. Those rows were removed on 2026-09-15
 * (operator: keep the photo feed only) and no destination carries a query
 * string any more, so the mode plumbing, `hrefMode`, and the duplicate
 * predicate are deleted rather than kept for a shape nothing produces.
 */
export const isLeafActive = (pathname: string | null, href: string) => {
  if (!pathname) return false;
  // Exact match, plus prefix-match for nested detail routes.
  return pathname === href || pathname.startsWith(`${href}/`);
};

export const isGroupActive = (pathname: string | null, prefixes: string[]) =>
  !!pathname && prefixes.some((p) => pathname === p || pathname.startsWith(p));

// ─── Bottom-nav tab destinations ─────────────────────────────────────────────

/**
 * Where each configurable bottom-nav tab (`MobileNavTabId`) routes.
 *
 * The bottom nav is currently dormant: plumbed end-to-end (DB → admin API →
 * session → `useAuth().mobileDisplayConfig`, with `bottomNav.enabled`
 * defaulting false) but NO component renders it — verified 2026-09-14
 * (MobileShell mounts no tab bar; no nav/tab-bar component exists in the
 * mobile kit; nothing reads the context value). This map is the routing SoT
 * for it: when the renderer is revived it reads config from
 * `useAuth().mobileDisplayConfig` and hrefs/labels here, re-deriving nothing.
 *
 * Hrefs are grounded in `mobile-display-config.ts` ('scan' → /m/scan — the
 * universal scanner; 'receiving' → /m/receive — the receiving-door scan) and
 * the drawer destinations. 'home' and 'packing' routes were deleted
 * (2026-09-14 operator ruling); their dormant tab ids repoint to the picks
 * queue so the map stays total — re-map at revival. 'signout' is an action,
 * not a route: href null.
 */
export const MOBILE_NAV_TAB_DESTINATIONS: Readonly<
  Record<MobileNavTabId, { href: string | null; label: string }>
> = {
  home: { href: '/m/pick', label: 'Picks' },
  picks: { href: '/m/pick', label: 'Picks' },
  scan: { href: '/m/scan', label: 'Scan' },
  receiving: { href: '/m/receive', label: 'Receiving' },
  packing: { href: '/m/pick', label: 'Picks' },
  signout: { href: null, label: 'Sign out' },
};
