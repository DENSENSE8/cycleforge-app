import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ShippedOrder } from '@/types/orders';
import { nextInWalk, pickOwnerTier, pickWalkProgress } from './pick-walk';

const ME = 2;
const OTHER = 3;
const order = (id: number, ...pickers: (number | null)[]) =>
  pickers.map((picker_id) => ({ id, picker_id }) as unknown as ShippedOrder);

describe('pickOwnerTier (Your picks = mine + open)', () => {
  it('mine, open (no one’s) and another picker’s', () => {
    assert.equal(pickOwnerTier(order(1, ME), ME), 'mine');
    assert.equal(pickOwnerTier(order(1, null), ME), 'unowned');
    assert.equal(pickOwnerTier(order(1, OTHER), ME), 'other');
  });

  it('an order with one of its lines assigned to me is mine, even when another line is someone else’s', () => {
    assert.equal(pickOwnerTier(order(1, OTHER, ME), ME), 'mine');
  });

  it('signed out: an assigned order is never mine', () => {
    assert.equal(pickOwnerTier(order(1, ME), null), 'other');
    assert.equal(pickOwnerTier(order(2, null), null), 'unowned');
  });
});

describe('nextInWalk', () => {
  const walk = [10, 11, 12, 13];

  it('moves to the next order still open, past picked and skipped ones', () => {
    assert.equal(nextInWalk(walk, 10, new Set([10, 12, 13]), new Set([12])), 13);
  });

  it('the last order → null (the walk is done)', () => {
    assert.equal(nextInWalk(walk, 13, new Set(walk)), null);
  });

  it('an order opened from outside the walk continues at the walk’s first open order', () => {
    assert.equal(nextInWalk(walk, 99, new Set([11, 12])), 11);
  });
});

describe('pickWalkProgress', () => {
  const picked = (id: number, picked_by: number | null, picked_at: string | null) =>
    ({ id, picked_by, picked_at }) as unknown as ShippedOrder;

  it('counts orders I picked on the PST day once each, plus the walk left', () => {
    const orders = [
      [picked(1, ME, '2026-09-28T18:00:00Z'), picked(1, ME, '2026-09-28T18:05:00Z')],
      [picked(2, OTHER, '2026-09-28T18:00:00Z')],
      // 22:00 PST on Sep 27 — yesterday, though the UTC date is the 28th.
      [picked(3, ME, '2026-09-28T05:00:00Z')],
      [picked(4, null, null)],
    ];
    assert.deepEqual(pickWalkProgress(orders, ME, '2026-09-28', 5), { picked: 1, total: 6 });
  });

  it('signed out: nothing picked, the total is the walk', () => {
    assert.deepEqual(pickWalkProgress([[picked(1, ME, '2026-09-28T18:00:00Z')]], null, '2026-09-28', 2), { picked: 0, total: 2 });
  });
});
