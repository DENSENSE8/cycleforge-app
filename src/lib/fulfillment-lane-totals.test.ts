/** A To-ship tab number must equal the rows that tab shows. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveFulfillmentState,
  fulfillmentLaneTotals,
} from '@/lib/unshipped-state';

/** The grid's own rule: Pending hides only TESTED, so it shows PENDING+BLOCKED. */
function rowsOnPendingTab(rows: { hasTechScan: boolean; isOutOfStock: boolean }[]) {
  return rows.filter((r) => deriveFulfillmentState(r) !== 'TESTED').length;
}

/** Build the `/api/orders/queue-counts` payload those rows would produce. */
function countsFor(rows: { hasTechScan: boolean; isOutOfStock: boolean }[]) {
  const combos: { hasTechScan: boolean; blocked: boolean; count: number }[] = [];
  for (const r of rows) {
    const hit = combos.find((c) => c.hasTechScan === r.hasTechScan && c.blocked === r.isOutOfStock);
    if (hit) hit.count += 1;
    else combos.push({ hasTechScan: r.hasTechScan, blocked: r.isOutOfStock, count: 1 });
  }
  const total = rows.length;
  const tested = rows.filter((r) => r.hasTechScan).length;
  return { combos, byStage: { all: total, pending: total - tested, tested } };
}

describe('fulfillmentLaneTotals', () => {
  it('the reported case: one untested BLOCKED order is a tab of 1, not 2', () => {
    const rows = [{ hasTechScan: false, isOutOfStock: true }];
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
      { hasTechScan: false, isOutOfStock: false }, // PENDING
      { hasTechScan: false, isOutOfStock: false }, // PENDING
      { hasTechScan: false, isOutOfStock: true }, // BLOCKED (untested)
      { hasTechScan: true, isOutOfStock: true }, // BLOCKED (tested — blocked wins)
      { hasTechScan: true, isOutOfStock: false }, // TESTED
    ];
    const totals = fulfillmentLaneTotals(countsFor(rows));

    assert.equal(totals.pending, rowsOnPendingTab(rows), 'Pending tab vs Pending grid');
    // 2 PENDING + 2 BLOCKED (blocked wins over a tech scan, so the blocked+tested
    // row is on the Pending grid too — and must be in its total exactly once).
    assert.equal(totals.pending, 4);
    // A blocked+tested order belongs to BLOCKED, so the Tested tab must NOT
    // count it — `byStage.tested` (raw) would have said 2.
    assert.equal(totals.tested, 1);
    assert.equal(totals.blocked, 2);
  });

  it('falls back to the raw split ONLY when no combos are present, and never adds blocked there', () => {
    const degraded = { combos: [], byStage: { all: 4, pending: 3, tested: 1 } };
    assert.deepEqual(fulfillmentLaneTotals(degraded), { pending: 3, tested: 1, blocked: 0 });
    assert.deepEqual(fulfillmentLaneTotals(null), { pending: 0, tested: 0, blocked: 0 });
  });

  it('a legitimate zero lane is not treated as a missing value', () => {
    // The `||` chain's real defect: PENDING===0 is falsy, so it fell through to
    // the raw bucket. With combos present the raw split must never be consulted.
    const counts = countsFor([{ hasTechScan: false, isOutOfStock: true }]);
    assert.equal(counts.byStage.pending, 1, 'raw bucket does hold the blocked row');
    assert.equal(fulfillmentLaneTotals(counts).pending, 1, 'lane total ignores it');
  });
});
