/**
 * Shared types + constants for the Operations master-page sidebar.
 *
 * The Operations page is a single contextual sidebar + a mostly-visual right
 * pane (the house sidebar-mode contract). The five modes below are the
 * top-level switcher; each owns its own search placeholder, result list, and
 * right-pane view. `?mode=` in the URL is the single source of truth — never a
 * local `useState`. Mirrors `receiving-sidebar-shared.ts`.
 *
 * Pure data only — no JSX.
 */

import { MapPin, PackageCheck, ScanBarcode } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import type { JourneyDimension } from '@/lib/timeline/journey';

// ── Sidebar mode switcher ───────────────────────────────────────────────────

export type OperationsMode =
  | 'live' | 'insights' | 'history' | 'signals' | 'plans'
  | 'reconciliation' | 'checks'
  // Absorbed from /admin on dissolution: the monitor desk owns performance +
  // system observability. Nav children in SIDEBAR_PAGE_NAV carry each mode's
  // original permission gate.
  | 'goals' | 'quality' | 'staff' | 'sync' | 'logs';

/**
 * `live` is the default and stays on the bare `/operations` path (no `?mode=`)
 * for deep-link + realtime back-compat — it renders the existing floor
 * dashboard. The other modes flip `?mode=`.
 *
 * - live            → real-time operations (the existing OperationsDashboard)
 * - (analytics)     → RETIRED 2026-09-16. The deep-analytics pane's KPI strip
 *   compared a partial PST day with a whole one and carried three
 *   hardcoded-zero deltas, so the operator could not trust any number on it.
 *   The reconcilable half is `/reports?tab=packer`, a registered family whose
 *   every row is one pack scan. `parseOperationsMode` no longer answers the
 *   token, so an old bookmark degrades to Live.
 * - insights        → AI assistant, pre-scoped to live ops/inventory context
 * - history         → forensic "what happened" (Monitor)
 * - signals         → entity_signals timeline + browse
 * - plans           → legacy redirect to Home
 * - reconciliation  → CF-03 smear candidates + open tracking exceptions (Monitor)
 * - checks          → daily-check roster report (who still owes today's list)
 * - goals           → daily output targets and progress (ex-Admin › Goals)
 * - quality         → condition grades, failures, repair throughput (ex-Admin › Quality)
 * - staff           → weekly shifts, availability, shop calendar (ex-Admin › Staff schedule)
 * - sync            → cron job health + run history (ex-Admin › Sync Activity)
 * - logs            → bin / SKU / receiving operations log (ex-Admin › Operations log)
 * L2 mode list + icons live in SIDEBAR_PAGE_NAV (GlobalHeader Mode switcher).
 */

export const DEFAULT_OPERATIONS_MODE: OperationsMode = 'live';

/** Live Operations modes — includes default `live` (usually omitted). */
export const OPERATIONS_MODES = [
  'live',
  // 'analytics' intentionally absent — see the mode list above.
  'insights',
  'history',
  'signals',
  'plans',
  'reconciliation',
  'checks',
  'goals',
  'quality',
  'staff',
  'sync',
  'logs',
] as const satisfies readonly OperationsMode[];

export function parseOperationsMode(raw: string | null | undefined): OperationsMode {
  return raw === 'insights' ||
    raw === 'history' ||
    raw === 'signals' ||
    raw === 'plans' ||
    raw === 'reconciliation' ||
    raw === 'checks' ||
    raw === 'goals' ||
    raw === 'quality' ||
    raw === 'staff' ||
    raw === 'sync' ||
    raw === 'logs'
    ? raw
    : 'live';
}

/**
 * Wire tokens `?mode=` may carry on `/operations` (route-param hygiene).
 * Includes `live`. Do not round-trip {@link parseOperationsMode}.
 */
export function parseOperationsModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (OPERATIONS_MODES as readonly string[]).includes(v) ? v : null;
}

/**
 * URL params owned by a specific mode. Cleared on a mode switch so the next
 * mode lands on a clean default state (sidebar-mode law #4).
 */

// ── Master Operations Journey (History mode) ────────────────────────────────

/** Journey grouping dimension — one band per order / serial / tracking number. */
export const JOURNEY_DIMENSION_ITEMS: HorizontalSliderItem[] = [
  { id: 'order', label: 'Order', icon: PackageCheck },
  { id: 'serial', label: 'Serial', icon: ScanBarcode },
  { id: 'tracking', label: 'Tracking', icon: MapPin },
];

export function parseJourneyDimension(raw: string | null | undefined): JourneyDimension {
  return raw === 'serial' || raw === 'tracking' || raw === 'unit' ? raw : 'order';
}

/** Station facets — the UI vocab the journey endpoint maps to each spine. */
export const JOURNEY_STATION_ITEMS: HorizontalSliderItem[] = [
  { id: 'RECEIVING', label: 'Receiving' },
  { id: 'TECH', label: 'Testing' },
  { id: 'PACK', label: 'Packing' },
  { id: 'SHIP', label: 'Shipping' },
  { id: 'FBA', label: 'Amazon Prep' },
];

/** Curated event-type facets (raw event_type / activity_type / action values). */
export const JOURNEY_TYPE_ITEMS: { id: string; label: string }[] = [
  { id: 'RECEIVED', label: 'Received' },
  { id: 'TEST_PASS', label: 'Tested — Pass' },
  { id: 'TEST_FAIL', label: 'Tested — Fail' },
  { id: 'GRADED', label: 'Graded' },
  { id: 'TRACKING_SCANNED', label: 'Testing scan' },
  { id: 'SERIAL_ADDED', label: 'Serial added' },
  { id: 'PACK_COMPLETED', label: 'Packed' },
  { id: 'SHIP_CONFIRM', label: 'Shipped out' },
  { id: 'SHIPPED', label: 'Shipped' },
  { id: 'RETURNED', label: 'Returned' },
];

/** Which URL param carries the focused entity for a given dimension. */
export const JOURNEY_DIMENSION_PARAM: Record<
  JourneyDimension,
  'order' | 'serial' | 'tracking' | 'unit'
> = {
  order: 'order',
  serial: 'serial',
  tracking: 'tracking',
  unit: 'unit',
};

// Analytics time-range options DELETED 2026-09-16 with `?mode=analytics`.
// `AnalyticsRange` / `ANALYTICS_RANGE_LABELS` / `parseAnalyticsRange` had one
// consumer — the retired rail — and the range itself was a defect: a
// `24h/7d/30d` window over a page whose KPI strip was pinned to "today" and
// whose packing block walked a PST day. A report gets ONE day, stated.
// Sourcing's own range lives in `sourcing-shared.ts` and is untouched.
