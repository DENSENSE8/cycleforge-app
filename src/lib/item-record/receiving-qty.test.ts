/**
 *   node --import tsx --test src/lib/item-record/receiving-qty.test.ts
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { receivingQty } from './receiving-qty';

test('missing received is got 0, never listed-as-got', () => {
  assert.deepEqual(receivingQty({ quantity_expected: 1, quantity_received: null }), {
    counted: 0,
    expected: 1,
    receive: true,
  });
});

test('partial got stays partial', () => {
  assert.deepEqual(receivingQty({ quantity_expected: 3, quantity_received: 1 }), {
    counted: 1,
    expected: 3,
    receive: true,
  });
});
