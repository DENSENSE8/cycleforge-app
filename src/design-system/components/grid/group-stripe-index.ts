/** Zebra striping for grouped ledger rows. */

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
