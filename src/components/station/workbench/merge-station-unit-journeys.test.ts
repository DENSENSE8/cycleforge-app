/**
 * Unit tests for mergeStationUnitJourneys — Station Timeline carton feed.
 *
 *   npx tsx --test src/components/station/workbench/merge-station-unit-journeys.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStationUnitJourneys } from './merge-station-unit-journeys';
import type { JourneyEvent } from '@/lib/timeline/journey';

function invReceived(id: number, serial: string, at: string, actor = 'Kai'): JourneyEvent {
  return {
    source: 'inventory',
    id: `inv:${id}`,
    at,
    group: {
      orderId: null,
      orderNumber: null,
      serialNumber: serial,
      trackingNumber: null,
      station: 'receiving',
    },
    raw: {
      id,
      occurred_at: at,
      event_type: 'RECEIVED',
      actor_name: actor,
      serial_number: serial,
      sku: null,
      prev_status: null,
      next_status: 'RECEIVED',
    },
  };
}

test('mergeStationUnitJourneys: one row per serial with SerialChip ref (last-4 path)', () => {
  const items = mergeStationUnitJourneys([
    {
      serial: '077049982611072A2',
      events: [invReceived(1, '077049982611072A2', '2026-07-15T14:46:00.000Z')],
    },
    {
      serial: '069451Z81982367AE',
      events: [invReceived(2, '069451Z81982367AE', '2026-07-15T14:46:00.000Z')],
    },
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.ref),
    [
      { kind: 'serial', value: '077049982611072A2' },
      { kind: 'serial', value: '069451Z81982367AE' },
    ],
  );
  assert.ok(items.every((i) => i.title === 'Received'));
  assert.ok(items.every((i) => i.id.startsWith('serial:')));
});

test('mergeStationUnitJourneys: newest-first across serials', () => {
  const items = mergeStationUnitJourneys([
    {
      serial: 'AAA1111',
      events: [invReceived(1, 'AAA1111', '2026-07-15T12:00:00.000Z')],
    },
    {
      serial: 'BBB2222',
      events: [invReceived(2, 'BBB2222', '2026-07-15T18:00:00.000Z')],
    },
  ]);
  assert.equal(items[0]?.ref?.value, 'BBB2222');
  assert.equal(items[1]?.ref?.value, 'AAA1111');
});

test('mergeStationUnitJourneys: empty buckets → empty list', () => {
  assert.deepEqual(mergeStationUnitJourneys([]), []);
  assert.deepEqual(mergeStationUnitJourneys([{ serial: '  ', events: [] }]), []);
});
