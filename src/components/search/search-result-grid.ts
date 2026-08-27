/**
 * Shared CSS Grid track template for comfortable-density search rows.
 *
 * Tracks: Glyph | Id | Match | Tracking | Age
 * (Monitor feed — no headers, no sort, no selection.)
 *
 * Glyph = Package (order) / PackageOpen (receiving), both blue.
 * Id = OrderIdChip / Po last-8 (never tracking).
 * Match = title only.
 * Tracking = TrackingChip last-8 on the right.
 * Age = `auto` so an empty age/journey cell collapses and Match keeps the fr.
 */

export const SEARCH_RESULT_GRID =
  'grid grid-cols-[1.25rem_4.25rem_minmax(0,1fr)_5.5rem_auto] items-center gap-x-2.5';

/**
 * Comfortable row pad — `inset-field` (px-3 py-2) so the selection ring has
 * breathing room without a second selected-state height.
 */
export const SEARCH_RESULT_ROW_PAD = 'inset-field';

/**
 * Header-preview track template — the find dropdown's aligned row.
 *
 * Tracks: Status | Id | Match | Tracking | Photos
 *
 * Status leads (leftmost) so the eye reads state → identity → what → where →
 * when across one line; the comfortable feed keeps its Glyph lead instead,
 * because /search is a monitor board and the header preview is a triage list.
 *
 * Photos is the trailing pack-photo CTA cell — ALWAYS painted, on every row,
 * showing a real count (`0` included) rather than appearing only when photos
 * exist. Fixed width so every row's CTA lands on the same vertical line.
 *
 * Sized against the 24rem find field, which the panel matches exactly. That
 * budget is why relative AGE is not a track here: six columns in 24rem leave
 * Match ~3rem, which truncates every title to nothing. The /search feed keeps
 * age because it has the width to spend.
 */
export const SEARCH_RESULT_DROPDOWN_GRID =
  'grid grid-cols-[4.25rem_4rem_minmax(0,1fr)_4.5rem_2.5rem] items-center gap-x-1.5';

/** Header-preview row pad — tighter than comfortable; the panel is a preview. */
export const SEARCH_RESULT_DROPDOWN_ROW_PAD = 'px-3 py-2';
