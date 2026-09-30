import test from 'node:test';
import assert from 'node:assert/strict';
import { repairDueAt } from './repair-due-at';

test('due 3 business days after it was received, PT wall clock kept', () => {
  // Mon 2026-09-28 → Thu.
  assert.equal(repairDueAt('2026-09-28 10:15:00', '2026-09-20 09:00:00', 'Pending Repair'), '2026-10-01 10:15:00');
  // Wed → the weekend is skipped: Thu, Fri, Mon.
  assert.equal(repairDueAt('2026-09-30 16:00:00', null, 'Pending Repair'), '2026-10-05 16:00:00');
});

test('a Friday receive is due Wednesday; a weekend receive counts from Monday', () => {
  assert.equal(repairDueAt('2026-10-02 14:38:08', null, 'Pending Repair'), '2026-10-07 14:38:08');
  assert.equal(repairDueAt('2026-10-03 11:00:00', null, 'Pending Repair'), '2026-10-07 11:00:00');
  assert.equal(repairDueAt('2026-10-04 11:00:00', null, 'Pending Repair'), '2026-10-07 11:00:00');
});

test('an instant is read on the PT calendar: 02:00Z Saturday is still Friday evening in PT', () => {
  assert.equal(repairDueAt('2026-10-03T02:00:00.000Z', null, 'Pending Repair'), '2026-10-07 19:00:00');
  assert.equal(repairDueAt(new Date('2026-10-03T02:00:00.000Z'), null, 'Pending Repair'), '2026-10-07 19:00:00');
});

test('never received: counts from when the ticket was opened', () => {
  assert.equal(repairDueAt(null, '2026-09-29 21:00:00', 'Pending Repair'), '2026-10-02 21:00:00');
  assert.equal(repairDueAt('', '2026-09-29 21:00:00', null), '2026-10-02 21:00:00');
});

test('an incoming shipment is not in hand: no due date, whatever its stamps say', () => {
  assert.equal(repairDueAt('2026-09-17 09:13:08', '2026-09-17 09:13:08', 'Incoming Shipment'), null);
  assert.equal(repairDueAt(null, '2026-09-17 09:13:08', ' Incoming Shipment '), null);
});

test('no stamp at all: no due date', () => {
  assert.equal(repairDueAt(null, null, 'Pending Repair'), null);
});
