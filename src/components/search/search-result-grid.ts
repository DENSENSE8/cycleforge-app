/**
 * Shared CSS Grid track template for comfortable-density search rows and their
 * skeletons. One template → zero reflow when loading → results.
 *
 * Tracks: Glyph | Id | Match | Tracking | Age
 * (Monitor feed — no headers, no sort, no selection.)
 *
 * Glyph = Package (order) / PackageOpen (receiving), both blue.
 * Id = OrderIdChip / Po last-4 (never tracking).
 * Match = title only.
 * Tracking = TrackingChip last-4 on the right.
 * Age = `auto` so an empty age/journey cell collapses and Match keeps the fr.
 */

export const SEARCH_RESULT_GRID =
  'grid grid-cols-[1.25rem_4.25rem_minmax(0,1fr)_5.5rem_auto] items-center gap-x-2.5';

/**
 * Comfortable row / skeleton pad — `inset-field` (px-3 py-2) so the selection
 * ring has breathing room without a second selected-state height.
 */
export const SEARCH_RESULT_ROW_PAD = 'inset-field';

/**
 * Estimated skeleton row height in px (14px glyph + inset-field py-2 + divide-y).
 * Slightly under the measured row so ceil() prefers overshoot (flush to bottom).
 */
export const SEARCH_SKELETON_ROW_PX = 30;

/** Top pad on the loading shell (`pt-2`) — subtracted from measured height. */
export const SEARCH_SKELETON_TOP_PAD_PX = 8;

/** Floor so short panes / pre-measure paint still look populated. */
export const SEARCH_SKELETON_MIN = 10;

/** How many skeleton rows to paint for a measured scroll-body height. */
export function searchSkeletonCount(
  heightPx: number,
  rowPx: number = SEARCH_SKELETON_ROW_PX,
  min: number = SEARCH_SKELETON_MIN,
): number {
  if (heightPx <= 0) return min;
  return Math.max(min, Math.ceil(heightPx / rowPx));
}
