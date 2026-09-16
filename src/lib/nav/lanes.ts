/**
 * The LANE registry — one taxonomy, both surfaces.
 *
 * A lane is not a new type: it is this list, rendered. The desk spine draws it
 * as `SidebarGroup`s (`SidebarNavList`) and the `/m` drawer draws it as drawer
 * groups (`MobileSidebarDrawer` via `@/lib/mobile/nav-registry`). It lives here
 * rather than in `sidebar-navigation.ts` so the PHONE can read a lane's face
 * without importing the 2000-line desk registry — SURFACE_LAW's point is that
 * the two surfaces agree, and they can only agree on something they can both
 * cheaply import.
 *
 * Two rulings are baked in and must not be re-litigated:
 *
 * • **Print is not a section.** Printing is a task every domain performs, not a
 *   place: product labels belong to Catalog, bin/rack labels to Inventory
 *   (Locations), carton stickers to the Unbox bench. A root "Print Stations"
 *   drill forced an operator to leave the record they were working to find the
 *   printer for it, and it minted a second front door for `/products?view=labels`
 *   and `/warehouse` that the canonical rows already owned.
 * • **Carrier postage is NOT a print destination.** Buying postage stays a
 *   Fulfillment act, never a Catalog/Inventory label task — folding the two
 *   together would merge "buy postage for an order" with "print a barcode for a
 *   shelf". `/shipping/labels` was the page that held that line until
 *   2026-08-30; it is deleted, and postage now lives ON the order (details →
 *   documents → buy label). The boundary is unchanged; only its address is.
 *
 * Each id is a domain an operator names out loud, so a page has exactly one
 * honest home. Aliases (a mode pointing at another domain's canonical URL) are
 * allowed; cloning a workspace is not.
 */

import { AlertCircle, Inbox, SalesPrice, ShelvingUnit, Tags } from '@/components/Icons';
import { STATION_PAGE_ICONS } from '@/lib/nav/station-nav-icons';
// Type-only, so it is ERASED at build time: the phone imports lanes without
// pulling the desk registry into its bundle. The icon type stays where its
// seven consumers already import it from.
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';

export type DomainGroupId =
  | 'inbound'
  | 'catalog'
  | 'inventory'
  | 'fulfillment'
  | 'sales'
  | 'support';

/**
 * Lane faces (N4, operator 2026-09-14). The spine used to draw
 * `otherPages.filter(isSpineDeskItem)` flat, so these declarations existed and
 * grouped nothing.
 *
 * Two changes carry the operator's "inbound, outbound" reading:
 *
 * • `fulfillment` is faced **Outbound**. The page row keeps its own label
 *   ("Shipping") for the header chip, ⌘K and recents — "Shipping" is also a
 *   STATION and milestone word (`surface-keys.ts`, `timeline-glyphs.ts`,
 *   `milestone-pipeline-types.ts`), so renaming the desk would leak into
 *   vocabulary that is not nav. Lane above, desk below: parent then child.
 * • **`sourcing` folded into `inbound`.** Demand → PO → on the way → received
 *   is one lane. The 2026-08-03 ruling was that Sourcing is not a child of
 *   *Inventory*; it said nothing about direction. The row survives untouched —
 *   only its parent moved.
 *
 * **The `icon` here is a PARENT icon** (operator 2026-09-14: *"icon at the
 * parent level only"*). It is worn by the lane's group header, or by the single
 * row a one-page lane collapses into — never by a page inside the lane. Both
 * renderers read it from this field; neither keeps an icon map of its own.
 */
export const DOMAIN_GROUPS = [
  { id: 'inbound', label: 'Inbound', icon: Inbox },
  { id: 'fulfillment', label: 'Outbound', icon: STATION_PAGE_ICONS.outbound },
  { id: 'inventory', label: 'Inventory', icon: ShelvingUnit },
  { id: 'catalog', label: 'Products', icon: Tags },
  { id: 'sales', label: 'Sales', icon: SalesPrice },
  { id: 'support', label: 'Support', icon: AlertCircle },
] as const satisfies ReadonlyArray<{
  id: DomainGroupId;
  label: string;
  icon: SidebarIconComponent;
}>;

/**
 * Look a lane up BY ID. `SPINE_SECTIONS` used to index this array positionally
 * (`DOMAIN_GROUPS[0]` … `[6]`), so reordering or removing one entry silently
 * re-labelled a section — and N4 does both. The generic keeps the literal type
 * per position, so `SpineSectionId` stays a union of ids and not `string`.
 *
 * The `/m` registry calls it for the same reason: a hand-copied `'Outbound'`
 * string on the phone is precisely the drift this function exists to prevent.
 */
export function domainLane<T extends DomainGroupId>(id: T) {
  const found = DOMAIN_GROUPS.find((group) => group.id === id);
  if (!found) throw new Error(`unknown domain group: ${id}`);
  return found as Extract<(typeof DOMAIN_GROUPS)[number], { id: T }>;
}

/**
 * **THE MOBILE-FIRST GATE — a lane the phone cannot run does not get a door.**
 *
 * Operator ruling 2026-09-14, verbatim: *"everything should be mobile first …
 * everything must be mobile friendly. If it is not mobile friendly, then it
 * should not even display anywhere within the front end … first of all, just
 * hide the operations, support, and sales, and keep the products, inventory,
 * outbound, and inbound. That is still being used on desktop, and it must be
 * ported over to a mobile first design system language."*
 *
 * This is the porting LEDGER, not a feature flag. Its whole purpose is to make
 * the backlog visible and drained **one lane at a time**: a lane is `'hidden'`
 * until the operator decides it is worth porting, `'desk-only'` while it is in
 * daily desktop use and awaiting its port, and `'ported'` once the phone can
 * genuinely run it. Only `'hidden'` costs a lane its nav row.
 *
 * Three consequences an editor must not "tidy away":
 *
 * 1. **`'desk-only'` still displays.** Products · Inventory · Outbound ·
 *    Inbound are not on the phone yet and stay on the spine anyway — the
 *    operator is using them today. Hiding them would be the gate eating the
 *    work it exists to sequence.
 * 2. **`'hidden'` removes the DOOR, not the route.** `/operations`,
 *    `/support`, `/dashboard?mode=sales` still resolve for a bookmark. Deleting
 *    a route is its own gated increment (Track X), and doing it here would turn
 *    a nav decision into data loss.
 * 3. **Flipping one entry is the entire port hand-off.** `'hidden'` → `'ported'`
 *    when the `/m` surface exists; that single line is what a port increment
 *    closes with.
 *
 * Enforced, not remembered: `nav-mobile-first.test.ts` asserts no `'hidden'`
 * lane reaches the spine and that every lane id carries a status, and
 * `ds_nav_names`' sibling face reports the ledger.
 */
export type LaneMobileFirstStatus =
  /** The phone runs this lane. */
  | 'ported'
  /** Desktop-only and IN USE — displays, and is queued for its port. */
  | 'desk-only'
  /** Not mobile-friendly and not in daily use: **no nav row on any surface.** */
  | 'hidden';
/**
 * The lanes the gate can hide: the DOMAIN lanes, plus `monitor` (faced
 * *Operations*) and `studio` (faced *Automations*) — the two members of the
 * spine that are not `DomainGroupId`s.
 *
 * `studio` joined the gate 2026-09-16 on an explicit operator ruling: *"Remove
 * the monitor from displaying in the sidebar, park it — park automations as
 * well so it will not display in the sidebar."* Until that ruling the type
 * deliberately excluded it, on the grounds that hiding a non-desk lane needed
 * its own decision rather than an inference. It now has one.
 *
 * `floor` (Scan Stations) stays deliberately absent: a scan bench is where the
 * work physically happens, and withdrawing its door is still its own ruling.
 */
export type GatedLaneId = DomainGroupId | 'monitor' | 'studio';

export const LANE_MOBILE_FIRST: Readonly<Record<GatedLaneId, LaneMobileFirstStatus>> = {
  // Kept by name (operator 2026-09-14) — in daily desktop use, port next.
  inbound: 'desk-only',
  fulfillment: 'desk-only',
  inventory: 'desk-only',
  catalog: 'desk-only',
  // Hidden by name (operator 2026-09-14): not ported, not in the keep list.
  sales: 'hidden',
  support: 'hidden',
  /*
   * PARKED 2026-09-16, operator ruling: *"Remove the monitor from displaying
   * in the sidebar, park it — park automations as well."*
   *
   * Monitor had its doors back since 2026-09-15 because `/m/reports` gave it a
   * phone face. What changed is trust, not portability: the lane's Analytics
   * mode was retired the same day for reporting numbers nobody could rely on
   * (partial-day-vs-whole-day deltas, hardcoded-zero deltas, labels naming
   * units their queries did not count). The reads worth keeping now live on
   * `/reports` — `?tab=packer` and `?tab=staff` — which is a lane of its own.
   *
   * Both routes still resolve: `/operations` and `/studio` answer a bookmark,
   * a pasted link and a `default_home_path`. This removes the DOOR. Flip either
   * entry to `'desk-only'` to put the row back.
   */
  monitor: 'hidden',
  studio: 'hidden',
};

/** False when this lane has no door on any surface (the mobile-first gate). */
export function isLaneVisible(id: string): boolean {
  const status = (LANE_MOBILE_FIRST as Record<string, LaneMobileFirstStatus | undefined>)[id];
  // An ungated id (floor) is not hidden — only a declared 'hidden' is.
  return status !== 'hidden';
}
