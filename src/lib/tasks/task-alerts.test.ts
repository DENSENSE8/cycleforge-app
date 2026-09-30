import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readInboxContacts } from '@/lib/notifications/inbox-contacts';
import { TASK_ALERT_CONTACTS_MAX, sendTaskAlert, taskAlertContacts, type TaskAlertContactSources, type TaskAlertDeps } from './task-alerts';

const TASK = { id: 16013, title: 'Listing refresh', ownerIds: [1, 3], contacts: [] };

type Link = TaskAlertContactSources['links'][number];
function link(over: Partial<Link> & Pick<Link, 'kind' | 'label'>): Link {
  return { entityId: null, order: null, ticket: null, repair: null, ...over };
}
const EMAIL = { customerEmail: 'customer@example.com', mailbox: 'technical@usav.com', orderNumber: '12345', referenceNumber: null };

test('contacts: emails first, then the ticket(s), orders, repairs, tracking — link order within a kind', () => {
  const contacts = taskAlertContacts({
    anchorTicketNumber: 10022,
    links: [
      link({ kind: 'tracking', label: '1Z999AA10123456784' }),
      link({ kind: 'order', label: '113-44', entityId: 8, order: { id: 8, orderNumber: '113-44', lineCount: 1, title: null, sku: null } }),
      link({ kind: 'repair', label: 'RS-74', entityId: 74 }),
      link({ kind: 'ticket', label: '48120', ticket: { providerTicketId: 48120, subject: null, status: null } }),
      link({ kind: 'order', label: '200-1' }),
    ],
    emailRefs: [EMAIL, { ...EMAIL, customerEmail: 'b@x.com', orderNumber: null, referenceNumber: 'R-9' }],
  });
  assert.deepEqual(contacts, [
    { kind: 'email', address: 'customer@example.com', mailbox: 'technical@usav.com', orderNumber: '12345', referenceNumber: null },
    { kind: 'email', address: 'b@x.com', mailbox: 'technical@usav.com', orderNumber: null, referenceNumber: 'R-9' },
    { kind: 'ticket', number: 10022 },
    { kind: 'ticket', number: 48120 },
    { kind: 'order', orderNumber: '113-44', orderId: 8 },
    { kind: 'order', orderNumber: '200-1', orderId: null },
    { kind: 'repair', label: 'RS-74', repairId: 74 },
    { kind: 'tracking', trackingNumber: '1Z999AA10123456784' },
  ]);
});

test('contacts: the anchor ticket linked again is named once; nothing linked is an empty list', () => {
  const contacts = taskAlertContacts({
    anchorTicketNumber: 48120,
    links: [link({ kind: 'ticket', label: '#48120' })],
    emailRefs: [EMAIL, { ...EMAIL, customerEmail: 'CUSTOMER@example.com' }],
  });
  assert.deepEqual(contacts.map((c) => c.kind), ['email', 'ticket']);
  assert.deepEqual(taskAlertContacts({ anchorTicketNumber: null, links: [], emailRefs: [] }), []);
});

test('contacts: capped, and a stored payload reads back exactly (malformed entries drop out)', () => {
  const many = Array.from({ length: 20 }, (_, i) => link({ kind: 'tracking', label: `TRACK${i}` }));
  const contacts = taskAlertContacts({ anchorTicketNumber: null, links: many, emailRefs: [EMAIL] });
  assert.equal(contacts.length, TASK_ALERT_CONTACTS_MAX);
  assert.equal(contacts[0].kind, 'email');

  const stored = JSON.parse(JSON.stringify({ contacts: [...contacts, { kind: 'ticket', number: 'x' }, { kind: 'fax' }] }));
  assert.deepEqual(readInboxContacts(stored), contacts);
  assert.deepEqual(readInboxContacts({ note: 'old row, no contacts' }), []);
});

/** Capturing fakes — no database. `orgStaff` is who exists in THIS org. */
function fakes(orgStaff: number[] = [1, 3, 5]) {
  const inserts: Array<Parameters<TaskAlertDeps['insertInboxItems']>[0]> = [];
  const deps: TaskAlertDeps = {
    async readTask(taskId) {
      return taskId === TASK.id ? TASK : null;
    },
    async staffInOrg(ids) {
      return ids.filter((id) => orgStaff.includes(id));
    },
    async insertInboxItems(args) {
      inserts.push(args);
      return args.staffIds.map((staffId, i) => ({ staffId, itemId: 900 + i }));
    },
  };
  return { deps, inserts };
}

test('no recipients named alerts every owner of the task', async () => {
  const { deps, inserts } = fakes();
  const result = await sendTaskAlert({ taskId: TASK.id, actorStaffId: 7, alertKey: 'k1', body: {} }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.staffIds, [1, 3]);
  assert.deepEqual(inserts[0]?.staffIds, [1, 3]);
});

test('named recipients replace the owners, once each', async () => {
  const { deps, inserts } = fakes();
  const result = await sendTaskAlert(
    { taskId: TASK.id, actorStaffId: 7, alertKey: 'k1', body: { staffIds: [5, 5] } },
    deps,
  );
  assert.deepEqual(result.ok && result.staffIds, [5]);
  assert.deepEqual(inserts[0]?.staffIds, [5]);
});

test('a staffer outside the org refuses the whole alert, and nothing is written', async () => {
  const { deps, inserts } = fakes([1, 3]);
  const result = await sendTaskAlert(
    { taskId: TASK.id, actorStaffId: 7, alertKey: 'k1', body: { staffIds: [1, 4242] } },
    deps,
  );
  assert.deepEqual(result, { ok: false, reason: 'invalid_staff' });
  assert.equal(inserts.length, 0);
});

test('a task with no owners and no named recipients has nobody to alert', async () => {
  const { deps, inserts } = fakes();
  deps.readTask = async () => ({ ...TASK, ownerIds: [] });
  const result = await sendTaskAlert({ taskId: TASK.id, actorStaffId: 7, alertKey: 'k1', body: {} }, deps);
  assert.deepEqual(result, { ok: false, reason: 'no_recipients' });
  assert.equal(inserts.length, 0);
});

test('the sender is never alerted: a named list naming them is refused, and nothing is written', async () => {
  const { deps, inserts } = fakes();
  const result = await sendTaskAlert(
    { taskId: TASK.id, actorStaffId: 1, alertKey: 'k1', body: { staffIds: [3, 1] } },
    deps,
  );
  assert.deepEqual(result, { ok: false, reason: 'cannot_alert_self' });
  assert.equal(inserts.length, 0);
});

test('defaulting to the owners drops the sender; a task only the sender owns has nobody to alert', async () => {
  const { deps, inserts } = fakes();
  const result = await sendTaskAlert({ taskId: TASK.id, actorStaffId: 1, alertKey: 'k1', body: {} }, deps);
  assert.deepEqual(result.ok && result.staffIds, [3]);
  assert.deepEqual(inserts[0]?.staffIds, [3]);

  deps.readTask = async () => ({ ...TASK, ownerIds: [1] });
  const alone = await sendTaskAlert({ taskId: TASK.id, actorStaffId: 1, alertKey: 'k2', body: {} }, deps);
  assert.deepEqual(alone, { ok: false, reason: 'no_recipients' });
  assert.equal(inserts.length, 1);
});

test('an unreadable due instant is refused; a readable one is stored as ISO, a blank note as null', async () => {
  const { deps, inserts } = fakes();
  const bad = await sendTaskAlert(
    { taskId: TASK.id, actorStaffId: 7, alertKey: 'k1', body: { dueAt: 'next tuesday-ish' } },
    deps,
  );
  assert.deepEqual(bad, { ok: false, reason: 'invalid_due' });

  const good = await sendTaskAlert(
    { taskId: TASK.id, actorStaffId: 7, alertKey: 'k2', body: { dueAt: '2026-10-01T17:00:00-07:00', note: '   ' } },
    deps,
  );
  assert.equal(good.ok && good.dueAt, '2026-10-02T00:00:00.000Z');
  assert.equal(good.ok && good.note, null);
  assert.equal(inserts.length, 1);
});

test('a task outside the org is not found', async () => {
  const { deps } = fakes();
  const result = await sendTaskAlert({ taskId: 1, actorStaffId: 7, alertKey: 'k1', body: {} }, deps);
  assert.deepEqual(result, { ok: false, reason: 'task_not_found' });
});
