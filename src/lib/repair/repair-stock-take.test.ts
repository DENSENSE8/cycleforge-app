import test from 'node:test';
import assert from 'node:assert/strict';
import { binsMostStockFirst, planBinReturn, planBinTake } from './repair-stock-take';

const take = (binQty: number | null, qty: number) => planBinTake({ binQty, qty, sku: 'PSU-12', binLabel: 'A-01' });

test('take: a bin holding exactly the quantity goes to zero, not refused', () => {
  assert.deepEqual(take(1, 1), { ok: true, after: 0 });
});

test('take: a bin holding more keeps the rest', () => {
  assert.deepEqual(take(5, 1), { ok: true, after: 4 });
});

test('take: a short bin is refused, never clamped to zero', () => {
  const plan = take(1, 2);
  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.equal(plan.available, 1);
    assert.match(plan.message, /A-01 holds only 1 × PSU-12/);
  }
});

test('take: an empty bin and a bin with no row for the SKU are both refused', () => {
  for (const binQty of [0, null]) {
    const plan = take(binQty, 1);
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.equal(plan.available, 0);
  }
});

test('take: a negative stored count is treated as empty, so it can never go further negative', () => {
  const plan = take(-3, 1);
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.available, 0);
});

test('take: a zero or fractional quantity is refused', () => {
  assert.equal(take(10, 0).ok, false);
  assert.equal(take(10, 1.5).ok, false);
});

test('return: deleting the action restores the bin to its count before the take', () => {
  const before = 3;
  const plan = take(before, 1);
  assert.equal(plan.ok, true);
  if (plan.ok) assert.equal(planBinReturn({ binQty: plan.after, qty: 1 }), before);
});

test('return: a bin row removed since the take comes back holding just the part', () => {
  assert.equal(planBinReturn({ binQty: null, qty: 1 }), 1);
});

test('picker: most stock first, empty bins dropped, ties by natural label order', () => {
  const bins = [
    { locationId: 1, label: 'B-10', qty: 2 },
    { locationId: 2, label: 'A-01', qty: 0 },
    { locationId: 3, label: 'B-2', qty: 2 },
    { locationId: 4, label: 'C-01', qty: 9 },
  ];
  assert.deepEqual(
    binsMostStockFirst(bins).map((b) => b.locationId),
    [4, 3, 1],
  );
});
