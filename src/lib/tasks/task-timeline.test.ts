import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TaskFollowUp } from './task-follow-ups-shared';
import {
  taskAlertEntryFromRow,
  taskAuditEntryFromRow,
  taskTimelineItems,
  type TaskAlertEntry,
  type TaskAuditEntry,
} from './task-timeline';

const NAMES = { 1: 'Michael', 2: 'Lee', 3: 'Sam' };

function followUp(over: Partial<TaskFollowUp> & Pick<TaskFollowUp, 'id' | 'occurredAt'>): TaskFollowUp {
  return {
    taskId: 16012,
    channel: 'call',
    direction: 'outbound',
    staffId: 1,
    staffName: 'Michael',
    emailTo: null,
    emailSubject: null,
    body: null,
    createdAt: '2026-09-30T05:00:00.000Z',
    ...over,
  };
}

function update(over: Partial<TaskAuditEntry> & Pick<TaskAuditEntry, 'id' | 'at'>): TaskAuditEntry {
  return {
    actorStaffId: 1,
    kind: 'updated',
    changed: [],
    statusBefore: 'TODO',
    statusAfter: 'TODO',
    assigneesBefore: [1],
    assigneesAfter: [1],
    ...over,
  };
}

function alert(over: Partial<TaskAlertEntry> & Pick<TaskAlertEntry, 'id' | 'at'>): TaskAlertEntry {
  return { actorStaffId: 1, staffIds: [3], note: null, dueAt: null, ...over };
}

const NONE = { followUps: [], audit: [], alerts: [] };

test('no sources → an empty stream', () => {
  assert.deepEqual(taskTimelineItems(NONE), []);
});

test('merges every source newest first, a follow-up at its operator-set instant (not when it was typed)', () => {
  const items = taskTimelineItems({
    followUps: [
      // Logged on the 30th about a call on the 27th: it sits on the 27th.
      followUp({ id: 1, occurredAt: '2026-09-27T17:00:00.000Z', createdAt: '2026-09-30T09:00:00.000Z' }),
    ],
    audit: [
      { ...update({ id: 50, at: '2026-09-26T17:00:00.000Z' }), kind: 'created', assigneesBefore: null, assigneesAfter: [1, 3] },
      update({ id: 51, at: '2026-09-29T17:00:00.000Z', changed: ['status'], statusAfter: 'IN_PROGRESS' }),
    ],
    alerts: [alert({ id: 70, at: '2026-09-30T17:00:00.000Z' })],
    staffNames: NAMES,
  });
  assert.deepEqual(
    items.map((item) => item.id),
    ['alert:70', 'audit:51', 'follow-up:1', 'audit:50'],
  );
  assert.deepEqual(
    items.map((item) => item.title),
    ['Alerted Sam to follow up', 'Moved to In progress', 'Called', 'Created for Michael, Sam'],
  );
  assert.deepEqual(
    items.map((item) => item.kind),
    ['alert', 'status', 'call', 'created'],
  );
});

test('rows on the same instant: alert · follow-up · audit, then newer id first — whatever the input order', () => {
  const at = '2026-09-29T17:00:00.000Z';
  const input = {
    followUps: [followUp({ id: 1, occurredAt: at }), followUp({ id: 2, occurredAt: at })],
    audit: [update({ id: 9, at, changed: ['status'], statusAfter: 'DONE' })],
    alerts: [alert({ id: 4, at })],
  };
  const expected = [
    'alert:4',
    'follow-up:2',
    'follow-up:1',
    'audit:9',
  ];
  assert.deepEqual(taskTimelineItems(input).map((item) => item.id), expected);
  const reversed = {
    followUps: [...input.followUps].reverse(),
    audit: input.audit,
    alerts: input.alerts,
  };
  assert.deepEqual(taskTimelineItems(reversed).map((item) => item.id), expected);
});

test('a row without a readable instant sinks below every dated row', () => {
  const items = taskTimelineItems({
    ...NONE,
    followUps: [followUp({ id: 1, occurredAt: '' }), followUp({ id: 2, occurredAt: '2020-01-01T00:00:00.000Z' })],
  });
  assert.deepEqual(items.map((item) => item.id), ['follow-up:2', 'follow-up:1']);
});

test('every row carries the staffer who acted, so the hairline can draw their avatar', () => {
  const items = taskTimelineItems({
    followUps: [followUp({ id: 1, occurredAt: '2026-09-29T10:00:00.000Z', staffId: 3, staffName: 'Sam' })],
    audit: [update({ id: 6, at: '2026-09-29T12:00:00.000Z', actorStaffId: 3, changed: ['status'], statusAfter: 'DONE' })],
    alerts: [alert({ id: 7, at: '2026-09-29T13:00:00.000Z', actorStaffId: 2 })],
    staffNames: NAMES,
  });
  assert.deepEqual(
    items.map(({ actor, actorStaffId }) => [actor, actorStaffId]),
    [['Lee', 2], ['Sam', 3], ['Sam', 3]],
  );
});

test('an edit that moved nothing the timeline speaks for paints no row', () => {
  const items = taskTimelineItems({
    ...NONE,
    audit: [
      update({ id: 1, at: '2026-09-29T10:00:00.000Z', changed: ['priority'] }),
      // Status carried but unchanged, owners re-ordered only.
      update({ id: 2, at: '2026-09-29T11:00:00.000Z', changed: ['status', 'assigneeStaffIds'], assigneesBefore: [1, 3], assigneesAfter: [3, 1] }),
    ],
  });
  assert.deepEqual(items, []);
});

test('owners: added, removed, swapped; each with the before → after names', () => {
  const items = taskTimelineItems({
    ...NONE,
    audit: [
      update({ id: 1, at: '2026-09-29T10:00:00.000Z', changed: ['assigneeStaffIds'], assigneesBefore: [1, 3], assigneesAfter: [1, 2, 3] }),
      update({ id: 2, at: '2026-09-29T11:00:00.000Z', changed: ['assigneeStaffIds'], assigneesBefore: [1, 2, 3], assigneesAfter: [1, 3] }),
      update({ id: 3, at: '2026-09-29T12:00:00.000Z', changed: ['assigneeStaffIds'], assigneesBefore: [1, 3], assigneesAfter: [1, 2] }),
    ],
    staffNames: NAMES,
  });
  assert.deepEqual(items.map((item) => item.title), ['Reassigned', 'Removed Lee', 'Added Lee']);
  assert.deepEqual(items[2]?.changes, [{ key: 'Owners', before: 'Michael, Sam', after: 'Michael, Lee, Sam' }]);
});

test('due: the first move names only the new date; later moves show the date the previous edit left', () => {
  const items = taskTimelineItems({
    ...NONE,
    audit: [
      update({ id: 1, at: '2026-09-29T10:00:00.000Z', changed: ['deadlineAt'], deadlineAfter: '2026-10-01T16:00:00.000Z' }),
      // A priority edit in between still snapshots the due date it left in place.
      update({ id: 2, at: '2026-09-29T11:00:00.000Z', changed: ['priority'], deadlineAfter: '2026-10-01T16:00:00.000Z' }),
      update({ id: 3, at: '2026-09-29T12:00:00.000Z', changed: ['deadlineAt'], deadlineAfter: '2026-10-03T16:00:00.000Z' }),
      update({ id: 4, at: '2026-09-29T13:00:00.000Z', changed: ['deadlineAt', 'status'], statusAfter: 'DONE', deadlineAfter: null }),
    ],
  });
  assert.deepEqual(items.map((item) => item.title), ['Task updated', 'Due Oct 3, 9:00 AM', 'Due Oct 1, 9:00 AM']);
  // A multi-field edit wears the glyph of its first change (status before due).
  assert.deepEqual(items.map((item) => item.kind), ['status', 'due', 'due']);
  assert.equal(items[2]?.changes, undefined);
  assert.deepEqual(items[1]?.changes, [{ key: 'Due', before: 'Oct 1, 9:00 AM', after: 'Oct 3, 9:00 AM' }]);
  assert.deepEqual(items[0]?.changes, [
    { key: 'Status', before: 'To do', after: 'Done' },
    { key: 'Due', before: 'Oct 3, 9:00 AM', after: 'none' },
  ]);
});

test('follow-up rows: who was emailed, subject — the words as written, and the channel kind', () => {
  const [email, note] = taskTimelineItems({
    ...NONE,
    followUps: [
      followUp({ id: 1, occurredAt: '2026-09-28T22:15:00.000Z', channel: 'email', emailTo: 'buyer@example.com', emailSubject: 'Re: pricing', body: '  Hi —\n\n\n\nfollowing up.\n' }),
      followUp({ id: 2, occurredAt: '2026-09-27T22:15:00.000Z', channel: 'note', body: 'x'.repeat(4000) }),
    ],
  });
  assert.equal(email?.title, 'Emailed buyer@example.com');
  assert.equal(email?.kind, 'email');
  // Paragraph breaks survive (the expanded row wraps them); blank-line runs fold to one.
  assert.equal(email?.subtitle, 'Re: pricing — Hi —\n\nfollowing up.');
  assert.equal(note?.title, 'Note');
  assert.equal(note?.kind, 'note');
  // What was said is never cut short by the adapter; the row truncates it visually.
  assert.equal(note?.subtitle?.length, 4000);
});

test('alert rows name the recipients, the note and the due instant', () => {
  const [row] = taskTimelineItems({
    ...NONE,
    alerts: [alert({ id: 1, at: '2026-09-29T10:00:00.000Z', staffIds: [1, 3], note: 'Buyer called back', dueAt: '2026-09-30T16:00:00.000Z' })],
    staffNames: NAMES,
  });
  assert.equal(row?.title, 'Alerted Michael, Sam to follow up');
  assert.equal(row?.subtitle, 'Buyer called back · Due Sep 30, 9:00 AM');
});

test('audit rows as the task routes write them', () => {
  const created = taskAuditEntryFromRow({
    id: '28014',
    created_at: new Date('2026-09-30T04:29:27.580Z'),
    actor_staff_id: 1,
    action: 'work_task.throw',
    before_data: null,
    after_data: null,
    metadata: { method: 'manual', assigneeStaffId: 1, assigneeStaffIds: [1, 3] },
  });
  assert.equal(created?.kind, 'created');
  assert.deepEqual(created?.assigneesAfter, [1, 3]);

  const edited = taskAuditEntryFromRow({
    id: 28059,
    created_at: '2026-09-30T05:17:56.837Z',
    actor_staff_id: 1,
    action: 'work_task.update',
    before_data: { status: 'OPEN', assigneeStaffIds: [1, 3] },
    after_data: { status: 'OPEN', assigneeStaffIds: [1, 2, 3], deadlineAt: '2026-10-01T00:00:00.000Z' },
    metadata: { changed: ['assigneeStaffIds'] },
  });
  assert.deepEqual(edited?.changed, ['assigneeStaffIds']);
  assert.equal(edited?.deadlineAfter, '2026-10-01T00:00:00.000Z');

  assert.equal(
    taskAuditEntryFromRow({ id: 1, created_at: 'nope', actor_staff_id: null, action: 'work_task.update', before_data: null, after_data: null, metadata: null }),
    null,
  );

  const sent = taskAlertEntryFromRow({
    id: 3,
    created_at: '2026-09-30T06:00:00.000Z',
    actor_staff_id: 1,
    after_data: { staffIds: [1], note: '  ', dueAt: null },
  });
  assert.deepEqual(sent, { id: 3, at: '2026-09-30T06:00:00.000Z', actorStaffId: 1, staffIds: [1], note: null, dueAt: null });
});

test('a hold reads as its own status step; OPEN → ASSIGNED is no status change', () => {
  const row = (before: Record<string, unknown>, after: Record<string, unknown>) =>
    taskAuditEntryFromRow({
      id: 7,
      created_at: '2026-09-30T08:00:00.000Z',
      actor_staff_id: 1,
      action: 'work_task.update',
      before_data: before,
      after_data: after,
      metadata: { changed: ['taskState'] },
    })!;
  const held = row({ status: 'IN_PROGRESS', taskState: null }, { status: 'IN_PROGRESS', taskState: 'PENDING' });
  assert.equal(held.statusBefore, 'IN_PROGRESS');
  assert.equal(held.statusAfter, 'PENDING');
  const [item] = taskTimelineItems({ ...NONE, audit: [held], staffNames: NAMES });
  assert.equal(item?.title, 'Moved to Pending');

  const reassigned = row({ status: 'OPEN' }, { status: 'ASSIGNED' });
  assert.equal(reassigned.statusBefore, reassigned.statusAfter);
});
