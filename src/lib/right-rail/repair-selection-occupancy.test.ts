import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  REPAIR_RAIL_OCCUPANT_ID,
  isRepairRailBatchActive,
  isRepairRailInspectActive,
  resolveRepairRailOccupancy,
} from './repair-selection-occupancy';

test('empty selection mounts nothing', () => {
  assert.deepEqual(resolveRepairRailOccupancy([]), { kind: 'none' });
});

test('checkbox selection never claims the right rail', () => {
  const one = resolveRepairRailOccupancy([10]);
  assert.equal(one.kind, 'none');
  assert.equal(isRepairRailInspectActive(one), false);
  assert.equal(isRepairRailBatchActive(one), false);

  const many = resolveRepairRailOccupancy([10, 11]);
  assert.equal(many.kind, 'none');
  assert.equal(isRepairRailBatchActive(many), false);
  assert.equal(isRepairRailInspectActive(many), false);
});

test('occupant ids are mode-stable — never fold a record id in', () => {
  assert.equal(REPAIR_RAIL_OCCUPANT_ID.inspect, 'detail:repair');
  assert.equal(REPAIR_RAIL_OCCUPANT_ID.attention, 'detail:repair-batch');
});
