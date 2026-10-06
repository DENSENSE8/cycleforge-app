/**
 * Operator mark: the buyer cancelled, so the order leaves Allocate and stays
 * on the record. `orders.status` holds {@link BUYER_CANCELLED_STATUS}; search
 * paints {@link BUYER_CANCEL_LABEL} instead of Fulfilled.
 */

/** Stored on `orders.status`. */
export const BUYER_CANCELLED_STATUS = 'buyer_cancelled';

/** The word search and the fulfillment record show. */
export const BUYER_CANCEL_LABEL = 'Buyer cancel';

/** Locate bucket id — a verdict, not a desk list. */
export const BUYER_CANCEL_BUCKET_ID = 'buyer_cancelled';

export function isBuyerCancelledStatus(status: unknown): boolean {
  return String(status ?? '').trim().toLowerCase() === BUYER_CANCELLED_STATUS;
}

/**
 * Locate membership for one order. A buyer cancel replaces Allocate and
 * Fulfilled — the search chip is only "Buyer cancel".
 */
export function locateBucketsForBuyerCancel(status: unknown, membership: readonly string[]): string[] {
  if (isBuyerCancelledStatus(status)) return [BUYER_CANCEL_BUCKET_ID];
  return [...membership];
}
