/**
 * Zebra striping for grouped ledger rows.
 *
 * Collapsed multi-child groups occupy **one** visible row (the summary), so the
 * stripe counter advances by 1 per top-level group — never by leaf count. Using
 * `group.rows.length` skipped parities whenever a multi-line order was folded,
 * which produced consecutive same-color rows (white-white / gray-gray).
 *
 * When day-band headers are visible, each day resets to 0 so a new band starts
 * clean. When headers are hidden (Pending spreadsheet Date column), the index
 * runs continuously across date buckets so a day boundary never doubles a
 * stripe.
 */

export function nextGroupStripeIndex(current: number): number {
  return current + 1;
}

/** Reset policy for the stripe cursor at the start of a date bucket. */
export function stripeIndexForDateStart(
  previous: number,
  showDayHeaders: boolean,
): number {
  return showDayHeaders ? 0 : previous;
}
