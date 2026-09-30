import test from 'node:test';
import assert from 'node:assert/strict';
import { REPAIR_STATUS } from '@/design-system/tokens/repair-status';
import { REPAIR_STATUS_CHIP_KEYS, repairStatusChipKey, repairStatusChips } from './repair-status-chips';

test('one chip per stage present, in stage order, in the shop’s words, counted in cards', () => {
  const chips = repairStatusChips([
    { status: 'Done' },
    { status: 'Pending Repair' },
    { status: 'Awaiting Parts' },
    { status: 'Repaired, Contact Customer' },
    { status: 'Incoming Shipment' },
    { status: 'Awaiting Pickup' },
  ]);
  assert.deepEqual(
    chips.map(({ id, label, tone, count }) => [id, label, tone, count]),
    [
      ['arriving', 'Arriving', 'info', 1],
      ['needs-work', 'Still needs work', 'warning', 2],
      ['completed', 'Completed', 'success', 2],
      ['closed', 'Closed', 'neutral', 1],
    ],
  );
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
  assert.deepEqual(repairStatusChips([{ status: 'On hold (legacy)' }, { status: null }]).map((chip) => [chip.id, chip.count]), [['other', 2]]);
});
