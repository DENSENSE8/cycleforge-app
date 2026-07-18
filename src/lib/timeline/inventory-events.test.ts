/**
 * Run: npx tsx --test src/lib/timeline/inventory-events.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryEventsToTimeline } from './inventory-events';

test('PUTAWAY with bin_barcode emits a bin ref + location href', () => {
  const [item] = inventoryEventsToTimeline([
    {
      id: 1,
      occurred_at: '2026-07-01T12:00:00.000Z',
      event_type: 'PUTAWAY',
      actor_name: 'Sam',
      serial_number: 'SN-1',
      sku: 'SKU-1',
      prev_status: 'TESTED',
      next_status: 'STOCKED',
      bin_barcode: 'BIN-A4',
      bin_name: 'Aisle A / Bin 4',
    },
  ]);
  assert.equal(item.title, 'Put away');
  assert.equal(item.ref?.kind, 'bin');
  assert.equal(item.ref?.value, 'BIN-A4');
  assert.equal(item.ref?.href, '/inventory/location/BIN-A4');
  assert.match(item.subtitle ?? '', /Aisle A \/ Bin 4/);
  assert.equal(item.sourceEventType, 'PUTAWAY');
});

test('TEST_PASS keeps serial ref (no bin chip)', () => {
  const [item] = inventoryEventsToTimeline([
    {
      id: 2,
      occurred_at: '2026-07-01T11:00:00.000Z',
      event_type: 'TEST_PASS',
      actor_name: 'Sam',
      serial_number: 'SN-1',
      sku: null,
      prev_status: 'IN_TEST',
      next_status: 'TESTED',
    },
  ]);
  assert.equal(item.ref?.kind, 'serial');
  assert.equal(item.ref?.value, 'SN-1');
  assert.equal(item.ref?.href, undefined);
});
