/**
 * Shared constants for the Outbound dashboard sidebar (filter map).
 * Saved-view param keys must match the board table menus so a view saved in
 * either place applies the same URL subset.
 */

/** Unshipped board saved views — filters only, never search text. */
export const UNSHIPPED_VIEW_PARAMS = [
  'stage',
  'ustatus',
  'staff',
  'late',
  'attention',
  'surface',
] as const;

/** Shipped board saved views — matches DashboardShippedTable. */
export const SHIPPED_VIEW_PARAMS = [
  'shippedFilter',
  'shippedSearchField',
  'ostatus',
  'staff',
  'exceptions',
] as const;

/** Packed tab — staff + surface only (exact staged list). */
export const PACKED_VIEW_PARAMS = ['staff'] as const;

export const UNSHIPPED_SAVED_VIEWS_KEY = 'unshipped_saved_views';
export const SHIPPED_SAVED_VIEWS_KEY = 'shipped_saved_views';
export const PACKED_SAVED_VIEWS_KEY = 'packed_saved_views';
