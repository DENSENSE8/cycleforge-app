/**
 * The stock-moved signal for live surfaces.
 *
 * Every bin commit goes through `adjustBinQty`, which publishes an
 * `activity.logged` event whose type starts `STOCK_DELTA_` on the org's
 * station channel. A surface that shows counts (the single-bin view, the SKU
 * exceptions desk) refreshes on that event rather than on a clock: one
 * refresh per real commit, including a phone's offline queue draining minutes
 * later.
 */

/** The one activity-event family that means "stock moved" — see `publishStockLedgerEvent`. */
export const STOCK_DELTA_ACTIVITY_PREFIX = 'STOCK_DELTA_' as const;

/** Does this `activity.logged` event carry a stock delta? */
export function isStockDeltaActivity(activityType: string | null | undefined): boolean {
  return String(activityType ?? '').startsWith(STOCK_DELTA_ACTIVITY_PREFIX);
}
