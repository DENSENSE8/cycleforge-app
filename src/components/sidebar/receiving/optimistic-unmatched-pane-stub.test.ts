/**
 * Unit tests for the ONE Unbox pre-resolve row (rail pending row + empty pane).
 *
 * Run: `tsx --test src/components/sidebar/receiving/optimistic-unmatched-pane-stub.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingScanRow, isPendingScanRow } from './receiving-sidebar-shared';
import { receivingRailRowKey, receivingRailShipmentKey } from '@/lib/receiving/rail/rail-carton-key';

test('buildPendingScanRow is an openable unmatched row with no carton yet', () => {
  const row = buildPendingScanRow(' 1Z999  ');
  assert.equal(row.receiving_source, 'unmatched');
  assert.equal(row.receiving_id, null);
  assert.equal(row.tracking_number, '1Z999');
  assert.ok(row.id < 0);
  assert.equal(isPendingScanRow(row), true);
});

test('keys on the CANONICAL tracking — an IMpb label spelling meets the stored row key', () => {
  const stored = '9400100000382441843263';
  const row = buildPendingScanRow(`42090210${stored}`);
  assert.equal(row.client_event_id, receivingRailShipmentKey(stored));
  assert.equal(row.tracking_number, stored);
  // The resolved carton's own durable key is the same one, so it upgrades in place.
  assert.equal(row.client_event_id, receivingRailRowKey({ tracking_number: stored, receiving_id: 7 }));
  // Same scan → same fake id, whichever spelling.
  assert.equal(row.id, buildPendingScanRow(stored).id);
});

test('a resolved carton row is never mistaken for the pending row', () => {
  const row = { ...buildPendingScanRow('1Z999'), receiving_id: 42 };
  assert.equal(isPendingScanRow(row), false);
});
