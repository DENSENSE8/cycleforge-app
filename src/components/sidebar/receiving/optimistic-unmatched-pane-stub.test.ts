/**
 * Unit tests for Unbox empty-pane-first stub helpers.
 *
 * Run: `tsx --test src/components/sidebar/receiving/optimistic-unmatched-pane-stub.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOptimisticUnmatchedPaneStub,
  buildPendingScanStubRow,
  isOptimisticUnmatchedPaneStub,
  isPendingTriageScanRow,
  pendingScanReconcileKey,
} from './receiving-sidebar-shared';

test('buildOptimisticUnmatchedPaneStub is unmatched + null receiving_id + scan key', () => {
  const row = buildOptimisticUnmatchedPaneStub(' 1Z999  ');
  assert.equal(row.receiving_source, 'unmatched');
  assert.equal(row.receiving_id, null);
  assert.equal(row.tracking_number, '1Z999');
  assert.equal(row.client_event_id, pendingScanReconcileKey('1Z999'));
  assert.ok(row.id < 0);
  assert.equal(isOptimisticUnmatchedPaneStub(row), true);
  assert.equal(isPendingTriageScanRow(row), false);
});

test('buildPendingScanStubRow stays rail-only (not openable unmatched)', () => {
  const row = buildPendingScanStubRow('1Z999');
  assert.equal(row.receiving_source, null);
  assert.equal(row.item_name, '1Z999');
  assert.equal(isPendingTriageScanRow(row), true);
  assert.equal(isOptimisticUnmatchedPaneStub(row), false);
});

test('pane stub and rail stub share the same scan reconcile key', () => {
  const tracking = '9400111899223344556677';
  assert.equal(
    buildOptimisticUnmatchedPaneStub(tracking).client_event_id,
    buildPendingScanStubRow(tracking).client_event_id,
  );
});
