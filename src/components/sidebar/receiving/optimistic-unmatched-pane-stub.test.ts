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
import { receivingRailShipmentKey } from '@/lib/receiving/rail/rail-carton-key';

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

/**
 * The two stubs deliberately DIVERGED (they shared `scan:{tracking}` until the
 * rail moved to a shipment key). The rail stub keys on the shipment so the
 * resolved carton lands on that same React key and the row updates in place
 * instead of exiting and re-entering; the pane stub is not in the rail cache, so
 * it keeps the scan key. What still has to hold is that both key off the SAME
 * canonical scan — that is what lets `applyUnboxCartonOpened` sweep either one.
 */
test('rail stub keys on the shipment; pane stub keeps the scan key; both canonical', () => {
  const tracking = '9400 1118-9922 3344 556677';
  const rail = buildPendingScanStubRow(tracking);
  const pane = buildOptimisticUnmatchedPaneStub(tracking);

  assert.equal(rail.client_event_id, receivingRailShipmentKey(tracking));
  assert.equal(pane.client_event_id, pendingScanReconcileKey(tracking));
  assert.notEqual(rail.client_event_id, pane.client_event_id);

  // Same canonical key underneath — dashes and spaces stripped identically.
  assert.equal(
    String(rail.client_event_id).replace(/^stn:/, ''),
    String(pane.client_event_id).replace(/^scan:/, ''),
  );

  // Both are still recognised as pre-resolve stubs (the rail row stays
  // non-clickable while the scan is in flight).
  assert.equal(isPendingTriageScanRow(rail), true);
  assert.equal(isOptimisticUnmatchedPaneStub(pane), true);
});
