import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReceivingLineRow } from './receiving-line-row';
import { dockedReceivedQuantity, dockedReceivingState } from './docked-record-state';
import { receivingLineMatchesQuery } from './receiving-line-search';

const row = (fields: Partial<ReceivingLineRow>) => fields as ReceivingLineRow;

test('expected and unknown records do not manufacture warehouse receipt or scan', () => {
  assert.equal(dockedReceivingState(row({ workflow_status: 'EXPECTED' })).id, 'UNKNOWN');
  assert.equal(dockedReceivingState(row({ delivery_state: 'IN_TRANSIT' })).id, 'IN_TRANSIT');
  assert.equal(dockedReceivingState(row({ workflow_status: 'MATCHED' })).id, 'SCANNED');
});

test('history uses the canonical receiving lifecycle and preserves exceptions', () => {
  for (const workflow_status of ['DONE', 'PASSED', 'AWAITING_TEST', 'IN_TEST']) {
    assert.equal(dockedReceivingState(row({ workflow_status })).id, 'RECEIVED');
  }
  assert.equal(dockedReceivingState(row({ workflow_status: 'FAILED' })).id, 'EXCEPTION');
  assert.equal(dockedReceivingState(row({ unboxed_at: '2026-09-25' })).id, 'UNBOXED');
  assert.equal(dockedReceivingState(row({ received_at: '2026-09-25' })).id, 'SCANNED');
});

test('zero received never displays the expected quantity as received', () => {
  assert.equal(dockedReceivedQuantity(row({ quantity_received: 0, quantity_expected: 5 })), 0);
  assert.equal(dockedReceivedQuantity(row({ quantity_expected: 5 })), 0);
  assert.equal(dockedReceivedQuantity(row({ quantity_received: 2, quantity_expected: 5 })), 2);
});

test('carton-only DONE placeholder is not a received item', () => {
  assert.equal(dockedReceivingState(row({ id: -53302, workflow_status: 'DONE', quantity_received: 0, unboxed_at: '2026-09-24T22:04:14Z' })).id, 'UNBOXED');
  assert.equal(dockedReceivingState(row({ id: -53302, workflow_status: 'DONE', quantity_received: 0 })).id, 'UNKNOWN');
  assert.equal(dockedReceivingState(row({ id: 32605, workflow_status: 'DONE', quantity_received: 1, received_done_at: '2026-09-24T20:54:25Z' })).id, 'RECEIVED');
});

test('local history search preserves PO, tracking, SKU, serial, and marketplace identity', () => {
  const sample = row({ id: 123, sku: 'BOSE-418', source_order_id: 'ORDER-009', tracking_number: '1Z999', units: [{ serial: 'SN-123' }] as ReceivingLineRow['units'] });
  for (const q of [' bose-418 ', 'order-009', '1z999', 'sn-123', '123', '']) assert.ok(receivingLineMatchesQuery(sample, q), q);
  assert.equal(receivingLineMatchesQuery(sample, 'absent'), false);
});
