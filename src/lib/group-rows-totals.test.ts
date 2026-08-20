/**
 * Guard: group rollups are a fact of the group, and a blank never poisons one.
 *
 *   npx tsx --test src/lib/group-rows-totals.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupRowsBy, rowGroupTotals, rowGroupTotalsByKey } from './group-rows';

type Line = { po: string; units: number; short: number };
const LINES: Line[] = [
  { po: 'PO-1', units: 100, short: 0 },
  { po: 'PO-1', units: 240, short: 3 },
  { po: 'PO-2', units: 12, short: 0 },
];

describe('rowGroupTotals', () => {
  it('counts rows and sums the caller-named measures', () => {
    const [first] = groupRowsBy(LINES, (l) => l.po);
    const totals = rowGroupTotals(first, { units: (l) => l.units, short: (l) => l.short });
    assert.equal(totals.count, 2);
    assert.deepEqual(totals.measures, { units: 340, short: 3 });
  });

  it('a blank contributes nothing rather than poisoning the sum to NaN', () => {
    // One missing qty must not erase the other eleven lines — the same
    // reasoning that sends blanks last in `compareGridValues`.
    const withBlank = groupRowsBy(
      [{ po: 'PO-9', units: 5, short: 0 }, { po: 'PO-9', units: Number.NaN, short: 0 }],
      (l) => l.po,
    )[0];
    const totals = rowGroupTotals(withBlank, { units: (l) => l.units });
    assert.equal(totals.measures.units, 5);
    assert.equal(totals.count, 2, 'the blank row still COUNTS — it exists');
  });

  it('count is always present even with no measures declared', () => {
    const [first] = groupRowsBy(LINES, (l) => l.po);
    assert.deepEqual(rowGroupTotals(first), { count: 2, measures: {} });
  });

  it('rolls a whole band in one pass, keyed by group key', () => {
    const groups = groupRowsBy(LINES, (l) => l.po);
    const byKey = rowGroupTotalsByKey(groups, { units: (l) => l.units });
    assert.equal(byKey.get('PO-1')?.measures.units, 340);
    assert.equal(byKey.get('PO-2')?.measures.units, 12);
    assert.equal(byKey.size, 2);
  });
});
