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
        assigneeStaffIds: args.assigneeStaffIds,
        projectName: args.projectName,
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
    assigneeStaffIds: [9],
    projectName: null,
    // The thrower is recorded on the row itself — without it, "what did I hand
    // off" is a query nobody can write (2026-08-08d).
    assignedByStaffId: ACTOR,
    priority: 100,
    note: null,
    deadlineAt: null,
    remindAt: null,
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

/**
 * The composer captures assignee · priority · deadline in ONE form, so the
 * deadline has to survive the create. If it did not, the desk would POST then
 * PATCH — showing the assignee a half-made task and splitting one act across
 * two audit rows.
 */
test('a deadline reaches the insert, and omitting it inserts NULL', async () => {
  const { deps, inserts } = fakes();
  await createTaskCore({ ...base, deadlineAt: '2026-09-30T17:00:00.000Z' }, deps);
  assert.equal(inserts[0].deadlineAt, '2026-09-30T17:00:00.000Z');

  const none = fakes();
  await createTaskCore(base, none.deps);
  assert.equal(none.inserts[0].deadlineAt, null, 'no deadline is NULL, not today');

  const explicitNull = fakes();
  await createTaskCore({ ...base, deadlineAt: null }, explicitNull.deps);
  assert.equal(explicitNull.inserts[0].deadlineAt, null);
});

test('an unparseable deadline is refused before anything is written', async () => {
  for (const deadlineAt of ['next tuesday', '', 42, {}]) {
    const { deps, inserts } = fakes();
    const result = await createTaskCore({ ...base, deadlineAt }, deps);
    assert.deepEqual(result, { ok: false, reason: 'invalid_deadline' }, String(deadlineAt));
    assert.equal(inserts.length, 0);
  }
});

test('a reminder is stored as a canonical instant; an unparseable one is refused', async () => {
  const { deps, inserts } = fakes();
  await createTaskCore({ ...base, remindAt: '2026-09-30T10:00:00-07:00' }, deps);
  assert.equal(inserts[0].remindAt, '2026-09-30T17:00:00.000Z');

  const none = fakes();
  await createTaskCore(base, none.deps);
  assert.equal(none.inserts[0].remindAt, null);

  const bad = fakes();
  const result = await createTaskCore({ ...base, remindAt: 'tomorrow' }, bad.deps);
  assert.deepEqual(result, { ok: false, reason: 'invalid_reminder' });
  assert.equal(bad.inserts.length, 0);
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
  assert.equal(notifications[0].recipientStaffId, 9);
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
 * `support_ticket` joined `staff_inbox_items_entity_type_chk` in migration
 * `2026-09-22a`, so a ticket handoff now raises a badge like any other. This
 * pins the arm that used to be the exception — a regression here would put
 * `skipped_entity` back and silently un-notify every ticket task.
 */
test('a ticket task notifies its assignee like any other record', async () => {
  const { deps, inserts, notifications } = fakes();
  const result = await createTaskCore({ ...base, entityType: 'support_ticket' }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.notified, 'sent');
  assert.equal(inserts.length, 1, 'the work_assignment is written');
  assert.equal(notifications.length, 1, 'and the inbox row with it');
});

test('every throwable record kind notifies', async () => {
  for (const entityType of ['order', 'receiving', 'support_ticket'] as const) {
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

test('one shared task has an ordered lead, trimmed project label and one inbox delivery per member', async () => {
  const { deps, inserts, notifications } = fakes();
  const result = await createTaskCore({
    ...base, assigneeStaffIds: [9, 11], projectName: '  Returns launch  ',
  }, deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.task.id, 555);
  assert.equal(result.task.assigneeStaffId, 9);
  assert.deepEqual(result.task.assigneeStaffIds, [9, 11]);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].projectName, 'Returns launch');
  assert.deepEqual(notifications.map((notification) => notification.recipientStaffId), [9, 11]);
  assert.deepEqual(result.notifications.map((notification) => notification.status), ['sent', 'sent']);
});

test('invalid or repeated members write nothing', async () => {
  for (const ids of [[], [9, 9], [9, 0], Array.from({ length: 21 }, (_, n) => n + 10)]) {
    const { deps, inserts } = fakes();
    assert.deepEqual(await createTaskCore({ ...base, assigneeStaffIds: ids }, deps),
      { ok: false, reason: 'invalid_assignee' });
    assert.equal(inserts.length, 0);
  }
});

test('the creator may join a team but is never notified of their own throw', async () => {
  const { deps, inserts, notifications } = fakes();
  const result = await createTaskCore({ ...base, assigneeStaffIds: [ACTOR, 9] }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(inserts[0].assigneeStaffIds, [ACTOR, 9]);
  assert.deepEqual(notifications.map(({ recipientStaffId }) => recipientStaffId), [9]);

  const alone = fakes();
  assert.deepEqual(await createTaskCore({ ...base, assigneeStaffIds: [ACTOR] }, alone.deps),
    { ok: false, reason: 'self_throw' });
  assert.equal(alone.inserts.length, 0);
});

test('one failed recipient does not prevent notification of subsequent members', async () => {
  const { deps, notifications } = fakes();
  const notify = deps.notifyAssignee;
  deps.notifyAssignee = async (args) => {
    if (args.recipientStaffId === 9) throw new Error('inbox unavailable');
    return notify(args);
  };
  const result = await createTaskCore({ ...base, assigneeStaffIds: [9, 11] }, deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.notifications, [
    { staffId: 9, status: 'failed' }, { staffId: 11, status: 'sent' },
  ]);
  assert.deepEqual(notifications.map(({ recipientStaffId }) => recipientStaffId), [11]);
});

test('a foreign-org member refuses the whole creation before notifying or promoting', async () => {
  const { deps, notifications, promotions } = fakes();
  deps.insertTask = async () => null;
  const result = await createTaskCore({
    ...base, assigneeStaffIds: [9, 999], urgency: 'urgent',
  }, deps);
  assert.deepEqual(result, { ok: false, reason: 'invalid_assignee' });
  assert.equal(notifications.length, 0);
  assert.equal(promotions.length, 0);
});

test('project names over the store limit are refused; whitespace is no project', async () => {
  const { deps, inserts } = fakes();
  const refused = await createTaskCore({
    ...base, projectName: 'X'.repeat(161),
  }, deps);
  assert.deepEqual(refused, { ok: false, reason: 'project_name_too_long' });
  assert.equal(inserts.length, 0);
  const result = await createTaskCore({ ...base, projectName: '   ' }, deps);
  assert.equal(result.ok && result.task.projectName, null);
});
