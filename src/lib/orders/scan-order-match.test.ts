/** A scan on To ship opens the order it names — precedence and carrier normalisation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchScannedOrder } from './scan-order-match';

const rows = [
  // Earlier in the list: a tracking number that is ALSO another order's number.
  { id: 1, order_id: 'A-100', shipping_tracking_number: '1234567890' },
  { id: 2, order_id: '1234567890', shipping_tracking_number: null },
  { id: 3, order_id: '112-7654321-7654321', tracking_numbers: ['9400111899223817500000'] },
];

test('an order number outranks an earlier row whose tracking normalises to the same value', () => {
  assert.equal(matchScannedOrder('1234567890', rows)?.id, 2);
});

test('a USPS IMpb scan (420 + ZIP routing prefix) finds the row storing the human tracking number', () => {
  assert.equal(matchScannedOrder('420902109400111899223817500000', rows)?.id, 3);
});

test('a packing-slip order number matches without its # or dashes', () => {
  assert.equal(matchScannedOrder('#11276543217654321', rows)?.id, 3);
});

test('a scan that normalises to nothing never matches a row with blank facts', () => {
  const blank = [{ id: 9, order_id: '', shipping_tracking_number: '' }];
  assert.equal(matchScannedOrder('---', blank), null);
});
