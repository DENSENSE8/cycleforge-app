/**
 * The Stock desk's live-refresh rule — event-triggered, operator-gated.
 *
 * `/inventory/stock` is RSC + `force-dynamic`, so a "refresh" is
 * `router.refresh()` re-running `getStockByLocation` (a two-CTE union over
 * `bin_contents` ∪ `serial_units`, uncached). That is why this desk is driven by
 * the `STOCK_DELTA_*` publish out of `adjustBinQty` rather than by a clock: one
 * refresh per real commit, not twelve a minute per open tab. The repo's fastest
 * poll is 30s and `useOperationsTvBoard` already states the house position —
 * "no per-row socket, no busy poll".
 *
 * The rule this module holds is the other half, and it is the part that matters
 * more than the transport: **rows must not move under the operator.** They are
 * reading, ticking, about to run a verb — and the Stock verb strip writes the
 * `(location, sku, source)` rows it was handed
 * (`stock-bin-writes.ts`), so a refresh that drops a ticked row would fire the
 * verb on a different set than the one on screen.
 *
 * So a delta refreshes immediately while the desk is IDLE, and is merely
 * COUNTED while it is gated (a selection is armed, or the intake composer is
 * open). The held count is announced, and it flushes the moment the gate lifts.
 *
 * Pure on purpose: the hook around it
 * (`components/inventory/location-stock-grid/useLocationStockRealtime.ts`) owns
 * the channel, the debounce timer and `router.refresh()`; this owns the
 * decision, which is the part with an invariant worth pinning
 * ({@link stockLiveRefreshNext} — a delta is never silently dropped).
 */

/** The one activity-event family that means "stock moved" — see `publishStockLedgerEvent`. */
export const STOCK_DELTA_ACTIVITY_PREFIX = 'STOCK_DELTA_' as const;

/** Does this `activity.logged` event carry a stock delta? */
export function isStockDeltaActivity(activityType: string | null | undefined): boolean {
  return String(activityType ?? '').startsWith(STOCK_DELTA_ACTIVITY_PREFIX);
}

export interface StockLiveRefreshState {
  /** Deltas seen since the last refresh and held back because the desk was gated. */
  readonly pending: number;
}

export const STOCK_LIVE_REFRESH_IDLE: StockLiveRefreshState = { pending: 0 };

export type StockLiveRefreshEvent =
  /** A `STOCK_DELTA_*` landed. `gated` is read at EVENT time, never at subscribe time. */
  | { readonly kind: 'delta'; readonly gated: boolean }
  /** The gate lifted — selection cleared, composer closed. */
  | { readonly kind: 'ungated' }
  /** The desk refreshed for any reason (the flush, the chip, its own commit). */
  | { readonly kind: 'refreshed' };

export interface StockLiveRefreshNext {
  readonly state: StockLiveRefreshState;
  /** True when the caller should schedule its debounced `router.refresh()`. */
  readonly refresh: boolean;
}

/**
 * Advance the rule. Total over the three events, and never drops a delta: one
 * that arrives while gated is carried in {@link StockLiveRefreshState.pending}
 * until `ungated` flushes it. The no-change answers return the SAME state
 * object, so React's `useState` bails out instead of re-rendering the desk.
 */
export function stockLiveRefreshNext(
  state: StockLiveRefreshState,
  event: StockLiveRefreshEvent,
): StockLiveRefreshNext {
  switch (event.kind) {
    case 'delta':
      // Idle: refresh now and announce nothing — the rows themselves are the
      // announcement. Gated: hold it, and say how many are waiting.
      return event.gated
        ? { state: { pending: state.pending + 1 }, refresh: false }
        : { state: STOCK_LIVE_REFRESH_IDLE, refresh: true };

    case 'ungated':
      // Flush what the gate held. Nothing held means nothing to do — the desk
      // is already showing what it loaded.
      return state.pending > 0
        ? { state: STOCK_LIVE_REFRESH_IDLE, refresh: true }
        : { state, refresh: false };

    case 'refreshed':
      return state.pending > 0
        ? { state: STOCK_LIVE_REFRESH_IDLE, refresh: false }
        : { state, refresh: false };
  }
}

/** The chip's face — "3 new pairings", singular when it is one. */
export function stockLiveRefreshLabel(pending: number): string {
  return `${pending} new ${pending === 1 ? 'pairing' : 'pairings'}`;
}
