/**
 * Shared CSS Grid track template for comfortable-density search rows.
 *
 * Tracks: **Id | Status | Match | Tracking | Age**
 *
 * ## Why the id leads (operator 2026-09-12)
 *
 * A warehouse reader scans top-to-bottom down the LEFT edge, and the thing
 * they are checking a row against is the handle printed on the label in their
 * hand. So the verifiable identifier owns the premier slot. It used to be
 * fifth behind an entity glyph, which is the same picture on every row of a
 * scoped list.
 *
 * The Id track is RIGHT-ALIGNED and its content is `font-mono tabular-nums`,
 * so the column's right edge is a single line down the list. That — not
 * padding the value to a fixed width — is where uniformity comes from: a
 * padded id is a wrong id (`copy-chip-format.ts`).
 *
 * ## Why Status sits immediately beside it
 *
 * A state was a coloured dot on one edge of the row and its word on the other.
 * That splits one fact across the full width and costs two fixations to read a
 * single state. Dot and word are now one cluster in track two, next to the
 * identity they qualify.
 *
 * Match = title only. Tracking = TrackingChip on the right. Age = `auto` so an
 * empty age/journey cell collapses and Match keeps the fr.
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
