import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  RECEIVING_RAIL_OCCUPANT_ID,
  isReceivingRailBatchActive,
  resolveReceivingRailOccupancy,
} from './receiving-selection-occupancy';

test('empty selection mounts nothing on either surface', () => {
  assert.deepEqual(resolveReceivingRailOccupancy([], 'incoming'), { kind: 'none' });
  assert.deepEqual(resolveReceivingRailOccupancy([], 'lines'), { kind: 'none' });
});

test('Incoming: one inspects, two-plus batches', () => {
  const one = resolveReceivingRailOccupancy([10], 'incoming');
  assert.equal(one.kind, 'inspect');
  if (one.kind === 'inspect') {
    assert.equal(one.occupantId, RECEIVING_RAIL_OCCUPANT_ID.inspect);
    assert.deepEqual([...one.lineIds], [10]);
  }
  assert.equal(isReceivingRailBatchActive(one), false);

  const many = resolveReceivingRailOccupancy([10, 11], 'incoming');
  assert.equal(many.kind, 'attention');
  if (many.kind === 'attention') {
    assert.equal(many.occupantId, RECEIVING_RAIL_OCCUPANT_ID.attention);
  }
  assert.equal(isReceivingRailBatchActive(many), true);
});

test('Unbox/History lines: any non-empty set batches (no compare)', () => {
  const one = resolveReceivingRailOccupancy([42], 'lines');
  assert.equal(one.kind, 'attention');
  assert.equal(isReceivingRailBatchActive(one), true);

  const many = resolveReceivingRailOccupancy([42, 43, 44], 'lines');
  assert.equal(many.kind, 'attention');
  if (many.kind === 'attention') {
    assert.deepEqual([...many.lineIds], [42, 43, 44]);
  }
});

test('occupant ids are mode-stable — never fold a record id in', () => {
  assert.equal(RECEIVING_RAIL_OCCUPANT_ID.inspect, 'detail:incoming');
  assert.equal(RECEIVING_RAIL_OCCUPANT_ID.attention, 'detail:receiving-line-batch');
});
