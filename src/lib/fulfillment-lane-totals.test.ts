/** A To-ship tab number must equal the rows that tab shows. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveFulfillmentState,
  fulfillmentLaneTotals,
} from '@/lib/unshipped-state';

/** The grid's own rule: Pending hides only PICKED, so it shows PENDING+BLOCKED. */
function rowsOnPendingTab(rows: { hasPickScan: boolean; isOutOfStock: boolean }[]) {
  return rows.filter((r) => deriveFulfillmentState(r) !== 'PICKED').length;
}

/** Build the `/api/orders/queue-counts` payload those rows would produce. */
function countsFor(rows: { hasPickScan: boolean; isOutOfStock: boolean }[]) {
  const combos: { hasPickScan: boolean; blocked: boolean; count: number }[] = [];
  for (const r of rows) {
    const hit = combos.find((c) => c.hasPickScan === r.hasPickScan && c.blocked === r.isOutOfStock);
    if (hit) hit.count += 1;
    else combos.push({ hasPickScan: r.hasPickScan, blocked: r.isOutOfStock, count: 1 });
  }
  const total = rows.length;
  const picked = rows.filter((r) => r.hasPickScan).length;
  return { combos, byStage: { all: total, pending: total - picked, picked } };
}

describe('fulfillmentLaneTotals', () => {
  it('the reported case: one untested BLOCKED order is a tab of 1, not 2', () => {
    const rows = [{ hasPickScan: false, isOutOfStock: true }];
    const counts = countsFor(rows);

    // The old formula, verbatim — this is what shipped the "2".
    const fromCombos = { PENDING: 0, BLOCKED: 1 };
    const legacy = (fromCombos.PENDING || counts.byStage.pending || 0) + fromCombos.BLOCKED;
    assert.equal(legacy, 2, 'sanity: the old formula really did double-count');

    assert.equal(rowsOnPendingTab(rows), 1);
    assert.equal(fulfillmentLaneTotals(counts).pending, 1);
  });

  it('tab total equals rendered rows across every signal combination', () => {
    const rows = [
      { hasPickScan: false, isOutOfStock: false }, // PENDING
      { hasPickScan: false, isOutOfStock: false }, // PENDING
      { hasPickScan: false, isOutOfStock: true }, // BLOCKED (untested)
      { hasPickScan: true, isOutOfStock: true }, // BLOCKED (tested — blocked wins)
      { hasPickScan: true, isOutOfStock: false }, // PICKED
    ];
    const totals = fulfillmentLaneTotals(countsFor(rows));

    assert.equal(totals.pending, rowsOnPendingTab(rows), 'Pending tab vs Pending grid');
    // 2 PENDING + 2 BLOCKED (blocked wins over a pick scan, so the blocked+tested
    // row is on the Pending grid too — and must be in its total exactly once).
    assert.equal(totals.pending, 4);
    // A blocked+tested order belongs to BLOCKED, so the Picked tab must NOT
    // count it — `byStage.picked` (raw) would have said 2.
    assert.equal(totals.picked, 1);
    assert.equal(totals.blocked, 2);
  });

  it('falls back to the raw split ONLY when no combos are present, and never adds blocked there', () => {
    const degraded = { combos: [], byStage: { all: 4, pending: 3, picked: 1 } };
    assert.deepEqual(fulfillmentLaneTotals(degraded), { pending: 3, picked: 1, blocked: 0 });
    assert.deepEqual(fulfillmentLaneTotals(null), { pending: 0, picked: 0, blocked: 0 });
  });

  it('a legitimate zero lane is not treated as a missing value', () => {
    // The `||` chain's real defect: PENDING===0 is falsy, so it fell through to
    // the raw bucket. With combos present the raw split must never be consulted.
    const counts = countsFor([{ hasPickScan: false, isOutOfStock: true }]);
    assert.equal(counts.byStage.pending, 1, 'raw bucket does hold the blocked row');
    assert.equal(fulfillmentLaneTotals(counts).pending, 1, 'lane total ignores it');
  });
});
