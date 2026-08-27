/**
 * Shared constants for the Outbound dashboard sidebar (filter map).
 * Saved-view param keys must match the board table menus so a view saved in
 * either place applies the same URL subset.
 */

/**
 * Facet ownership on the To-ship / Outbound desk — the deduplication contract.
 *
 * Every triage facet has exactly ONE surface that owns it, so the left Focus
 * rail can never restate a lifecycle tab (Band 1) or a KPI attention tile
 * (Band 2). This is the SoT the rail builds its rows from, and the one the
 * guard (`outbound-rail-dedup.guard.test.ts`) reads to prove no drift.
 *
 *   'tabs' — lifecycle stages, owned by the Band-1 tab band:
 *            `unshipped` (Pending) · `tested` · `packed` · `shipped`, and the
 *            `PENDING` / `TESTED` fulfillment lanes those tabs resolve to.
 *   'kpi'  — attention facets, owned by the Band-2 `OutboundKpiStrip`:
 *            `attention` (Urgent) · `BLOCKED` (Out of stock).
 *   'rail' — the left Focus rail's own job: `mine` (personal scope).
 *
 * Why this exists: the rail once carried All / Urgent / Pending / Tested /
 * Out-of-stock rows that duplicated the tabs + KPI (report P1/P5/P8 — single
 * primary nav for stage · metrics are not a third nav · one count, one home).
 * Deleting the rows once is not enough; nothing stopped them coming back. The
 * ownership map + guard make re-adding a stage or KPI facet to the rail a test
 * failure, and the `RailOwnedSegmentId` type makes it a compile error.
 */
export const OUTBOUND_FACET_OWNER = {
  unshipped: 'tabs',
  tested: 'tabs',
  packed: 'tabs',
  shipped: 'tabs',
  PENDING: 'tabs',
  TESTED: 'tabs',
  attention: 'kpi',
  BLOCKED: 'kpi',
  packPlaced: 'kpi',
  packStation: 'kpi',
  mine: 'rail',
} as const satisfies Record<string, 'tabs' | 'kpi' | 'rail'>;

export type OutboundFacetId = keyof typeof OUTBOUND_FACET_OWNER;

/**
 * The facet ids the left Focus rail may render — derived from the ownership map,
 * never hand-listed. Adding a `'rail'` owner grows this; nothing else can enter.
 */
export type RailOwnedSegmentId = {
  [K in OutboundFacetId]: (typeof OUTBOUND_FACET_OWNER)[K] extends 'rail' ? K : never;
}[OutboundFacetId];

export const RAIL_OWNED_SEGMENT_IDS = (
  Object.keys(OUTBOUND_FACET_OWNER) as OutboundFacetId[]
).filter((id): id is RailOwnedSegmentId => OUTBOUND_FACET_OWNER[id] === 'rail');

/** Unshipped board saved views — filters only, never search text. */
const UNSHIPPED_VIEW_PARAMS = [
  'stage',
  'ustatus',
  'staff',
  'late',
  'attention',
  'packPlaced',
  'packStation',
] as const;

/** Shipped board saved views — matches DashboardShippedTable. */
const SHIPPED_VIEW_PARAMS = [
  'shippedFilter',
  'shippedSearchField',
  'ostatus',
  'staff',
  'exceptions',
] as const;

/** Packed tab — staff + packed-at window (exact staged list). */
const PACKED_VIEW_PARAMS = ['staff', 'dateFrom', 'dateTo', 'allDates'] as const;

export const UNSHIPPED_SAVED_VIEWS_KEY = 'unshipped_saved_views';
export const SHIPPED_SAVED_VIEWS_KEY = 'shipped_saved_views';
export const PACKED_SAVED_VIEWS_KEY = 'packed_saved_views';

/**
 * Mode → saved-views (storageKey, paramKeys) — the ONE resolver both the rail
 * list ({@link OutboundSavedViewsList}) and the Band-3 Views menu
 * ({@link OutboundViewsMenu} → {@link WorkbenchViewsMenu}) read, so the faces
 * over `useSavedViews` cannot disagree about what a view captures on a lane.
 */
export function outboundSavedViewsConfig(mode: 'unshipped' | 'packed' | 'shipped'): {
  storageKey: string;
  paramKeys: readonly string[];
} {
  if (mode === 'packed') {
    return { storageKey: PACKED_SAVED_VIEWS_KEY, paramKeys: PACKED_VIEW_PARAMS };
  }
  if (mode === 'shipped') {
    return { storageKey: SHIPPED_SAVED_VIEWS_KEY, paramKeys: SHIPPED_VIEW_PARAMS };
  }
  return { storageKey: UNSHIPPED_SAVED_VIEWS_KEY, paramKeys: UNSHIPPED_VIEW_PARAMS };
}
