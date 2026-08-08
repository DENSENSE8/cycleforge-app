import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTaskCore,
  TASK_NOTE_MAX,
  type CreateTaskDeps,
  type InsertTaskArgs,
  type NotifyAssigneeArgs,
  type PromoteOutcome,
} from './create-task-core';

const ACTOR = 7;

/** Capturing fakes — no database, no helpdesk, no urgency SoT, no Ably. */
function fakes(
  promote: PromoteOutcome | Error = { ok: true, changed: true },
  notify: 'ok' | Error = 'ok',
) {
  const inserts: InsertTaskArgs[] = [];
  const promotions: Array<{ entityType: string; entityId: number }> = [];
  const notifications: NotifyAssigneeArgs[] = [];

  const deps: CreateTaskDeps = {
    async notifyAssignee(args) {
      notifications.push(args);
      if (notify instanceof Error) throw notify;
    },
    async insertTask(args) {
      inserts.push(args);
      return {
        id: 555,
        entityType: args.entityType,
        entityId: args.entityId,
        assigneeStaffId: args.assigneeStaffId,
        priority: args.priority,
        note: args.note,
      };
    },
    async promoteUrgency(entityType, entityId) {
      promotions.push({ entityType, entityId });
      if (promote instanceof Error) throw promote;
      return promote;
    },
  };
  return { deps, inserts, promotions, notifications };
}

const base = { entityType: 'order', entityId: 42, assigneeStaffId: 9, actorStaffId: ACTOR };

test('a normal throw creates the task and never touches urgency', async () => {
  const { deps, inserts, promotions } = fakes();
  const result = await createTaskCore(base, deps);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.urgency, 'not_urgent');
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0], {
    entityType: 'order',
    entityId: 42,
    assigneeStaffId: 9,
    // The thrower is recorded on the row itself — without it, "what did I hand
    // off" is a query nobody can write (2026-08-08d).
    assignedByStaffId: ACTOR,
    priority: 100,
    note: null,
    status: 'OPEN',
  });
  assert.equal(promotions.length, 0, 'a normal task must not promote anything');
});

test('an urgent throw writes the urgent priority AND promotes the record', async () => {
  const { deps, inserts, promotions } = fakes({ ok: true, changed: true });
  const result = await createTaskCore({ ...base, urgency: 'urgent' }, deps);

  assert.equal(result.ok && result.urgency, 'promoted');
  assert.equal(inserts[0].priority, 10);
  assert.deepEqual(promotions, [{ entityType: 'order', entityId: 42 }]);
});

test('an already-urgent record reports `already`, not a second promotion', async () => {
  const { deps } = fakes({ ok: true, changed: false });
  const result = await createTaskCore({ ...base, urgency: 'urgent' }, deps);
  assert.equal(result.ok && result.urgency, 'already');
});

/**
 * The degrade contract. The task is the commitment; the promotion is an
 * amplifier. Telling an operator their handoff failed when it landed is worse
 * than telling them the record could not also be flagged.
 */
test('a refused promotion still lands the task', async () => {
  const { deps, inserts } = fakes({ ok: false, reason: 'not_found' });
  const result = await createTaskCore({ ...base, urgency: 'urgent' }, deps);

  assert.equal(result.ok, true, 'the throw must survive a failed promotion');
  assert.equal(result.ok && result.urgency, 'failed');
  assert.equal(inserts.length, 1);
});

test('a THROWN promotion still lands the task', async () => {
  const { deps, inserts } = fakes(new Error('helpdesk unreachable'));
  const result = await createTaskCore({ ...base, urgency: 'urgent' }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.urgency, 'failed');
  assert.equal(inserts.length, 1);
});

test('throwing at yourself is refused before anything is written', async () => {
  const { deps, inserts } = fakes();
  const result = await createTaskCore({ ...base, assigneeStaffId: ACTOR }, deps);

  assert.deepEqual(result, { ok: false, reason: 'self_throw' });
  assert.equal(inserts.length, 0);
});

test('an unsupported record kind is refused before anything is written', async () => {
  for (const entityType of ['receiving_line', 'serial_unit', 'repair', null, undefined, 3]) {
    const { deps, inserts } = fakes();
    const result = await createTaskCore({ ...base, entityType }, deps);
    assert.deepEqual(result, { ok: false, reason: 'unsupported_entity' });
    assert.equal(inserts.length, 0, `${String(entityType)} must not reach the insert`);
  }
});

test('bad ids are refused before anything is written', async () => {
  for (const entityId of [0, -1, 1.5, Number.NaN, 'abc', null]) {
    const { deps, inserts } = fakes();
    const result = await createTaskCore({ ...base, entityId }, deps);
    assert.deepEqual(result, { ok: false, reason: 'invalid_entity_id' });
    assert.equal(inserts.length, 0);
  }
  for (const assigneeStaffId of [0, -1, 2.5, 'x', null]) {
    const { deps, inserts } = fakes();
    const result = await createTaskCore({ ...base, assigneeStaffId }, deps);
    assert.deepEqual(result, { ok: false, reason: 'invalid_assignee' });
    assert.equal(inserts.length, 0);
  }
});

test('a note is trimmed, an empty note is null, an oversized note is refused', async () => {
  const { deps, inserts } = fakes();
  await createTaskCore({ ...base, note: '  check the serial  ' }, deps);
  assert.equal(inserts[0].note, 'check the serial');

  const blank = fakes();
  await createTaskCore({ ...base, note: '   ' }, blank.deps);
  assert.equal(blank.inserts[0].note, null, 'whitespace is absence, not a note');

  const long = fakes();
  const result = await createTaskCore({ ...base, note: 'x'.repeat(TASK_NOTE_MAX + 1) }, long.deps);
  assert.deepEqual(result, { ok: false, reason: 'note_too_long' });
  assert.equal(long.inserts.length, 0);
});

test('the assignee is notified, with the note and the urgency flag', async () => {
  const { deps, notifications } = fakes();
  const result = await createTaskCore(
    { ...base, note: 'serial mismatch', urgency: 'urgent' },
    deps,
  );

  assert.equal(result.ok && result.notified, 'sent');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].actorStaffId, ACTOR);
  assert.equal(notifications[0].urgent, true);
  assert.equal(notifications[0].task.assigneeStaffId, 9);
  assert.equal(notifications[0].task.note, 'serial mismatch');
});

/**
 * The delivery is an amplifier on a commitment that already landed — the same
 * rule as urgency promotion. A thrower told "that failed" about a task sitting
 * in the database would throw it again.
 */
test('a failed notification still lands the task', async () => {
  const { deps, inserts } = fakes({ ok: true, changed: true }, new Error('ably down'));
  const result = await createTaskCore({ ...base, urgency: 'urgent' }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.notified, 'failed');
  // …and the OTHER amplifier still ran: one failing does not skip the next.
  assert.equal(result.ok && result.urgency, 'promoted');
  assert.equal(inserts.length, 1);
});

/**
 * `staff_inbox_items.entity_type` has no `support_ticket`, so a ticket task is
 * a legal work_assignment that cannot yet become an inbox row. Refusing in the
 * domain keeps a CHECK violation off an operator's screen — and REPORTING it
 * keeps "nobody was told" from looking identical to "delivered".
 */
test('a ticket task is created but honestly reports nobody was notified', async () => {
  const { deps, inserts, notifications } = fakes();
  const result = await createTaskCore({ ...base, entityType: 'support_ticket' }, deps);

  assert.equal(result.ok, true, 'the task itself is still legal');
  assert.equal(result.ok && result.notified, 'skipped_entity');
  assert.equal(inserts.length, 1, 'the work_assignment is written');
  assert.equal(notifications.length, 0, 'the inbox insert must not be attempted');
});

test('order and receiving tasks DO notify', async () => {
  for (const entityType of ['order', 'receiving'] as const) {
    const { deps, notifications } = fakes();
    const result = await createTaskCore({ ...base, entityType }, deps);
    assert.equal(result.ok && result.notified, 'sent', `${entityType} must notify`);
    assert.equal(notifications.length, 1);
  }
});

test('every record kind can be thrown', async () => {
  for (const entityType of ['order', 'receiving', 'support_ticket'] as const) {
    const { deps, inserts } = fakes();
    const result = await createTaskCore({ ...base, entityType }, deps);
    assert.equal(result.ok, true, `${entityType} must be throwable`);
    assert.equal(inserts[0].entityType, entityType);
  }
});
