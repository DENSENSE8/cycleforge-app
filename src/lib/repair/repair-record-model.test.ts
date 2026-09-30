import test from 'node:test';
import assert from 'node:assert/strict';
import type { RepairStatusHistoryEntry, RSRecord } from '@/lib/neon/repair-service-queries';
import { repairRecordModel, repairRecordSteps, repairRecordVerbs } from './repair-record-model';

const TODAY = '2026-09-30';

function repair(patch: Partial<RSRecord> = {}): RSRecord {
  return {
    id: 4894,
    created_at: '2026-09-28 10:30:00',
    updated_at: '2026-09-28 10:30:00',
    ticket_number: '10089',
    contact_info: '',
    product_title: 'Bose 251 speaker',
    price: '168.00',
    issue: 'Left channel crackles',
    serial_number: 'SN-251-7788',
    status: 'Pending Repair',
    intake_channel: 'pickup',
    customer_name: 'Ana Ruiz',
    receiving_line_id: null,
    receiving_id: null,
    received_at: '2026-09-28 10:30:00',
    due_at: '2026-10-01 10:30:00',
    status_history: [],
    ...patch,
  };
}

const entry = (status: string, timestamp: string, previous: string | null = null, user = 'Mia'): RepairStatusHistoryEntry => ({
  status,
  timestamp,
  previous_status: previous,
  user_name: user,
});

const states = (r: RSRecord) => Object.fromEntries(repairRecordSteps(r).map((step) => [step.key, step.state]));

test('a pending drop-off: checked in and received are done, In repair is now, the label never printed is skipped', () => {
  const steps = repairRecordSteps(repair({ status_history: [entry('Pending Repair', '2026-09-28 10:31:00')] }));
  assert.deepEqual(
    steps.map((step) => [step.key, step.state]),
    [
      ['checkedIn', 'done'],
      ['received', 'done'],
      ['labeled', 'skipped'],
      ['inRepair', 'current'],
      ['repaired', 'pending'],
      ['ready', 'pending'],
      ['closed', 'pending'],
    ],
  );
  const bench = steps.find((step) => step.key === 'inRepair')!;
  assert.equal(bench.who, 'Mia');
  assert.equal(bench.sub, null);
});

test('branch states read as In repair sub-states, never as their own steps', () => {
  for (const status of ['Awaiting Parts', 'Awaiting Additional Parts Payment']) {
    const steps = repairRecordSteps(repair({ status }));
    const bench = steps.find((step) => step.key === 'inRepair')!;
    assert.equal(bench.state, 'current', status);
    assert.ok(bench.sub, `${status} carries a sub-state`);
    assert.equal(steps.some((step) => step.key === 'awaitingPayment'), false, `${status} paints no payment step`);
  }
});

test('Awaiting payment paints only when the ticket used it', () => {
  assert.equal(states(repair({ status: 'Awaiting Payment' })).awaitingPayment, 'current');
  const paidThenReady = repair({
    status: 'Awaiting Pickup',
    status_history: [entry('Awaiting Payment', '2026-09-29 09:00:00', 'Repaired, Contact Customer'), entry('Awaiting Pickup', '2026-09-29 12:00:00', 'Awaiting Payment')],
  });
  assert.equal(states(paidThenReady).awaitingPayment, 'done');
  assert.equal(states(paidThenReady).ready, 'current');
  assert.equal(states(repair({ status: 'Repaired, Contact Customer' })).awaitingPayment, undefined);
});

test('an incoming shipment waits on Received — its received stamp does not count yet', () => {
  const s = states(repair({ status: 'Incoming Shipment', intake_channel: 'shipment' }));
  assert.equal(s.checkedIn, 'done');
  assert.equal(s.received, 'current');
  assert.equal(s.inRepair, 'pending');
});

test('a reopened ticket: steps ahead of In repair read still to come, not done from the earlier pass', () => {
  const s = states(
    repair({
      status: 'Pending Repair',
      label_printed_at: '2026-09-29 11:00:00',
      status_history: [entry('Done', '2026-09-30 01:35:21', 'Pending Repair'), entry('Pending Repair', '2026-09-30 01:35:24', 'Done')],
    }),
  );
  assert.equal(s.inRepair, 'current');
  assert.equal(s.closed, 'pending');
  assert.equal(s.labeled, 'done');
});

test('a closed ticket paints its last step done under the closing word', () => {
  const pickedUp = repairRecordSteps(
    repair({ status: 'Picked Up', status_history: [entry('Picked Up', '2026-09-30 15:00:00', 'Awaiting Pickup', 'Jo')] }),
  ).at(-1)!;
  assert.deepEqual([pickedUp.label, pickedUp.state, pickedUp.who], ['Picked up', 'done', 'Jo']);
  const shipped = repairRecordSteps(repair({ status: 'Shipped', intake_channel: 'shipment' }));
  assert.equal(shipped.at(-1)!.label, 'Shipped back');
  assert.equal(shipped.at(-1)!.state, 'done');
  assert.equal(shipped.find((step) => step.key === 'ready')!.label, 'Ready to ship back');
  assert.equal(repairRecordSteps(repair({ status: 'Cancelled' })).at(-1)!.label, 'Cancelled');
});

test('verbs: Mark done hides once closed, Mark pending hides while pending', () => {
  assert.equal(repairRecordVerbs(repair({ status: 'Pending Repair' }))['mark-pending'].hidden, true);
  assert.equal(repairRecordVerbs(repair({ status: 'Pending Repair' }))['mark-done'].hidden, false);
  for (const status of ['Done', 'Picked Up', 'Shipped', 'Cancelled']) {
    assert.equal(repairRecordVerbs(repair({ status }))['mark-done'].hidden, true, status);
    assert.equal(repairRecordVerbs(repair({ status }))['mark-pending'].hidden, false, status);
  }
});

test('verbs: Start pickup only when the device can leave', () => {
  assert.equal(repairRecordVerbs(repair({ status: 'Pending Repair' })).pickup.hidden, true);
  assert.equal(repairRecordVerbs(repair({ status: 'Awaiting Pickup' })).pickup.hidden, false);
  assert.equal(repairRecordVerbs(repair({ status: 'Repaired, Contact Customer' })).pickup.hidden, false);
  assert.equal(repairRecordVerbs(repair({ status: 'Done' })).pickup.hidden, true);
});

test('verbs: Print receipt needs the counter visit; Square needs a SKU or a chargeable price', () => {
  const noVisit = repairRecordVerbs(repair({ counter_transaction_id: null })).receipt;
  assert.ok(!noVisit.hidden && noVisit.disabledReason);
  const visit = repairRecordVerbs(repair({ counter_transaction_id: 26 })).receipt;
  assert.ok(!visit.hidden && visit.disabledReason === null);
  const square = repairRecordVerbs(repair({ price: '', source_sku: null })).square;
  assert.ok(!square.hidden && square.disabledReason);
  const priced = repairRecordVerbs(repair({ price: '$1,250.00', source_sku: null })).square;
  assert.ok(!priced.hidden && priced.disabledReason === null);
});

test('the external rail exists only for a shipped-in ticket with a tracking number', () => {
  assert.equal(repairRecordModel(repair({ intake_channel: 'shipment', source_tracking_number: ' 1Z999 ' }), TODAY).tracking, '1Z999');
  assert.equal(repairRecordModel(repair({ intake_channel: 'shipment', source_tracking_number: null }), TODAY).tracking, null);
  assert.equal(repairRecordModel(repair({ intake_channel: 'pickup', source_tracking_number: '1Z999' }), TODAY).tracking, null);
});

test('title: the ticket #, never the internal RS- code', () => {
  assert.equal(repairRecordModel(repair(), TODAY).title.face, '#10089');
  assert.equal(repairRecordModel(repair({ ticket_number: 'RS-4894' }), TODAY).title.face, 'No ticket #');
  assert.equal(repairRecordModel(repair({ ticket_number: '' }), TODAY).title.face, 'No ticket #');
});

test('subtitle: customer · channel · due date, or the closed date once closed', () => {
  assert.equal(repairRecordModel(repair(), TODAY).subtitle, 'Ana Ruiz · Dropped off · due Oct 1');
  const closed = repairRecordModel(
    repair({ status: 'Done', status_history: [entry('Done', '2026-09-30 11:00:00', 'Pending Repair')] }),
    TODAY,
  );
  assert.equal(closed.subtitle, 'Ana Ruiz · Dropped off · Closed Sep 30');
});

test('the drop-off carton reads R-{id} only once the ticket is a receiving line', () => {
  assert.equal(repairRecordModel(repair(), TODAY).carton, null);
  assert.deepEqual(repairRecordModel(repair({ receiving_line_id: 9, receiving_id: 812 }), TODAY).carton, { receivingId: 812, face: 'R-812' });
});
