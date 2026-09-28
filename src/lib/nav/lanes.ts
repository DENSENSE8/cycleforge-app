/** The LANE registry — one taxonomy, both surfaces. */

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
 * Lane faces (N4, operator 2026-09-14).
 * Lane faces (N4, operator 2026-09-14). The spine used to draw
 * **The `icon` here is a PARENT icon** (operator 2026-09-14: *"icon at the
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
  fulfillment: 'outbound',
  // Inbound (operator 2026-09-27): Deliveries is the landing page; its mode
  // switcher reaches Sourcing.
  inbound: 'incoming',
  // Inventory (owner 2026-09-28): Inventory is the landing page; its mode
  // switcher reaches QC labels.
  inventory: 'inventory',
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
  catalog: 'desk-only',
  // Operator 2026-09-16: restore the Sales desk door only; its phone route is
  // still absent from the mobile registry, so this does not create a mobile row.
  sales: 'desk-only',
  support: 'hidden',
  /* PARKED 2026-09-16, operator ruling: */
  monitor: 'hidden',
};

/** False when this lane has no door on any surface (the mobile-first gate). */
export function isLaneVisible(id: string): boolean {
  const status = (LANE_MOBILE_FIRST as Record<string, LaneMobileFirstStatus | undefined>)[id];
  // An ungated id (floor) is not hidden — only a declared 'hidden' is.
  return status !== 'hidden';
}
