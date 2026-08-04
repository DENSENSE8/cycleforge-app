/**
 * Warehouse-membership answer for one tracking: which watch surface owns it.
 *
 * The ONE mapping — the Check rail, the Incoming tiles and the removal-reason
 * registry all read it, so they cannot disagree about what "delivered · not
 * unboxed" means.
 *
 * **Altitude:** its own dependency-free module (2026-08-02). It lived in
 * `check-zoho-received.ts`, which `await import`s `@/lib/tenancy/db` — and a
 * dynamic import is still an edge in the client graph, so `server-only` would
 * have failed the build the moment a client surface composed this pure
 * function. `check-zoho-received.ts` re-exports both names; every existing
 * import path is unchanged.
 */

export type CheckZohoReceivedWatchState =
  | 'delivered_unscanned'
  | 'delivered_not_unboxed'
  | 'in_flight'
  | 'done'
  | 'unknown';

/**
 * Which watch surface owns this tracking today. Pure, so the mapping is testable
 * and there is exactly one of it.
 *
 * Order matters and follows the existing feeds' own precedence: `unboxed` wins
 * outright (both delivered lanes exclude it), then a delivered box that was
 * never dock-scanned is the hunt queue, then delivered-but-not-opened.
 */
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
