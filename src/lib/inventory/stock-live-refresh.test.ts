/**
 * The Stock desk's live-refresh invariants. Two of them, and both are about the
 * operator rather than the transport:
 *
 * 1. **Rows never move under a selection.** A `STOCK_DELTA_*` that lands while
 *    the verb strip is armed or the intake composer is open must not refresh —
 *    the strip writes the rows it was handed, so a row dropped mid-selection
 *    fires the verb on a different set than the one on screen.
 * 2. **A held delta is never dropped.** Whatever arrived behind the gate flushes
 *    the moment the gate lifts, so the desk cannot settle on a stale page.
 *
 * Pinned here rather than in the hook because there is no `renderHook` harness
 * in this repo, and the decision is the part with the invariant.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStockDeltaActivity,
  stockLiveRefreshLabel,
  stockLiveRefreshNext,
  STOCK_LIVE_REFRESH_IDLE,
} from './stock-live-refresh';

test('a delta on an idle desk refreshes at once and announces nothing', () => {
  const next = stockLiveRefreshNext(STOCK_LIVE_REFRESH_IDLE, { kind: 'delta', gated: false });
  assert.equal(next.refresh, true);
  assert.equal(next.state.pending, 0, 'idle refreshes; the fresh rows are the announcement');
});

test('a delta behind the gate is counted, never painted', () => {
  let state = STOCK_LIVE_REFRESH_IDLE;
  for (const _ of [0, 1, 2]) {
    const next = stockLiveRefreshNext(state, { kind: 'delta', gated: true });
    assert.equal(next.refresh, false, 'a selection must not be pulled out from under the operator');
    state = next.state;
  }
  assert.equal(state.pending, 3);
});

test('lifting the gate flushes everything it held, exactly once', () => {
  const held = stockLiveRefreshNext(STOCK_LIVE_REFRESH_IDLE, { kind: 'delta', gated: true }).state;

  const flush = stockLiveRefreshNext(held, { kind: 'ungated' });
  assert.equal(flush.refresh, true, 'a held delta is never dropped');
  assert.equal(flush.state.pending, 0);

  const again = stockLiveRefreshNext(flush.state, { kind: 'ungated' });
  assert.equal(again.refresh, false, 'nothing held means nothing to refresh');
  assert.equal(again.state, flush.state, 'no-change keeps identity so the desk does not re-render');
});

test('a refresh the desk ran itself clears the announcement without asking for another', () => {
  const held = stockLiveRefreshNext(STOCK_LIVE_REFRESH_IDLE, { kind: 'delta', gated: true }).state;
  const after = stockLiveRefreshNext(held, { kind: 'refreshed' });
  assert.equal(after.refresh, false, 'refreshing because of a refresh is the loop this rule exists to avoid');
  assert.equal(after.state.pending, 0);
});

test('only STOCK_DELTA_* events count as stock moving', () => {
  assert.equal(isStockDeltaActivity('STOCK_DELTA_TAKEN'), true);
  assert.equal(isStockDeltaActivity('STOCK_DELTA_TRANSFER_IN'), true);
  // The station feed carries scans, photos and serial adds on the same channel.
  assert.equal(isStockDeltaActivity('SERIAL_SCANNED'), false);
  assert.equal(isStockDeltaActivity(null), false);
});

test('the chip counts in the operator’s language', () => {
  assert.equal(stockLiveRefreshLabel(1), '1 new pairing');
  assert.equal(stockLiveRefreshLabel(4), '4 new pairings');
});
