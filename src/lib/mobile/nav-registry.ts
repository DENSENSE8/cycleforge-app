/**
 * Mobile navigation registry — the single SoT for `/m` navigation.
 *
 * Callers: `MobileSidebarDrawer` (destinations + active-route identification)
 * and `nav-name-collisions`. Human law: docs/mobile-first/SURFACE_LAW.md §8;
 * boundary law: ARCHITECTURE.md ("component split").
 *
 * This module is deliberately React-free: destinations are plain data, icons
 * are the renderer's concern (chrome law: pages are text; modes own glyphs —
 * the drawer keeps its own id→glyph map).
 *
 * Operator: 2026-09-14 — "focusing on the routing for the sidebar navigation
 * identification … first building a solid foundation."
 */

import { ListChecks } from '@/components/Icons';
import { domainLane } from '@/lib/nav/lanes';
import { TECH_NAV_ICONS } from '@/lib/nav/station-nav-icons';
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
const OUTBOUND = domainLane('fulfillment');

// Single source of truth for the drawer's destinations.
//
// **Operator ruling (2026-09-26):** the phone keeps scan, picks and the orders
// queue; everything else under `/m` was deleted. `/m/home` (Daily) leads the
// drawer because it is the post-sign-in landing and the first thing a staffer
// runs on a shift.
//
// **Scan is deliberately absent** (2026-08-21). It has a permanent seat in the
// top-right corner of every mobile screen (`MobileScanCta`), so a row here
// would be a second door to one destination.
export const MOBILE_NAV_DESTINATIONS: readonly MobileNavItem[] = [
  { kind: 'leaf', id: 'daily', label: 'Daily', href: '/m/home', icon: ListChecks },
  {
    kind: 'group',
    id: 'fulfillment',
    label: OUTBOUND.label,
    icon: OUTBOUND.icon,
    // `matchPrefixes` describes ROUTES, not rows: `/m/orders/[orderId]` and
    // `/m/shipping/shipments/[id]` resolve and belong to this lane, so a
    // deep-link there marks Outbound active even though no row points at it.
    matchPrefixes: ['/m/work', '/m/pick', '/m/pack', '/m/orders', '/m/shipping', '/m/exceptions'],
    children: [
      { kind: 'leaf', id: 'orders', label: 'Order management', href: '/m/orders' },
      { kind: 'leaf', id: 'picks', label: 'Picks', href: '/m/pick' },
      { kind: 'leaf', id: 'packing', label: 'Packing', href: '/m/pack' },
      { kind: 'leaf', id: 'exceptions', label: 'Exceptions', href: '/m/exceptions' },
    ],
  },
  // An L0 row, the phone twin of the desk's Quality Control station row (same
  // glyph). QC is its own scan TYPE (operator 2026-09-24), run on the one scan
  // kernel armed for QC — not a second scan door. Gated on `tech.qc_pass`, the
  // permission the checklist read and write carry, so a staffer who would 403
  // on the first step never sees it.
  {
    kind: 'leaf',
    id: 'qc',
    label: 'Quality control',
    href: QC_SCAN_HREF,
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
