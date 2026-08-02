/**
 * Unit tests for mergeStationUnitJourneys — Station Timeline carton feed.
 *
 *   npx tsx --test src/components/station/workbench/merge-station-unit-journeys.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseCrossSerialBatchHops,
  mergeStationUnitJourneys,
} from './merge-station-unit-journeys';
import type { JourneyEvent } from '@/lib/timeline/journey';
import type { TimelineItem } from '@/lib/timeline/types';

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

function invPutaway(id: number, serial: string, at: string, actor = 'Kai'): JourneyEvent {
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
      event_type: 'PUTAWAY',
      actor_name: actor,
      serial_number: serial,
      sku: null,
      prev_status: 'RECEIVED',
      next_status: 'STOCKED',
      bin_name: 'Tech Room — Parts',
      bin_barcode: 'PARTS',
    },
  };
}

test('mergeStationUnitJourneys: distinct clocks keep one row per serial', () => {
  const items = mergeStationUnitJourneys([
    {
      serial: '077049982611072A2',
      events: [invReceived(1, '077049982611072A2', '2026-07-15T14:46:00.000Z')],
    },
    {
      serial: '069451Z81982367AE',
      events: [invReceived(2, '069451Z81982367AE', '2026-07-15T14:47:00.000Z')],
    },
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.ref),
    [
      { kind: 'serial', value: '069451Z81982367AE' },
      { kind: 'serial', value: '077049982611072A2' },
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

test('mergeStationUnitJourneys: shared carton photos hoist once across serials', () => {
  const sharedPhotos = [
    {
      photoId: 10,
      at: '2026-07-15T14:40:00.000Z',
      source: 'arrival' as const,
      thumbUrl: '/t/10.jpg',
      fullUrl: '/f/10.jpg',
    },
    {
      photoId: 11,
      at: '2026-07-15T14:41:00.000Z',
      source: 'unbox_carton' as const,
      thumbUrl: '/t/11.jpg',
      fullUrl: '/f/11.jpg',
    },
  ];

  const items = mergeStationUnitJourneys([
    {
      serial: 'SN-AAA',
      events: [invReceived(1, 'SN-AAA', '2026-07-15T14:46:00.000Z')],
      photos: sharedPhotos,
    },
    {
      serial: 'SN-BBB',
      events: [invReceived(2, 'SN-BBB', '2026-07-15T14:46:00.000Z')],
      photos: sharedPhotos,
    },
  ]);

  const cartonRows = items.filter((i) => String(i.id).startsWith('carton:'));
  const batchRows = items.filter((i) => String(i.id).startsWith('batch:'));
  const perSerialPhotoRows = items.filter(
    (i) =>
      String(i.id).startsWith('serial:') &&
      (String(i.id).includes('unit-photos-arrival') ||
        String(i.id).includes('unit-photos-unbox_carton')),
  );

  assert.equal(cartonRows.length, 2);
  assert.ok(cartonRows.every((r) => r.ref === undefined));
  assert.ok(cartonRows.some((r) => r.id === 'carton:unit-photos-arrival'));
  assert.ok(cartonRows.some((r) => r.id === 'carton:unit-photos-unbox_carton'));
  // Same-second Received on both serials → one batch row, not two chips.
  assert.equal(batchRows.length, 1);
  assert.match(batchRows[0]!.subtitle ?? '', /2 units/);
  assert.equal(perSerialPhotoRows.length, 0);
});

test('mergeStationUnitJourneys: a single-serial carton never hoists, and carries no unit chip', () => {
  const items = mergeStationUnitJourneys([
    {
      serial: 'SN-ONLY',
      events: [invReceived(1, 'SN-ONLY', '2026-07-15T14:46:00.000Z')],
      photos: [
        {
          photoId: 10,
          at: '2026-07-15T14:40:00.000Z',
          source: 'arrival',
          thumbUrl: '/t/10.jpg',
          fullUrl: '/f/10.jpg',
        },
      ],
    },
  ]);

  // The subject of this test: no `carton:` hoist when only one serial shares
  // the stage (hoisting exists to stop a multi-unit carton showing the same
  // journey twice).
  assert.equal(items.filter((i) => String(i.id).startsWith('carton:')).length, 0);
  const arrival = items.find((i) => String(i.id).includes('unit-photos-arrival'));
  assert.ok(arrival);
  // Re-pointed 2026-08-02: an identity chip disambiguates, and with one unit in
  // the feed there is nothing to disambiguate — the same last-8 on every row is
  // noise. Multi-serial feeds still chip (next test).
  assert.equal(arrival?.ref, undefined);
  assert.ok(items.every((i) => i.ref?.kind !== 'serial'));
});

test('mergeStationUnitJourneys: a MULTI-serial carton keeps the unit chip', () => {
  const items = mergeStationUnitJourneys([
    { serial: 'SN-A', events: [invReceived(1, 'SN-A', '2026-07-15T14:46:00.000Z')] },
    { serial: 'SN-B', events: [invReceived(2, 'SN-B', '2026-07-15T15:10:00.000Z')] },
  ]);
  // Two units, two rows — here the chip is the only thing telling them apart.
  const serials = items
    .filter((i) => i.ref?.kind === 'serial')
    .map((i) => i.ref!.value)
    .sort();
  assert.deepEqual(serials, ['SN-A', 'SN-B']);
});

test('mergeStationUnitJourneys: keeps full stage media (display cap is the strip)', () => {
  const photos = [1, 2, 3, 4, 5, 6].map((n) => ({
    photoId: n,
    at: `2026-07-15T14:4${n}:00.000Z`,
    source: 'arrival' as const,
    thumbUrl: `/t/${n}.jpg`,
    fullUrl: `/f/${n}.jpg`,
  }));
  const items = mergeStationUnitJourneys([
    {
      serial: 'SN-ONLY',
      events: [invReceived(1, 'SN-ONLY', '2026-07-15T14:46:00.000Z')],
      photos,
    },
  ]);
  const arrival = items.find((i) => String(i.id).includes('unit-photos-arrival'));
  assert.equal(arrival?.media?.length, 6);
  assert.equal(arrival?.subtitle, '6 photos');
});

test('mergeStationUnitJourneys: batch put-away with colliding last-8 → one row', () => {
  // Two units that share a last-8 suffix must still fold into one batch row
  // with disambiguated serial displays (not fall back to the bin chip).
  const a = 'XX0590882AE';
  const b = 'YY0590882AE';
  // Same displayed clock (4:47pm) but different ms — must still fold.
  const atA = '2026-07-30T23:47:00.120Z';
  const atB = '2026-07-30T23:47:00.890Z';

  const items = mergeStationUnitJourneys([
    { serial: a, events: [invPutaway(1, a, atA)] },
    { serial: b, events: [invPutaway(2, b, atB)] },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'Put away');
  assert.notEqual(items[0]?.ref?.kind, 'bin');
  assert.equal(items[0]?.ref, undefined);
  assert.ok(items[0]?.refs?.every((r) => r.kind === 'serial'));
  assert.equal(items[0]?.refs?.length, 2);
  assert.deepEqual(
    new Set(items[0]?.refs?.map((r) => r.value)),
    new Set([a, b]),
  );
  // Colliding last-8 → longer disambiguating displays.
  const displays = items[0]?.refs?.map((r) => r.display ?? r.value.slice(-8)) ?? [];
  assert.equal(new Set(displays).size, 2);
  assert.ok(displays.every((d) => d.length > 8));
  assert.match(items[0]?.subtitle ?? '', /2 units/);
  assert.match(items[0]?.subtitle ?? '', /RECEIVED → STOCKED/);
  assert.match(items[0]?.subtitle ?? '', /Tech Room — Parts/);
  assert.ok(String(items[0]?.id).startsWith('batch:'));
});

test('collapseCrossSerialBatchHops: same-minute put-aways fold even when seconds differ', () => {
  const items: TimelineItem[] = [
    {
      id: 'serial:AAA:inv:1',
      at: '2026-07-30T23:47:12.000Z',
      title: 'Put away',
      tone: 'muted',
      actor: 'Kai',
      subtitle: 'RECEIVED → STOCKED · Tech Room — Parts',
      ref: { kind: 'serial', value: '070315F60590882AE' },
      sourceEventType: 'PUTAWAY',
    },
    {
      id: 'serial:BBB:inv:2',
      at: '2026-07-30T23:47:45.000Z',
      title: 'Put away',
      tone: 'muted',
      actor: 'Kai',
      subtitle: 'RECEIVED → STOCKED · Tech Room — Parts',
      ref: { kind: 'serial', value: '070214960600582AE' },
      sourceEventType: 'PUTAWAY',
    },
  ];
  const out = collapseCrossSerialBatchHops(items);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.ref, undefined);
  assert.ok(out[0]?.refs?.every((r) => r.kind === 'serial'));
  assert.equal(out[0]?.refs?.length, 2);
  assert.match(out[0]?.subtitle ?? '', /2 units/);
});

test('collapseCrossSerialBatchHops: leaves distinct hops alone', () => {
  const items: TimelineItem[] = [
    {
      id: 'serial:AAA:inv:1',
      at: '2026-07-30T23:47:00.000Z',
      title: 'Put away',
      tone: 'muted',
      actor: 'Kai',
      subtitle: 'RECEIVED → STOCKED',
      ref: { kind: 'serial', value: 'AAA' },
      sourceEventType: 'PUTAWAY',
    },
    {
      id: 'serial:BBB:inv:2',
      at: '2026-07-30T23:48:00.000Z',
      title: 'Put away',
      tone: 'muted',
      actor: 'Kai',
      subtitle: 'RECEIVED → STOCKED',
      ref: { kind: 'serial', value: 'BBB' },
      sourceEventType: 'PUTAWAY',
    },
  ];
  const out = collapseCrossSerialBatchHops(items);
  assert.equal(out.length, 2);
  assert.ok(out.every((i) => i.ref?.kind === 'serial'));
});
