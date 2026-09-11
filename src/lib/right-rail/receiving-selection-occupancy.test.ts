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

test('Incoming: checkbox selection never claims the right rail', () => {
  const one = resolveReceivingRailOccupancy([10], 'incoming');
  assert.equal(one.kind, 'none');
  assert.equal(isReceivingRailBatchActive(one), false);

  const many = resolveReceivingRailOccupancy([10, 11], 'incoming');
  assert.equal(many.kind, 'none');
  assert.equal(isReceivingRailBatchActive(many), false);
});

test('Unbox/History lines: checkbox selection never claims the batch rail', () => {
  const one = resolveReceivingRailOccupancy([42], 'lines');
  assert.equal(one.kind, 'none');
  assert.equal(isReceivingRailBatchActive(one), false);

  const many = resolveReceivingRailOccupancy([42, 43, 44], 'lines');
  assert.equal(many.kind, 'none');
  assert.equal(isReceivingRailBatchActive(many), false);
});

test('occupant ids are mode-stable — never fold a record id in', () => {
  assert.equal(RECEIVING_RAIL_OCCUPANT_ID.inspect, 'detail:incoming');
  assert.equal(RECEIVING_RAIL_OCCUPANT_ID.historyInspect, 'detail:history');
  assert.equal(RECEIVING_RAIL_OCCUPANT_ID.attention, 'detail:receiving-line-batch');
});
