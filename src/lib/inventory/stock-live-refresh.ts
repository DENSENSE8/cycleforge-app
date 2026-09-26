/** The stock-moved signal for live surfaces. */

/** The one activity-event family that means "stock moved" — see `publishStockLedgerEvent`. */
export const STOCK_DELTA_ACTIVITY_PREFIX = 'STOCK_DELTA_' as const;

/** Does this `activity.logged` event carry a stock delta? */
export function isStockDeltaActivity(activityType: string | null | undefined): boolean {
  return String(activityType ?? '').startsWith(STOCK_DELTA_ACTIVITY_PREFIX);
}
