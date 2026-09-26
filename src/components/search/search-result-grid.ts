/**
 * Shared CSS Grid track template for comfortable-density search rows.
 * ## Why the id leads (operator 2026-09-12)
 */

export const SEARCH_RESULT_GRID =
  'grid grid-cols-[7rem_6.5rem_minmax(0,1fr)_5.5rem_auto] items-center gap-x-2.5';

/**
 * Comfortable row pad — `inset-field` (px-3 py-2) so the selection ring has
 * breathing room without a second selected-state height.
 */
export const SEARCH_RESULT_ROW_PAD = 'inset-field';

/**
 * The identity track's content face — the law in two utilities.
 *
 * `justify-end` is what makes the column edge one line; the mono + tabular
 * figures are what make the glyph advances equal so that edge is straight.
 */
export const SEARCH_RESULT_ID_CELL =
  'flex min-w-0 items-center justify-end font-mono tabular-nums';
