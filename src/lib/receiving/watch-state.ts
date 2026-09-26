/** Warehouse-membership answer for one tracking: */

export type CheckZohoReceivedWatchState =
  | 'delivered_unscanned'
  | 'delivered_not_unboxed'
  | 'in_flight'
  | 'done'
  | 'unknown';

/** Which watch surface owns this tracking today. */
export function resolveWatchState(args: {
  known: boolean;
  delivered: boolean;
  scanned: boolean;
  unboxed: boolean;
}): CheckZohoReceivedWatchState {
  if (!args.known) return 'unknown';
  if (args.unboxed) return 'done';
  if (!args.delivered) return 'in_flight';
  return args.scanned ? 'delivered_not_unboxed' : 'delivered_unscanned';
}
