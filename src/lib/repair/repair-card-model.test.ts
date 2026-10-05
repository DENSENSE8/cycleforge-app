import test from 'node:test';
import assert from 'node:assert/strict';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { compareRepairs, repairCardModel } from './repair-card-model';

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
    ...patch,
  };
}

const sla = (patch: Partial<RSRecord>, today = TODAY) => {
  const status = repairCardModel(repair(patch), today).record.status;
  assert.equal(status.kind, 'deadline');
  return status.kind === 'deadline' ? { face: status.face, tone: status.tone } : null;
};

test('line 1 names the ticket only — the internal RS- code never paints, an RS- fallback ticket reads as no ticket', () => {
  const card = repairCardModel(repair(), TODAY);
  assert.deepEqual(card.handles, { ticket: '10089', carton: null });
  assert.equal(card.record.person, 'Ana Ruiz');
  assert.doesNotMatch(card.record.aria.card, /RS-/);
  assert.match(card.record.aria.card, /^Repair #10089, /);

  assert.equal(repairCardModel(repair({ ticket_number: 'RS-4894' }), TODAY).handles.ticket, null);
  assert.equal(repairCardModel(repair({ ticket_number: '#9977' }), TODAY).handles.ticket, '9977');
});

test('the carton handle R-{id} shows only when the ticket is linked to a receiving line', () => {
  assert.equal(repairCardModel(repair({ receiving_line_id: 77, receiving_id: 812 }), TODAY).handles.carton, 'R-812');
  assert.equal(repairCardModel(repair({ receiving_line_id: null, receiving_id: 812 }), TODAY).handles.carton, null);
  assert.equal(repairCardModel(repair({ receiving_line_id: 77, receiving_id: null }), TODAY).handles.carton, null);
});

test('the channel slot names how the device reached us, unless the page is already that channel', () => {
  assert.equal(repairCardModel(repair({ intake_channel: 'pickup' }), TODAY).record.channel?.label, 'Dropped off');
  assert.equal(repairCardModel(repair({ intake_channel: 'shipment' }), TODAY).record.channel?.label, 'Shipped in');
  assert.equal(repairCardModel(repair({ intake_channel: null }), TODAY).record.channel, null);
  assert.equal(repairCardModel(repair({ intake_channel: 'pickup' }), TODAY, { channelPinned: true }).record.channel, null);
});

test('top-right is the SLA on the orders ladder: late · due today · tomorrow · later', () => {
  assert.deepEqual(sla({ due_at: '2026-09-28 10:30:00' }), { face: '2d late · Sep 28', tone: 'late' });
  assert.deepEqual(sla({ due_at: '2026-09-30 16:00:00' }), { face: 'Due today', tone: 'today' });
  assert.deepEqual(sla({ due_at: '2026-10-01 10:30:00' }), { face: 'Tomorrow', tone: 'soon' });
  assert.deepEqual(sla({ due_at: '2026-10-05 10:30:00' }), { face: 'Oct 5', tone: 'later' });
});

test('no SLA pressure: an incoming shipment has no due date, a closed ticket reads when it closed', () => {
  assert.deepEqual(sla({ status: 'Incoming Shipment', due_at: null }), { face: 'No due date', tone: 'none' });
  assert.deepEqual(sla({ due_at: null }), { face: 'No due date', tone: 'none' });
  const history = [
    { status: 'Pending Repair', timestamp: '2026-09-20 09:00:00' },
    { status: 'Done', timestamp: '2026-09-25 15:00:00', previous_status: 'Pending Repair' },
  ];
  // Long overdue, but closed: no late ink.
  assert.deepEqual(sla({ status: 'Done', due_at: '2026-09-01 10:00:00', status_history: history }), { face: 'Closed Sep 25', tone: 'none' });
  assert.deepEqual(sla({ status: 'Picked Up', updated_at: '2026-09-26 12:00:00', status_history: [] }), { face: 'Picked up Sep 26', tone: 'none' });
});

test('the rail keeps the status tone; the status is no longer a top-right face', () => {
  const payment = repairCardModel(repair({ status: 'Awaiting Payment' }), TODAY).record;
  assert.equal(payment.state.tone, 'danger');
  assert.equal(payment.status.kind, 'deadline');
  assert.equal(repairCardModel(repair({ status: 'On hold (legacy)' }), TODAY).record.state.tone, 'neutral');
});

test('the issue is the headline; the device, date and receiver sit under it; the serial is line-1 identification', () => {
  const card = repairCardModel(repair({ received_by_staff_id: 7, received_at: '2026-09-29T16:00:00.000Z' }), TODAY, {
    staffName: (id) => (id === 7 ? 'Michael' : null),
  });
  const line = card.record.lines[0]!;
  assert.equal(line.title, 'Left channel crackles');
  assert.deepEqual(Object.keys(line.facts), ['product', 'date', 'staff']);
  assert.deepEqual(line.facts.product, { kind: 'text', text: 'Bose 251 speaker' });
  assert.match(line.facts.date?.kind === 'date' ? line.facts.date.text : '', /^Received /);
  assert.deepEqual(line.facts.staff, { kind: 'text', text: 'By Michael' });
  assert.equal(card.serial, 'SN-251-7788');
  assert.equal(card.record.next, null);

  // No issue: the device holds the headline and is not said twice.
  const bare = repairCardModel(repair({ serial_number: '', issue: '' }), TODAY);
  assert.equal(bare.serial, null);
  assert.equal(bare.record.lines[0]!.title, 'Bose 251 speaker');
  assert.equal(bare.record.lines[0]!.facts.product, null);
  assert.equal(bare.record.lines[0]!.facts.staff, null);
});

test('sorts: newest by default order, status walks the bench, price highest first, blanks last', () => {
  const a = repair({ id: 1, created_at: '2026-09-01T00:00:00Z', status: 'Done', price: '50', customer_name: 'Zed', ticket_number: '300' });
  const b = repair({ id: 2, created_at: '2026-09-10T00:00:00Z', status: 'Incoming Shipment', price: '400', customer_name: 'Amy', ticket_number: 'RS-2' });
  const c = repair({ id: 3, created_at: '2026-09-05T00:00:00Z', status: 'Pending Repair', price: '', customer_name: null, ticket_number: '20' });
  const ids = (sort: Parameters<typeof compareRepairs>[2]) => [a, b, c].sort((x, y) => compareRepairs(x, y, sort)).map((r) => r.id);
  assert.deepEqual(ids('newest'), [2, 3, 1]);
  assert.deepEqual(ids('oldest'), [1, 3, 2]);
  assert.deepEqual(ids('status'), [2, 3, 1]);
  assert.deepEqual(ids('price_high'), [2, 1, 3]);
  assert.deepEqual(ids('customer'), [2, 1, 3]);
  assert.deepEqual(ids('ticket'), [3, 1, 2]);
});
