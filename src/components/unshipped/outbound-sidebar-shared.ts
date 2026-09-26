/**
 * Outbound saved-view contract — one resolver for every surface that lists or
 * saves an Outbound view (the ledger's Views menu and the master-nav desk
 * section), so a view saved in either place applies the same URL subset.
 */

/** Unshipped board saved views — filters + sort pin, never search text. */
const UNSHIPPED_VIEW_PARAMS = [
  'stage',
  'ustatus',
  'staff',
  'late',
  'aging',
  'attention',
  'packPlaced',
  'packStation',
  'sort',
  'dir',
] as const;

/** Shipped board saved views — matches the Shipped ledger's feed (`useShippedTableFilters`). */
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

/** Mode → saved-views (storageKey, paramKeys) — the ONE resolver both the rail list ({@link OutboundSavedViewsList}) and the Band-3 Views… */
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
