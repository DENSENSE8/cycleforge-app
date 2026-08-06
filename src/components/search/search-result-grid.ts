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
