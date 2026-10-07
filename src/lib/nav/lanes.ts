/** The LANE registry — one taxonomy, both surfaces. */

import { Inbox, SalesPrice, ShelvingUnit, Tags, TicketHelp, Warehouse } from '@/components/Icons';
import { STATION_PAGE_ICONS } from '@/lib/nav/station-nav-icons';
// Type-only, so it is ERASED at build time: the phone imports lanes without
// pulling the desk registry into its bundle. The icon type stays where its
// seven consumers already import it from.
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';

export type DomainGroupId =
  | 'inbound'
  | 'catalog'
  | 'inventory'
  | 'warehouse'
  | 'fulfillment'
  | 'sales'
  | 'support';

/**
 * Lane faces (N4, operator 2026-09-14).
 * Lane faces (N4, operator 2026-09-14). The spine used to draw
 * **The `icon` here is a PARENT icon** (operator 2026-09-14: *"icon at the
 */
// Order-agnostic lane names (owner 2026-09-28): Receiving takes stock in,
// Fulfillment sends it out — whatever the source document. `keywords`: the
// lane's former names, so ⌘K still finds it by them.
export const DOMAIN_GROUPS = [
  { id: 'sales', label: 'Sales', icon: SalesPrice },
  { id: 'inbound', label: 'Receiving', icon: Inbox, keywords: ['inbound'] },
  { id: 'fulfillment', label: 'Fulfillment', icon: STATION_PAGE_ICONS.outbound, keywords: ['outbound'] },
  // Inventory and Warehouse are two doors (owner 2026-10-06). Inventory is the
  // quantity job (stock). Warehouse is the building (locations, racks, labels).
  // The October 3 rename had folded both into one Warehouse door.
  { id: 'inventory', label: 'Inventory', icon: ShelvingUnit, keywords: ['stock'] },
  { id: 'warehouse', label: 'Warehouse', icon: Warehouse },
  { id: 'catalog', label: 'Products', icon: Tags },
  // Support (owner 2026-10-04): its own Workspaces lane — the `/support` workspace on the local model.
  { id: 'support', label: 'Support', icon: TicketHelp },
] as const satisfies ReadonlyArray<{
  id: DomainGroupId;
  label: string;
  icon: SidebarIconComponent;
  keywords?: readonly string[];
}>;

/**
 * LANE DOORS (operator 2026-09-27). A lane listed here is ONE row in every
 * page map — the lane's own name and parent icon, no dropdown of its pages.
 * The row opens the named landing page, and the landing page's contextual
 * sidebar is where the lane's pages and views live. Value = landing page id.
 *
 * Outbound first: "on click of outbound takes the user to the page" — no
 * Shipping / FBA / Label intake rows in the map. Add a lane here only when
 * its landing page's contextual panel reaches every page of the lane.
 */
export const LANE_DOORS: Readonly<Partial<Record<string, string>>> = {
  // Sales: Front desk is the landing page; its mode switcher reaches the
  // first-class Customers page on desktop just as the phone map does.
  sales: 'sales',
  fulfillment: 'outbound',
  // Inbound (operator 2026-09-27): Deliveries is the landing page; its mode
  // switcher reaches Sourcing.
  inbound: 'incoming',
  // Inventory lands on the stock ledger. Its views (All, Low, Out, Replenish)
  // are that page's children — one page, so the lane paints no mode switcher.
  inventory: 'stock',
  // Warehouse lands on Locations. QC labels is the other mode.
  warehouse: 'inventory',
  // Support lands on its one page (`/support`, row "Support items"); views live in its sidebar.
  support: 'support',
};

/** Look a lane up BY ID. */
export function domainLane<T extends DomainGroupId>(id: T) {
  const found = DOMAIN_GROUPS.find((group) => group.id === id);
  if (!found) throw new Error(`unknown domain group: ${id}`);
  return found as Extract<(typeof DOMAIN_GROUPS)[number], { id: T }>;
}

/**
 * **THE MOBILE-FIRST GATE — a lane the phone cannot run does not get a door.**
 * Operator ruling 2026-09-14, verbatim: *"everything should be mobile first …
 */
type LaneMobileFirstStatus =
  /** The phone runs this lane. */
  | 'ported'
  /** Desktop-only and IN USE — displays, and is queued for its port. */
  | 'desk-only'
  /** Not mobile-friendly and not in daily use: **no nav row on any surface.** */
  | 'hidden';
/** The lanes the gate can hide: */
type GatedLaneId = DomainGroupId | 'monitor';

export const LANE_MOBILE_FIRST: Readonly<Record<GatedLaneId, LaneMobileFirstStatus>> = {
  // Kept by name (operator 2026-09-14) — in daily desktop use, port next.
  inbound: 'desk-only',
  fulfillment: 'ported',
  inventory: 'desk-only',
  warehouse: 'desk-only',
  catalog: 'desk-only',
  // Operator 2026-09-16: restore the Sales desk door only; its phone route is
  // still absent from the mobile registry, so this does not create a mobile row.
  sales: 'desk-only',
  // Owner 2026-10-04: Support is its own workspace; the phone runs it at /m/support
  // (list, record, internal note, Log customer message).
  support: 'ported',
  /* PARKED 2026-09-16, operator ruling: */
  monitor: 'hidden',
};

/** False when this lane has no door on any surface (the mobile-first gate). */
export function isLaneVisible(id: string): boolean {
  const status = (LANE_MOBILE_FIRST as Record<string, LaneMobileFirstStatus | undefined>)[id];
  // An ungated id (floor) is not hidden — only a declared 'hidden' is.
  return status !== 'hidden';
}
