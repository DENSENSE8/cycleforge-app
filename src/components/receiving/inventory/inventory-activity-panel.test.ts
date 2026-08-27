/**
 * Inventory Activity receive/unreceive labels — spine NOTE + ADJUSTED rows.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiveEventLabel } from './InventoryActivityPanel';

test('receiveEventLabel: RECEIVED → Receive', () => {
  assert.equal(
    receiveEventLabel({
      id: 1,
      occurred_at: '',
      event_type: 'RECEIVED',
      actor_staff_id: null,
      actor_name: null,
      station: null,
      sku: null,
      serial_number: null,
      serial_unit_id: null,
      prev_status: null,
      next_status: null,
      notes: null,
    }),
    'Receive',
  );
});

test('receiveEventLabel: ADJUSTED + Unreceive notes → Unreceive', () => {
  assert.equal(
    receiveEventLabel({
      id: 2,
      occurred_at: '',
      event_type: 'ADJUSTED',
      actor_staff_id: null,
      actor_name: null,
      station: null,
      sku: 'SKU-1',
      serial_number: null,
      serial_unit_id: null,
      prev_status: null,
      next_status: null,
      notes: 'Unreceive −1 on line 42',
    }),
    'Unreceive',
  );
});

test('receiveEventLabel: NOTE + Unreceive workflow rewind → Unreceive (not raw NOTE)', () => {
  assert.equal(
    receiveEventLabel({
      id: 3,
      occurred_at: '',
      event_type: 'NOTE',
      actor_staff_id: null,
      actor_name: null,
      station: null,
      sku: null,
      serial_number: null,
      serial_unit_id: null,
      prev_status: 'DONE',
      next_status: 'MATCHED',
      notes: 'Unreceive: DONE → MATCHED',
    }),
    'Unreceive',
  );
});
