import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShipmentRecordAction } from '@/lib/shipments/shipment-record-types';
import { FULFILLED_DESK_EVENTS, fulfilledThreadItems, type FulfilledThreadRead } from './fulfilled-thread';

function scan(id: string, at: string, kind: string, label: string): ShipmentRecordAction {
  return { id, at, source: 'carrier', kind, label, actorStaffId: null, actorName: null, station: null, detail: null };
}

test('the thread interleaves notes, desk events and carrier changes oldest first', () => {
  const read: FulfilledThreadRead = {
    notes: [{ id: 'n1', orderRowId: 7, text: 'Called @[Ana](staff:3)', authorName: 'Mo', at: '2026-10-05T12:00:00.000Z' }],
    events: [
      {
        id: '9',
        orderRowId: 7,
        type: FULFILLED_DESK_EVENTS.assigned,
        actorName: 'Mo',
        at: '2026-10-05T13:00:00.000Z',
        payload: { staffName: 'Ana', dueAt: null },
      },
    ],
  };
  const items = fulfilledThreadItems(read, [scan('carrier:1', '2026-10-05T11:00:00.000Z', 'IN_TRANSIT', 'UPS: Departed')]);
  assert.deepEqual(
    items.map((item) => [item.kind, item.kind === 'note' ? item.text : item.label]),
    [
      ['carrier', 'Carrier: In transit'],
      ['note', 'Called @[Ana](staff:3)'],
      ['event', 'Assigned to Ana'],
    ],
  );
});

test('only a CHANGE of carrier status enters the thread, whatever order the scans arrive in', () => {
  const items = fulfilledThreadItems(null, [
    scan('carrier:3', '2026-10-05T12:00:00.000Z', 'IN_TRANSIT', 'UPS: Arrived'),
    scan('carrier:1', '2026-10-05T10:00:00.000Z', 'IN_TRANSIT', 'UPS: Picked up'),
    scan('carrier:4', '2026-10-06T09:00:00.000Z', 'OUT_FOR_DELIVERY', 'UPS: Out for delivery'),
    scan('carrier:2', '2026-10-05T11:00:00.000Z', 'IN_TRANSIT', 'UPS: Departed'),
  ]);
  assert.deepEqual(
    items.map((item) => item.id),
    ['carrier:1', 'carrier:4'],
  );
});

test('a non-carrier action never enters the thread', () => {
  const pack: ShipmentRecordAction = { ...scan('station:1', '2026-10-05T10:00:00.000Z', 'PACK_COMPLETED', 'Packed'), source: 'station' };
  assert.deepEqual(fulfilledThreadItems(null, [pack]), []);
});
