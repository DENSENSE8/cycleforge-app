/**
 * Run: npx tsx --test src/lib/timeline/inventory-events.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryEventsToTimeline } from './inventory-events';
import type { InventoryTimelineRow } from './inventory-events';
import type { TraceEvent } from '@/lib/audit-log/trace-aggregator';

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
  assert.equal(item.ref?.href, '/inventory?bin=BIN-A4');
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

test('a NOTE shows what was written, not the word "Note"', () => {
  // The real carton-50354 row. Before this, the operator's sentence was
  // selected by the spine, carried through the API, and then dropped by the
  // adapter — the journey said "Note" and nothing else.
  const [item] = inventoryEventsToTimeline([
    {
      id: 5834,
      occurred_at: '2026-07-31T22:14:31.024Z',
      event_type: 'NOTE',
      actor_name: 'Kai',
      serial_number: '049331f81860251ae',
      sku: null,
      prev_status: null,
      next_status: null,
      notes: 'Unmatched return serial 049331f81860251ae — no order match',
    },
  ]);
  assert.equal(item.title, 'Unmatched return serial 049331f81860251ae — no order match');
  assert.equal(item.sourceEventType, 'NOTE');
});

test('an empty / whitespace note falls back to the curated title', () => {
  for (const notes of [null, '', '   ']) {
    const [item] = inventoryEventsToTimeline([
      {
        id: 1,
        occurred_at: '2026-07-01T12:00:00.000Z',
        event_type: 'NOTE',
        actor_name: null,
        serial_number: null,
        sku: null,
        prev_status: null,
        next_status: null,
        notes,
      },
    ]);
    assert.equal(item.title, 'Note');
  }
});

test('only NOTE-family events title from their text', () => {
  // A RECEIVED carries machine text ("Serial …") that is already the chip;
  // letting it win would replace the curated verdict with a restatement.
  const [item] = inventoryEventsToTimeline([
    {
      id: 5833,
      occurred_at: '2026-07-31T22:14:30.312Z',
      event_type: 'RECEIVED',
      actor_name: 'Kai',
      serial_number: '049331F81860251AE',
      sku: null,
      prev_status: null,
      next_status: 'RECEIVED',
      notes: 'Serial 049331F81860251AE',
    },
  ]);
  assert.equal(item.title, 'Received');
});

test('every projection that claims to feed this adapter still satisfies its row', () => {
  // `TraceEvent` (src/lib/audit-log/trace-aggregator.ts) calls itself "a
  // structural subset of the spine record, shaped so the client can feed it
  // straight through inventoryEventsToTimeline". It stopped being one: four
  // fields the adapter reads — notes, actor_staff_id, bin_barcode, bin_name —
  // were dropped in the projection, so a trace would have rendered NOTEs as the
  // word "Note", with no avatar and no bin chip. Exactly the defect journey.ts
  // had.
  //
  // The KEY-completeness half of the contract is enforced in trace-aggregator.ts
  // itself, not here: `**\/*.test.ts` is excluded from tsconfig and tsx strips
  // types without checking them, so a type-level assertion in a test file is
  // evaluated by nothing. This test owns the BEHAVIOURAL half — that a row which
  // has been through the projection still renders everything it should.
  const feedsAdapter = (e: TraceEvent): InventoryTimelineRow => e;

  // Also exercise it, so the assertion is not purely structural: a NOTE routed
  // through the projection must still arrive carrying its sentence.
  const [item] = inventoryEventsToTimeline([
    feedsAdapter({
      id: 1,
      occurred_at: '2026-08-02T10:00:00.000Z',
      event_type: 'NOTE',
      actor_staff_id: 7,
      actor_name: 'Kai',
      station: 'RECEIVING',
      serial_number: null,
      sku: null,
      bin_barcode: null,
      bin_name: null,
      prev_status: null,
      next_status: null,
      notes: 'Unmatched return serial — no order match',
      payload: {},
    }),
  ]);
  assert.equal(item.title, 'Unmatched return serial — no order match');
  assert.equal(item.actorStaffId, 7);
});
