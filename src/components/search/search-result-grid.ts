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
 */

export const SEARCH_RESULT_GRID =
  'grid grid-cols-[1.25rem_4.25rem_minmax(0,1fr)_5.5rem_3.25rem] items-center gap-x-2.5';

/** Comfortable row / skeleton pad — ops density (one-row scan), not rollup air. */
export const SEARCH_RESULT_ROW_PAD = 'px-3 py-1.5';
