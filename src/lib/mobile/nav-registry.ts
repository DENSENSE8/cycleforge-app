/**
 * Mobile navigation registry — the single SoT for `/m` navigation.
 * Operator: 2026-09-14 — "focusing on the routing for the sidebar navigation
 */

import { AlertTriangle, BarChart3, ListChecks, Tags, Warehouse } from '@/components/Icons';
import { domainLane } from '@/lib/nav/lanes';
import { TECH_NAV_ICONS } from '@/lib/nav/station-nav-icons';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';

// ─── Destination tree (sidebar drawer) ───────────────────────────────────────

/**
 * A row INSIDE a group.
 * point** — operator ruling 2026-09-14, *"icon at the parent level only"*. The
 */
type MobileNavChild = {
  kind: 'leaf';
  id: string;
  label: string;
  href: string;
  /** Permission this destination needs, or omitted when every signed-in staffer may reach it. */
  requires?: string;
};

/** An L0 row — a parent in its own right, so it wears a glyph. */
type MobileNavLeaf = MobileNavChild & {
  icon: SidebarIconComponent;
};

/** A LANE. Always a parent, so the glyph is required. */
type MobileNavGroup = {
  kind: 'group';
  id: string;
  label: string;
  icon: SidebarIconComponent;
  /** Any of these path prefixes marks the group (and its row) active. */
  matchPrefixes: string[];
  children: readonly MobileNavChild[];
};

type MobileNavItem = MobileNavLeaf | MobileNavGroup;

// Lane faces come from `@/lib/nav/lanes` — the SAME registry the desk spine groups by.
const INBOUND = domainLane('inbound');
const OUTBOUND = domainLane('fulfillment');

// Single source of truth for the drawer's destinations.
// **Operator ruling (2026-09-26):** the phone keeps scan, picks and the orders
export const MOBILE_NAV_DESTINATIONS: readonly MobileNavItem[] = [
  { kind: 'leaf', id: 'daily', label: 'Daily', href: '/m/home', icon: ListChecks },
  // The global Exceptions hub (owner 2026-09-28): every kind — Fulfillment,
  // Inventory, Receiving — in one list, so it is an L0 row of its own, not a
  // row inside any one lane (the desk's top-level Exceptions row, same glyph).
  { kind: 'leaf', id: 'exceptions', label: 'Exceptions', href: '/m/exceptions', icon: AlertTriangle },
  { kind: 'leaf', id: 'stock', label: 'Stock', href: '/m/stock', icon: Warehouse, requires: 'sku_stock.view' },
  { kind: 'leaf', id: 'products', label: 'Products', href: '/m/products', icon: Tags, requires: 'sku_stock.view' },
  { kind: 'leaf', id: 'reports', label: 'Reports', href: '/m/reports', icon: BarChart3, requires: 'operations.view' },
  {
    kind: 'group',
    id: 'fulfillment',
    label: OUTBOUND.label,
    icon: OUTBOUND.icon,
    // `matchPrefixes` describes ROUTES, not rows: `/m/orders/[orderId]` and
    // `/m/shipping/shipments/[id]` resolve and belong to this lane, so a
    // deep-link there marks Outbound active even though no row points at it.
    matchPrefixes: ['/m/work', '/m/pick', '/m/pack', '/m/orders', '/m/shipping', '/m/imports'],
    children: [
      { kind: 'leaf', id: 'orders', label: 'Allocate', href: '/m/orders' },
      { kind: 'leaf', id: 'picks', label: 'Picks', href: '/m/pick' },
      { kind: 'leaf', id: 'packing', label: 'Packing', href: '/m/pack' },
      // The import record's phone twin (desk: `/operations/imports`) — what each import brought in.
      { kind: 'leaf', id: 'imports', label: 'Imports', href: '/m/imports', requires: 'orders.view' },
    ],
  },
  {
    kind: 'group',
    id: 'inbound',
    label: INBOUND.label,
    icon: INBOUND.icon,
    // The phone Unbox photo feed. `/m/r/` is the receiving detail hub a feed
    // row's carton sheet opens into; `/m/receiving/history` is the feed's
    // "View all" search — both resolve inside this lane.
    matchPrefixes: ['/m/receiving', '/m/r/'],
    children: [
      { kind: 'leaf', id: 'photos', label: 'Photo feed', href: '/m/receiving' },
      { kind: 'leaf', id: 'pickup-paperwork', label: 'Pickup paperwork', href: '/m/receiving/pickup/new?type=PICKUP', requires: 'walk_in.intake' },
    ],
  },
  // An L0 row, the phone twin of the desk's Quality Control station row (same
  // glyph). It opens the QC queue (owner 2026-09-29, `/m/qc`: every unit
  // waiting for QC, most urgent first); the queue's Scan to QC arms the one
  // scan kernel for QC (QC is its own scan TYPE, operator 2026-09-24).
  {
    kind: 'leaf',
    id: 'qc',
    label: 'Quality control',
    href: '/m/qc',
    icon: TECH_NAV_ICONS.testing,
    requires: 'tech.qc_pass',
  },
];

// ─── Active-route identification ─────────────────────────────────────────────

/**
 * Active-route identification for BOTH altitudes — an L0 row and a row inside
 * a lane answer the same question.
 */
export const isLeafActive = (pathname: string | null, href: string) => {
  if (!pathname) return false;
  // Exact match, plus prefix-match for nested detail routes.
  return pathname === href || pathname.startsWith(`${href}/`);
};

export const isGroupActive = (pathname: string | null, prefixes: string[]) =>
  !!pathname && prefixes.some((p) => pathname === p || pathname.startsWith(p));
