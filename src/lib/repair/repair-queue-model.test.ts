import test from 'node:test';
import assert from 'node:assert/strict';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { compareRepairs, repairHandles, repairSla, repairTicketHandle } from './repair-queue-model';

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
  const status = repairSla(repair(patch), today);
  return { face: status.face, tone: status.tone };
};

test('public handles omit internal RS fallback tickets and normalize a leading hash', () => {
  assert.deepEqual(repairHandles(repair()), { ticket: '10089', carton: null });
  assert.equal(repairTicketHandle(repair({ ticket_number: 'RS-4894' })), null);
  assert.equal(repairTicketHandle(repair({ ticket_number: '#9977' })), '9977');
});

test('the carton handle R-{id} exists only when a receiving line is linked', () => {
  assert.equal(repairHandles(repair({ receiving_line_id: 77, receiving_id: 812 })).carton, 'R-812');
  assert.equal(repairHandles(repair({ receiving_line_id: null, receiving_id: 812 })).carton, null);
  assert.equal(repairHandles(repair({ receiving_line_id: 77, receiving_id: null })).carton, null);
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
