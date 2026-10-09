import test from 'node:test';
import assert from 'node:assert/strict';
import { toOrderReturns, UNBOX_SERIAL_SCAN_REASON } from './order-returns';

const row = (id: number, reason: string | null) => ({ receiving_line_id: id, receiving_id: 1, return_reason: reason, rma_ref: null, created_at: '2026-10-01T00:00:00Z' });

test('an Unbox intake placeholder is not a reason', () => {
  assert.deepEqual(toOrderReturns([row(1, UNBOX_SERIAL_SCAN_REASON)]).map((r) => r.reason), [null]);
});

test('a platform reason wins over the reasonless intake line beside it', () => {
  const out = toOrderReturns([row(1, UNBOX_SERIAL_SCAN_REASON), row(2, 'CR-DEFECTIVE'), row(3, null)]);
  assert.deepEqual(out.map((r) => [r.receivingLineId, r.reason]), [[2, 'CR-DEFECTIVE']]);
});

test('no returns stay no returns', () => {
  assert.deepEqual(toOrderReturns([]), []);
});
