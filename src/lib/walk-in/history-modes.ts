/** Sales history domain mode axis — Local Pickup · Sales · Repairs, each with its own top-header tabs that swap between genuinely separate… */

import { ReceivingModeRepair, SalesPrice, ShoppingCart } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import type { RepairTab } from '@/lib/neon/repair-service-queries';

/** Sidebar modes, in required left→right order: Local Pickup · Sales · Repairs. */
export const WALK_IN_HISTORY_MODES = ['pickup', 'sales', 'repairs'] as const;
export type WalkInHistoryMode = (typeof WALK_IN_HISTORY_MODES)[number];

/** Sales is the surface identity — the default mode, dropped from the URL. */
export const DEFAULT_WALK_IN_HISTORY_MODE: WalkInHistoryMode = 'sales';

/** Mode rail items (sidebar `HorizontalButtonSlider`). Local Pickup leads with the cart. */
export const WALK_IN_HISTORY_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'pickup', label: 'Local Pickup', icon: ShoppingCart },
  { id: 'sales', label: 'Sales', icon: SalesPrice },
  { id: 'repairs', label: 'Repairs', icon: ReceivingModeRepair },
];

/** Extra permission a mode needs on top of the page gate (`walk_in.view`). */
export const WALK_IN_MODE_PERMISSION: Record<WalkInHistoryMode, PermissionString | null> = {
  pickup: null,
  sales: null,
  repairs: 'repair.view',
};

export function isWalkInHistoryMode(value: string | null | undefined): value is WalkInHistoryMode {
  return value != null && (WALK_IN_HISTORY_MODES as readonly string[]).includes(value);
}

export function parseWalkInHistoryMode(raw: string | null | undefined): WalkInHistoryMode {
  if (isWalkInHistoryMode(raw)) return raw;
  // Legacy `?category=` values map onto hub modes.
  if (raw === 'pickups') return 'pickup';
  // Singular `repair` bookmarks → Sales Repairs history desk (plural wire).
  if (raw === 'repair') return 'repairs';
  // `sales`, `all`, and everything unknown fall through to the default (Sales).
  return DEFAULT_WALK_IN_HISTORY_MODE;
}

/**
 * Wire tokens `?mode=` may carry on `/walk-in` / dashboard sales (hygiene).
 * Includes default `sales` plus legacy `repair` / `pickups` so deep links are
 * not stripped before {@link parseWalkInHistoryMode} runs.
 */
export function parseWalkInHistoryModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if ((WALK_IN_HISTORY_MODES as readonly string[]).includes(v)) return v;
  if (v === 'repair' || v === 'pickups') return v;
  return null;
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

// ── Repair `?tab=` SoT (station `/repair` + Sales `?mode=repairs`) ────────────
/** Station / task door default — open work queue. */
export const DEFAULT_REPAIR_TAB: RepairTab = 'active';
/** Sales history desk default — EVERY repair, any status (operator 2026-09-25: */
export const DEFAULT_SALES_REPAIR_TAB: RepairTab = 'all';

export function parseRepairTab(
  raw: string | null | undefined,
  defaultTab: RepairTab = DEFAULT_REPAIR_TAB,
): RepairTab {
  return raw === 'incoming' || raw === 'active' || raw === 'done' || raw === 'all' ? raw : defaultTab;
}

/** True when the URL is the Sales → Repairs history desk (not the station). */
export function isSalesRepairsDesk(
  pathname: string | null | undefined,
  searchParams: Pick<URLSearchParams, 'get'>,
): boolean {
  if (pathname !== '/dashboard' && pathname !== '/dashboard/') return false;
  return searchParams.get('mode') === 'repairs';
}

/** Surface-aware default tab for RepairTable chrome (Sales history vs station). */
export function defaultRepairTabForSurface(
  pathname: string | null | undefined,
  searchParams: Pick<URLSearchParams, 'get'>,
): RepairTab {
  return isSalesRepairsDesk(pathname, searchParams)
    ? DEFAULT_SALES_REPAIR_TAB
    : DEFAULT_REPAIR_TAB;
}

/** The default `?tab=` for a mode — used to drop it from the URL when active. */
export function defaultTabForMode(mode: WalkInHistoryMode): string {
  switch (mode) {
    case 'pickup':
      return DEFAULT_PICKUP_TAB;
    case 'repairs':
      return DEFAULT_SALES_REPAIR_TAB;
    case 'sales':
    default:
      return DEFAULT_SALES_TAB;
  }
}
