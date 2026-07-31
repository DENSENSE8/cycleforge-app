/**
 * Shared CSS Grid track template for comfortable-density search rows and their
 * skeletons. One template → zero reflow when loading → results.
 *
 * Tracks: Entity | Match | Status | Condition | Reference | Platform | Age
 * (Monitor feed — no headers, no sort, no selection.)
 */

export const SEARCH_RESULT_GRID =
  'grid grid-cols-[min-content_minmax(0,1fr)_120px_100px_140px_40px_80px] items-center gap-x-3';

/** Comfortable row / skeleton horizontal + vertical pad (must match). */
export const SEARCH_RESULT_ROW_PAD = 'px-4 py-3';
