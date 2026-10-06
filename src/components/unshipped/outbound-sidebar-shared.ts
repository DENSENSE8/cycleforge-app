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
  'pickedBy',
  'packedBy',
  'pickerId',
  'shipByFrom',
  'shipByTo',
  'orderFrom',
  'orderTo',
  'late',
  'aging',
  'attention',
  'packPlaced',
  'packStation',
  'sort',
  'dir',
  // The shared triage exclusion cut (`?hide=`) — saved views keep hidden statuses.
  'hide',
  // Allocate's status chips (`outbound.orders`, `?cardStatus=`) — a saved view keeps the cut.
  'cardStatus',
] as const;

/** Packed tab — staff + packed-at window (exact staged list). */
const PACKED_VIEW_PARAMS = ['staff', 'dateFrom', 'dateTo', 'allDates'] as const;

export const UNSHIPPED_SAVED_VIEWS_KEY = 'unshipped_saved_views';
export const PACKED_SAVED_VIEWS_KEY = 'packed_saved_views';

/** Mode → saved-views (storageKey, paramKeys) — the ONE resolver both the rail list ({@link OutboundSavedViewsList}) and the Band-3 Views… */
export function outboundSavedViewsConfig(mode: 'unshipped' | 'packed'): {
  storageKey: string;
  paramKeys: readonly string[];
} {
  if (mode === 'packed') {
    return { storageKey: PACKED_SAVED_VIEWS_KEY, paramKeys: PACKED_VIEW_PARAMS };
  }
  return { storageKey: UNSHIPPED_SAVED_VIEWS_KEY, paramKeys: UNSHIPPED_VIEW_PARAMS };
}
