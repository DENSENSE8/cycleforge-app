import test from 'node:test';
import assert from 'node:assert/strict';
import { REPAIR_STATUS } from '@/design-system/tokens/repair-status';
import { REPAIR_STATUS_CHIP_KEYS, REPAIR_STATUS_CHIP_OPTIONS, repairStatusChipKey } from './repair-status-chips';

test('one option per stage, in stage order, in the shop’s words, then Other', () => {
  assert.deepEqual(
    REPAIR_STATUS_CHIP_OPTIONS.map(({ value, label }) => [value, label]),
    [
      ['arriving', 'Arriving'],
      ['needs-work', 'Still needs work'],
      ['completed', 'Completed'],
      ['closed', 'Closed'],
      ['other', 'Other'],
    ],
  );
  assert.equal(repairStatusChipKey('Incoming Shipment'), 'arriving');
  assert.equal(repairStatusChipKey('Pending Repair'), 'needs-work');
  assert.equal(repairStatusChipKey('Repaired, Contact Customer'), 'completed');
  assert.equal(repairStatusChipKey('Done'), 'closed');
});

test('the parts money is still before the repair; waiting on the customer is after it', () => {
  assert.equal(repairStatusChipKey('Awaiting Additional Parts Payment'), 'needs-work');
  assert.equal(repairStatusChipKey('Awaiting Payment'), 'completed');
  assert.equal(repairStatusChipKey('Picked Up'), 'closed');
  assert.equal(repairStatusChipKey('  Shipped '), 'closed');
});

test('every controlled status belongs to a stage; only legacy free text falls to Other', () => {
  for (const status of Object.keys(REPAIR_STATUS)) assert.notEqual(repairStatusChipKey(status), 'other', status);
  for (const key of REPAIR_STATUS_CHIP_KEYS) assert.match(key, /^[a-z-]+$/);
  assert.equal(repairStatusChipKey('On hold (legacy)'), 'other');
  assert.equal(repairStatusChipKey(null), 'other');
});
