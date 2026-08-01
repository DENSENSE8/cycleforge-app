import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cartonPoTotal } from './po-total';

test('sums unit_price × quantity_expected across lines', () => {
  assert.equal(
    cartonPoTotal([
      { unit_price: '10.00', quantity_expected: 3 },
      { unit_price: '2.50', quantity_expected: 2 },
    ]),
    35,
  );
});

test('treats a missing / zero expected quantity as one ordered unit', () => {
  assert.equal(cartonPoTotal([{ unit_price: '88.77', quantity_expected: null }]), 88.77);
  assert.equal(cartonPoTotal([{ unit_price: '88.77', quantity_expected: 0 }]), 88.77);
});

test('skips lines with no usable price but still totals the priced ones', () => {
  assert.equal(
    cartonPoTotal([
      { unit_price: null, quantity_expected: 5 },
      { unit_price: '0', quantity_expected: 5 },
      { unit_price: 'not-a-number', quantity_expected: 5 },
      { unit_price: '4.00', quantity_expected: 2 },
    ]),
    8,
  );
});

test('returns null (honest absence) when NO line carries a price', () => {
  assert.equal(cartonPoTotal([{ unit_price: null, quantity_expected: 2 }]), null);
  assert.equal(cartonPoTotal([]), null);
  assert.equal(cartonPoTotal(null), null);
  assert.equal(cartonPoTotal(undefined), null);
});

test('never returns a float-drift artifact', () => {
  // 0.1 * 3 = 0.30000000000000004 in IEEE-754.
  assert.equal(cartonPoTotal([{ unit_price: '0.10', quantity_expected: 3 }]), 0.3);
});
