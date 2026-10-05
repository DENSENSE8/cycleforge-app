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

test('withShelfCount clamps into 1..RACK_MAX_SHELVES', () => {
  const s = withShelfCount({ ...initialRackCreateState('e'), shelves: 5 }, 3);
  assert.equal(s.shelves, 3);
  assert.equal(withShelfCount(s, 0).shelves, 1);
  assert.equal(withShelfCount(s, 999).shelves, RACK_MAX_SHELVES);
});

test('toCreateRackBody prefers the placement id; the body carries no shelf urgency', () => {
  const s = { ...initialRackCreateState('evt-9'), placement: room, shelves: 4 };
  assert.deepEqual(toCreateRackBody(s, true), {
    placementId: 7,
    shelves: 4,
    dryRun: true,
    clientEventId: 'evt-9',
  });
  const scanned = { ...s, placement: { ...room, id: null, code: ' C-FLOOR ' } };
  assert.deepEqual(toCreateRackBody(scanned, false), {
    placementCode: 'C-FLOOR',
    shelves: 4,
    dryRun: false,
    clientEventId: 'evt-9',
  });
  assert.throws(() => toCreateRackBody(initialRackCreateState('x'), true));
});
