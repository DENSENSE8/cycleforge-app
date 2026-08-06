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

test('one repair inspects; two-plus batches', () => {
  const one = resolveRepairRailOccupancy([10]);
  assert.equal(one.kind, 'inspect');
  if (one.kind === 'inspect') {
    assert.equal(one.occupantId, REPAIR_RAIL_OCCUPANT_ID.inspect);
    assert.equal(one.repairId, 10);
    assert.deepEqual([...one.repairIds], [10]);
  }
  assert.equal(isRepairRailInspectActive(one), true);
  assert.equal(isRepairRailBatchActive(one), false);

  const many = resolveRepairRailOccupancy([10, 11]);
  assert.equal(many.kind, 'attention');
  if (many.kind === 'attention') {
    assert.equal(many.occupantId, REPAIR_RAIL_OCCUPANT_ID.attention);
    assert.deepEqual([...many.repairIds], [10, 11]);
  }
  assert.equal(isRepairRailBatchActive(many), true);
  assert.equal(isRepairRailInspectActive(many), false);
});

test('occupant ids are mode-stable — never fold a record id in', () => {
  assert.equal(REPAIR_RAIL_OCCUPANT_ID.inspect, 'detail:repair');
  assert.equal(REPAIR_RAIL_OCCUPANT_ID.attention, 'detail:repair-batch');
});
