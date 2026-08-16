/**
 * Arrival new-location slot math.
 *
 * Run: `npx tsx --test src/lib/receiving/arrival-new-location.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SLOT,
  occupiedPositions,
  printableRoomNames,
  suggestNextPosition,
  zoneLetterForRoom,
} from './arrival-new-location';
import type { Location } from '@/lib/neon/location-queries';

function loc(partial: Partial<Location> & { id: number }): Location {
  return {
    name: `L${partial.id}`,
    room: null,
    description: null,
    barcode: null,
    is_active: true,
    sort_order: 0,
    row_label: null,
    col_label: null,
    bin_type: null,
    capacity: null,
    parent_id: null,
    zone_letter: null,
    ...partial,
  };
}

const AT = { zone: 'A', aisle: 1, bay: 1, level: 1 } as const;

test('occupied positions come from the barcodes, not a count', () => {
  const locations = [
    loc({ id: 1, barcode: 'A0101101' }), // pos 1
    loc({ id: 2, barcode: 'A0101103' }), // pos 3
    loc({ id: 3, barcode: 'A0101104' }), // pos 4
  ];
  assert.deepEqual(occupiedPositions(locations, AT), [1, 3, 4]);
});

test('a retired middle slot is reused before minting past the end', () => {
  // The physical shelf still has that space — appending would strand it.
  const locations = [loc({ id: 1, barcode: 'A0101101' }), loc({ id: 2, barcode: 'A0101103' })];
  assert.equal(suggestNextPosition(locations, AT), 2);
});

test('an empty level starts at 1', () => {
  assert.equal(suggestNextPosition([], AT), 1);
  assert.equal(suggestNextPosition([loc({ id: 1, barcode: 'B0202201' })], AT), 1);
});

test('a different zone / aisle / bay / level never blocks a slot', () => {
  const locations = [
    loc({ id: 1, barcode: 'B0101101' }), // other zone
    loc({ id: 2, barcode: 'A0201101' }), // other aisle
    loc({ id: 3, barcode: 'A0102101' }), // other bay
    loc({ id: 4, barcode: 'A0101201' }), // other level
  ];
  assert.deepEqual(occupiedPositions(locations, AT), []);
  assert.equal(suggestNextPosition(locations, AT), 1);
});

test('the position=0 rack-label sentinel is not a placeable slot', () => {
  const locations = [loc({ id: 1, barcode: 'A0101100' })];
  assert.deepEqual(occupiedPositions(locations, AT), []);
  assert.equal(suggestNextPosition(locations, AT), 1);
});

test('a full level returns null rather than an out-of-range address', () => {
  const locations = Array.from({ length: MAX_SLOT }, (_, i) =>
    loc({ id: i + 1, barcode: `A01011${String(i + 1).padStart(2, '0')}` }),
  );
  assert.equal(suggestNextPosition(locations, AT), null);
});

test('non-location barcodes are ignored, never mis-parsed into a slot', () => {
  const locations = [
    loc({ id: 1, barcode: 'PACK-STAGING' }),
    loc({ id: 2, barcode: 'TBA123456789012' }),
    loc({ id: 3, barcode: null }),
  ];
  assert.deepEqual(occupiedPositions(locations, AT), []);
});

test('zone letter is read off the room parent, case-insensitively', () => {
  const rooms = [
    loc({ id: 1, name: 'Receiving', room: 'Receiving', zone_letter: 'A' }),
    loc({ id: 2, name: 'Cage 4', room: 'Cage 4', zone_letter: 'C' }),
  ];
  assert.equal(zoneLetterForRoom(rooms, 'receiving'), 'A');
  assert.equal(zoneLetterForRoom(rooms, '  Cage 4 '), 'C');
});

test('a room that has never been printed has no zone letter — the leaf must ask', () => {
  const rooms = [loc({ id: 1, name: 'Dock', room: 'Dock', zone_letter: null })];
  assert.equal(zoneLetterForRoom(rooms, 'Dock'), null);
  assert.equal(zoneLetterForRoom(rooms, 'Nowhere'), null);
  assert.equal(zoneLetterForRoom(rooms, ''), null);
});

test('room names de-duplicate and keep catalog order', () => {
  const rooms = [
    loc({ id: 1, room: 'Receiving' }),
    loc({ id: 2, name: 'Receiving', room: null }),
    loc({ id: 3, room: 'Cage 4' }),
  ];
  assert.deepEqual(printableRoomNames(rooms), ['Receiving', 'Cage 4']);
});
