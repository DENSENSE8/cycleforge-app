import test from 'node:test';
import assert from 'node:assert/strict';
import type { PutawayTargets } from '@/lib/receiving/putaway-targets-contract';
import { putawayKindForType, unboxNextAction } from './receiving';

const NONE: PutawayTargets = { PO: null, RETURN: null, TRADE_IN: null };
const LINKED: PutawayTargets = {
  PO: null,
  RETURN: { locationId: 7, code: 'RK12-3', face: 'Rack 12 Shelf 3' },
  TRADE_IN: { locationId: 9, code: 'RK4', face: 'Rack 4' },
};

test('unbox: Return goes on the Return rack', () => {
  const action = unboxNextAction('RETURN');
  assert.equal(action.kind, 'return');
  assert.equal(action.headline, 'Place on the Return rack');
});

test('unbox: Trade-in goes on any rack', () => {
  const action = unboxNextAction('TRADE_IN');
  assert.equal(action.kind, 'trade_in');
  assert.equal(action.headline, 'Place on a rack');
});

test('unbox: PO goes to its location — never a carrier rack', () => {
  const action = unboxNextAction('PO');
  assert.equal(action.kind, 'location');
  assert.equal(action.headline, 'Scan the location it goes to');
});

test('unbox: an unset or unknown type reads as PO', () => {
  for (const type of ['', null, undefined, 'PICKUP']) {
    assert.equal(putawayKindForType(type), 'PO');
    assert.equal(unboxNextAction(type).kind, 'location');
  }
});

test('unbox: the pill value is matched case- and space-insensitively', () => {
  assert.equal(unboxNextAction(' return ').kind, 'return');
  assert.equal(unboxNextAction('trade_in').kind, 'trade_in');
});

test('unbox: the linked rack for the pill type rides the destination', () => {
  assert.equal(unboxNextAction('RETURN', LINKED).destination?.code, 'RK12-3');
  assert.equal(unboxNextAction('TRADE_IN', LINKED).destination?.code, 'RK4');
});

test('unbox: switching the pill switches the linked target with it', () => {
  assert.equal(unboxNextAction('PO', LINKED).destination?.code, null);
  assert.equal(unboxNextAction('RETURN', LINKED).destination?.code, 'RK12-3');
});

test('unbox: nothing linked (or still loading) names the step without a code', () => {
  assert.equal(unboxNextAction('RETURN', NONE).destination?.code, null);
  assert.equal(unboxNextAction('RETURN', null).destination?.code, null);
  assert.equal(unboxNextAction('RETURN', NONE).headline, 'Place on the Return rack');
});
