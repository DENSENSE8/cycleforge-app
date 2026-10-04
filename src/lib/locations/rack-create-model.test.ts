import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RACK_CREATE_STEPS,
  RACK_CREATE_STEP_LABELS,
  blockedReason,
  initialRackCreateState,
  nextRackCreateStep,
  previousRackCreateStep,
  toCreateRackBody,
  withShelfCount,
  withShelfTier,
} from './rack-create-model';
import { RACK_MAX_SHELVES } from './rack-types';

const room = { id: 7, code: 'ROOM-C', name: 'Room C', kind: 'ROOM' as const };

test('steps run Place → Shelves → Review → Print', () => {
  assert.deepEqual(RACK_CREATE_STEPS.map((s) => RACK_CREATE_STEP_LABELS[s]), ['Place', 'Shelves', 'Review', 'Print']);
  assert.equal(nextRackCreateStep('place'), 'shelves');
  assert.equal(nextRackCreateStep('print'), null);
  assert.equal(previousRackCreateStep('place'), null);
  assert.equal(previousRackCreateStep('review'), 'shelves');
});

test('blockedReason names what is missing', () => {
  const s = initialRackCreateState('evt-1');
  assert.equal(blockedReason(s, 'place'), 'Choose where the rack stands');
  assert.equal(blockedReason(s, 'review'), 'Choose where the rack stands');
  const placed = { ...s, placement: room };
  assert.equal(blockedReason(placed, 'place'), null);
  assert.equal(blockedReason({ ...placed, shelves: 0 }, 'shelves'), 'Add at least one shelf');
  assert.equal(blockedReason({ ...placed, placement: { ...room, id: null, code: '  ' } }, 'place'), 'Choose where the rack stands');
});

test('withShelfCount clamps and drops tiers above the count', () => {
  let s = withShelfTier({ ...initialRackCreateState('e'), shelves: 5 }, 5, 0);
  s = withShelfTier(s, 2, 1);
  s = withShelfCount(s, 3);
  assert.equal(s.shelves, 3);
  assert.deepEqual(s.tiers, { 2: 1 });
  assert.equal(withShelfCount(s, 0).shelves, 1);
  assert.equal(withShelfCount(s, 999).shelves, RACK_MAX_SHELVES);
  assert.deepEqual(withShelfTier(s, 2, null).tiers, {});
  assert.equal(withShelfTier(s, 9, 0), s);
});

test('toCreateRackBody prefers the placement id and sorts tiers', () => {
  let s = { ...initialRackCreateState('evt-9'), placement: room, shelves: 4 };
  s = withShelfTier(withShelfTier(s, 3, 2), 1, 0);
  assert.deepEqual(toCreateRackBody(s, true), {
    placementId: 7,
    shelves: 4,
    shelfTiers: [{ shelf: 1, tier: 0 }, { shelf: 3, tier: 2 }],
    dryRun: true,
    clientEventId: 'evt-9',
  });
  const scanned = { ...s, tiers: {}, placement: { ...room, id: null, code: ' C-FLOOR ' } };
  assert.deepEqual(toCreateRackBody(scanned, false), {
    placementCode: 'C-FLOOR',
    shelves: 4,
    dryRun: false,
    clientEventId: 'evt-9',
  });
  assert.throws(() => toCreateRackBody(initialRackCreateState('x'), true));
});
