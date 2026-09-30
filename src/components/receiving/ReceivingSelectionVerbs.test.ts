import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingActionPlacement, receivingAdvancePackages } from './ReceivingSelectionVerbs';

const row = (fields: Partial<ReceivingLineRow>) => fields as ReceivingLineRow;

test('Docked selection advances each unopened package once', () => {
  const packages = receivingAdvancePackages([
    row({ id: 1, receiving_id: 10 }),
    row({ id: 2, receiving_id: 10 }),
    row({ id: 3, receiving_id: 11, unboxed_at: '2026-09-29T20:00:00Z' }),
  ], 'unboxed');

  assert.deepEqual(packages.map(([id]) => id), [10]);
  assert.deepEqual(packages[0]?.[1].map((line) => line.id), [1, 2]);
});

test('Unboxed selection advances packages with unfinished receipt work', () => {
  const packages = receivingAdvancePackages([
    row({ id: 1, receiving_id: 20, workflow_status: 'DONE', received_done_at: '2026-09-29T20:00:00Z' }),
    row({ id: 2, receiving_id: 21, workflow_status: 'UNBOXED', received_done_at: null }),
  ], 'received');

  assert.deepEqual(packages.map(([id]) => id), [21]);
});

test('secondary receiving actions use the three-dot overflow', () => {
  assert.equal(receivingActionPlacement({ key: 'copy', primary: true }), 'primary');
  assert.equal(receivingActionPlacement({ key: 'print' }), 'overflow');
  assert.equal(receivingActionPlacement({ key: 'share' }), 'overflow');
  assert.equal(receivingActionPlacement({ key: 'location' }), 'overflow');
  assert.equal(receivingActionPlacement({ key: 'delete' }), 'isolated');
});
