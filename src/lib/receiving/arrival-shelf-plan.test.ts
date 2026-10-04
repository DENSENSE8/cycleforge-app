/** Arrival urgency shelves — suggestion (capacity overflow, no shelves), confirm refusals, unbox order. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkShelfConfirm,
  NO_URGENCY_SHELVES_MESSAGE,
  orderUnboxNext,
  suggestArrivalShelf,
  type ArrivalShelf,
} from './arrival-shelf-plan';

function shelf(partial: Partial<ArrivalShelf> & Pick<ArrivalShelf, 'id' | 'tier'>): ArrivalShelf {
  return {
    barcode: `R-${partial.id}`,
    face: `R-${partial.id}`,
    capacity: null,
    occupied: 0,
    sortOrder: partial.id,
    ...partial,
  };
}

const RACK = [
  shelf({ id: 1, tier: 0, capacity: 2, occupied: 0 }),
  shelf({ id: 2, tier: 1, capacity: 4, occupied: 1 }),
  shelf({ id: 3, tier: 2 }),
  shelf({ id: 4, tier: 3 }),
];

test('no shelves → the honest "no urgency shelves configured" state', () => {
  const s = suggestArrivalShelf([], 2);
  assert.equal(s.kind, 'no_shelves');
  assert.equal(s.message, NO_URGENCY_SHELVES_MESSAGE);
});

test('a carton goes on the shelf of its own tier', () => {
  const s = suggestArrivalShelf(RACK, 1);
  assert.equal(s.kind, 'shelf');
  if (s.kind !== 'shelf') return;
  assert.equal(s.shelf.id, 2);
  assert.equal(s.overflow, false);
});

test('a full shelf overflows to the next LESS-urgent tier and says so', () => {
  const rack = RACK.map((r) => (r.id === 1 ? { ...r, occupied: 2 } : r));
  const s = suggestArrivalShelf(rack, 0);
  assert.equal(s.kind, 'shelf');
  if (s.kind !== 'shelf') return;
  assert.equal(s.shelf.id, 2);
  assert.equal(s.overflow, true);
  assert.match(s.message, /Priority shelf full — overflow to High/);
});

test('a second shelf of the same tier is used before overflowing', () => {
  const rack = [shelf({ id: 1, tier: 0, capacity: 1, occupied: 1 }), shelf({ id: 9, tier: 0, sortOrder: 50 }), shelf({ id: 2, tier: 1 })];
  const s = suggestArrivalShelf(rack, 0);
  assert.equal(s.kind === 'shelf' && s.shelf.id, 9);
  assert.equal(s.kind === 'shelf' && s.overflow, false);
});

test('never a more-urgent shelf: a Low carton with only a Priority shelf has nowhere to go', () => {
  const s = suggestArrivalShelf([shelf({ id: 1, tier: 0 })], 3);
  assert.equal(s.kind, 'full');
  assert.match(s.message, /No Low-or-lower shelf/);
});

test('every acceptable shelf full → full', () => {
  const s = suggestArrivalShelf([shelf({ id: 4, tier: 3, capacity: 1, occupied: 1 })], 3);
  assert.equal(s.kind, 'full');
});

test('confirm refuses a label that is not an urgency shelf', () => {
  const v = checkShelfConfirm(null, suggestArrivalShelf(RACK, 1));
  assert.equal(v.ok, false);
  assert.equal(!v.ok && v.reason, 'not_arrival_shelf');
});

test('confirm refuses a shelf of the wrong tier and names the right one', () => {
  const suggestion = suggestArrivalShelf(RACK, 0);
  const v = checkShelfConfirm(RACK[3], suggestion);
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.reason, 'wrong_tier');
  assert.match(v.message, /Wrong shelf — R-4 is Low; place on R-1 \(Priority\)/);
});

test('confirm accepts any shelf of the suggested tier with room, refuses a full one', () => {
  const twin = shelf({ id: 7, tier: 0, capacity: 1, occupied: 0 });
  const full = shelf({ id: 8, tier: 0, capacity: 1, occupied: 1 });
  const suggestion = suggestArrivalShelf([...RACK, twin, full], 0);
  assert.equal(checkShelfConfirm(twin, suggestion).ok, true);
  const v = checkShelfConfirm(full, suggestion);
  assert.equal(!v.ok && v.reason, 'shelf_full');
});

test('confirm when no shelves exist refuses with the configured-state message', () => {
  const v = checkShelfConfirm(shelf({ id: 1, tier: 0 }), suggestArrivalShelf([], 0));
  assert.equal(!v.ok && v.reason, 'no_shelves');
});

test('unbox order: tier asc, then shelf (unshelved last), then oldest first', () => {
  const rows = orderUnboxNext([
    { receivingId: 1, tier: 2, shelfId: 3, shelfSortOrder: 3, doorReceivedAt: '2026-10-01T10:00:00Z' },
    { receivingId: 2, tier: 0, shelfId: null, shelfSortOrder: null, doorReceivedAt: '2026-09-01T10:00:00Z' },
    { receivingId: 3, tier: 0, shelfId: 1, shelfSortOrder: 1, doorReceivedAt: '2026-10-02T10:00:00Z' },
    { receivingId: 4, tier: 0, shelfId: 1, shelfSortOrder: 1, doorReceivedAt: '2026-10-01T09:00:00Z' },
    { receivingId: 5, tier: 0, shelfId: 9, shelfSortOrder: 2, doorReceivedAt: '2026-09-30T09:00:00Z' },
    { receivingId: 6, tier: 2, shelfId: 3, shelfSortOrder: 3, doorReceivedAt: null },
  ]);
  assert.deepEqual(rows.map((r) => r.receivingId), [4, 3, 5, 2, 1, 6]);
});
