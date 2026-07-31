/**
 * Sales history domain mode axis — Local Pickup · Sales, each with its own
 * top-header tabs that swap between genuinely separate tables. Mounted on
 * `/dashboard?mode=sales|pickup` (former `/walk-in` L1). This is the analogue
 * of the inbound/outbound split in `src/lib/dashboard/dashboard-domains.ts`.
 *
 * Repair graduated to Receiving `/repair` (RepairTable + LedgerGrid) — it is
 * no longer a hub mode. Legacy `?mode=repair` / `?category=repairs` redirect at
 * the proxy; `parseRepairTab` stays here as the shared `?tab=` SoT for `/repair`.
 *
 * Modes ≠ tabs: the **mode** lives in the dashboard L2 rail (`?mode=`), the
 * **tab** lives in the main-pane header (`?tab=`, validated per mode). On the
 * dashboard, `mode=sales` stays in the URL (it is also the domain wire value).
 *
 * Pure data + functions (no React) so the sidebar slider, the master-nav rail
 * (`sidebar-navigation.ts`), the page header, and the body all read one SoT.
 * Legacy `?category=` coercion still lives in `history-categories.ts`.
 */

import { SalesPrice, ShoppingCart } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import type { RepairTab } from '@/lib/neon/repair-service-queries';

/** Sidebar modes, in required left→right order: Local Pickup · Sales. */
export const WALK_IN_HISTORY_MODES = ['pickup', 'sales'] as const;
export type WalkInHistoryMode = (typeof WALK_IN_HISTORY_MODES)[number];

/** Sales is the surface identity — the default mode, dropped from the URL. */
export const DEFAULT_WALK_IN_HISTORY_MODE: WalkInHistoryMode = 'sales';

/** Mode rail items (sidebar `HorizontalButtonSlider`). Local Pickup leads with the cart. */
export const WALK_IN_HISTORY_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'pickup', label: 'Local Pickup', icon: ShoppingCart },
  { id: 'sales', label: 'Sales', icon: SalesPrice },
];

/** Extra permission a mode needs on top of the page gate (`walk_in.view`). */
export const WALK_IN_MODE_PERMISSION: Record<WalkInHistoryMode, PermissionString | null> = {
  pickup: null,
  sales: null,
};

export function isWalkInHistoryMode(value: string | null | undefined): value is WalkInHistoryMode {
  return value != null && (WALK_IN_HISTORY_MODES as readonly string[]).includes(value);
}

export function parseWalkInHistoryMode(raw: string | null | undefined): WalkInHistoryMode {
  if (isWalkInHistoryMode(raw)) return raw;
  // Legacy `?category=` values map onto the remaining hub modes.
  if (raw === 'pickups') return 'pickup';
  // `repairs` / `repair` left the hub for `/repair` (proxy redirects); fall
  // through to Sales if somehow still parsed client-side.
  // `sales`, `all`, and everything unknown fall through to the default (Sales).
  return DEFAULT_WALK_IN_HISTORY_MODE;
}

/** One tab of a mode's top-header tab band. */
export interface WalkInModeTab {
  id: string;
  label: string;
}

// ── Local Pickup mode: Draft · Completed (local_pickup_orders.status) ─────────
export const PICKUP_TABS = ['draft', 'completed'] as const;
export type PickupTab = (typeof PICKUP_TABS)[number];
export const DEFAULT_PICKUP_TAB: PickupTab = 'completed';
export const PICKUP_TAB_ITEMS: WalkInModeTab[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'completed', label: 'Completed' },
];
/** Tab → the `?status=` the local-pickup API expects. */
export const PICKUP_TAB_STATUS: Record<PickupTab, string> = {
  draft: 'DRAFT',
  completed: 'COMPLETED',
};
export function parsePickupTab(raw: string | null | undefined): PickupTab {
  return raw != null && (PICKUP_TABS as readonly string[]).includes(raw)
    ? (raw as PickupTab)
    : DEFAULT_PICKUP_TAB;
}

// ── Sales mode: Today · All (Square walk-in charges) ──────────────────────────
export const SALES_TABS = ['today', 'all'] as const;
export type SalesTab = (typeof SALES_TABS)[number];
export const DEFAULT_SALES_TAB: SalesTab = 'today';
export const SALES_TAB_ITEMS: WalkInModeTab[] = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All' },
];
export function parseSalesTab(raw: string | null | undefined): SalesTab {
  return raw != null && (SALES_TABS as readonly string[]).includes(raw)
    ? (raw as SalesTab)
    : DEFAULT_SALES_TAB;
}

// ── Repair `?tab=` SoT (Receiving `/repair` queue — not a Walk-In hub mode) ───
export const DEFAULT_REPAIR_TAB: RepairTab = 'active';
export function parseRepairTab(raw: string | null | undefined): RepairTab {
  return raw === 'incoming' || raw === 'active' || raw === 'done' ? raw : DEFAULT_REPAIR_TAB;
}

/** The default `?tab=` for a mode — used to drop it from the URL when active. */
export function defaultTabForMode(mode: WalkInHistoryMode): string {
  switch (mode) {
    case 'pickup':
      return DEFAULT_PICKUP_TAB;
    case 'sales':
    default:
      return DEFAULT_SALES_TAB;
  }
}
