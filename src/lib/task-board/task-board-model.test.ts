/**
 *   node --import tsx --test src/lib/task-board/task-board-model.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTaskBoardGroupBy,
  parseTaskBoardSort,
  parseTaskBoardStatus,
  sortTaskBoardRows,
  sortTaskBoardRowsBy,
  taskBoardDueFace,
  taskBoardGroups,
  taskBoardProjects,
  taskBoardStatusMatches,
  taskBoardUrgency,
  taskBoardViewCounts,
  type TaskBoardRow,
} from './task-board-model';

function row(over: Partial<TaskBoardRow> & { key: string }): TaskBoardRow {
  return {
    source: 'task',
    id: 1,
    title: over.key,
    detail: null,
    project: null,
    done: false,
    status: 'OPEN',
    taskStatus: 'TODO',
    urgent: false,
    people: [],
    from: null,
    dueMs: null,
    ticket: null,
    repair: null,
    record: null,
    linkCount: 0,
    photoCount: 0,
    docCount: 0,
    team: null,
    cadence: null,
    createdMs: 0,
    lastFollowUpMs: null,
    nextFollowUpMs: null,
    ...over,
  };
}

describe('sortTaskBoardRows', () => {
  it('orders open before closed, then urgent, then nearest due, then newest', () => {
    const sorted = sortTaskBoardRows([
      row({ key: 'done', status: 'DONE', done: true, urgent: true }),
      row({ key: 'no-due-new', createdMs: 50 }),
      row({ key: 'no-due-old', createdMs: 10 }),
      row({ key: 'due-late', dueMs: 2_000 }),
      row({ key: 'due-soon', dueMs: 1_000 }),
      row({ key: 'urgent', urgent: true, dueMs: 9_000 }),
    ]);
    assert.deepEqual(
      sorted.map((r) => r.key),
      ['urgent', 'due-soon', 'due-late', 'no-due-new', 'no-due-old', 'done'],
    );
  });

  it('a scheduled next follow-up pulls a row up to its chase time, even past a later due date', () => {
    const sorted = sortTaskBoardRows([
      row({ key: 'due-1500', dueMs: 1_500 }),
      row({ key: 'chase-1000-due-9000', dueMs: 9_000, nextFollowUpMs: 1_000 }),
      row({ key: 'chase-only-2000', nextFollowUpMs: 2_000 }),
      row({ key: 'nothing', createdMs: 99 }),
    ]);
    assert.deepEqual(
      sorted.map((r) => r.key),
      ['chase-1000-due-9000', 'due-1500', 'chase-only-2000', 'nothing'],
    );
  });
});

describe('status and view membership', () => {
  it('a withdrawn task is neither open nor done', () => {
    const canceled = row({ key: 'c', status: 'CANCELED' });
    assert.equal(taskBoardStatusMatches(canceled, 'open'), false);
    assert.equal(taskBoardStatusMatches(canceled, 'done'), false);
    assert.equal(taskBoardStatusMatches(canceled, 'all'), true);
  });

  it('Waiting is open work on a hold; it stays in Open too, and finished work never waits', () => {
    const held = row({ key: 'held', status: 'IN_PROGRESS', taskStatus: 'BLOCKED' });
    const working = row({ key: 'working', status: 'IN_PROGRESS', taskStatus: 'IN_PROGRESS' });
    const done = row({ key: 'done', status: 'DONE', done: true, taskStatus: 'DONE' });
    assert.equal(taskBoardStatusMatches(held, 'waiting'), true);
    assert.equal(taskBoardStatusMatches(held, 'open'), true);
    assert.equal(taskBoardStatusMatches(working, 'waiting'), false);
    assert.equal(taskBoardStatusMatches(done, 'waiting'), false);
    assert.equal(parseTaskBoardStatus('waiting'), 'waiting');
    assert.equal(parseTaskBoardStatus('pending'), 'open', 'an unknown filter reads as the default');
  });

  it('a ticket or repair task counts as Support, not a plain task; closed rows never count', () => {
    const counts = taskBoardViewCounts([
      row({ key: 'plain' }),
      row({ key: 'ticket', ticket: { number: 48120, subject: null, status: null } }),
      row({ key: 'repair', repair: { id: 53, ticketNumber: 'RS-0053', status: 'Pending Repair' } }),
      row({ key: 'check', source: 'checklist', status: null, ticket: { number: 7, subject: null, status: null } }),
      row({ key: 'closed-ticket', status: 'DONE', done: true, ticket: { number: 1, subject: null, status: null } }),
    ]);
    assert.deepEqual(counts, { all: 4, task: 1, ticket: 3, checklist: 1, project: 0 });
  });
});

describe('taskBoardProjects', () => {
  it('rolls open/done, the nearest open due, and every member up per project, busiest first', () => {
    const ana = { id: 1, name: 'Ana' };
    const bo = { id: 2, name: 'Bo' };
    const projects = taskBoardProjects([
      row({ key: 'a1', project: 'Relist', people: [ana], dueMs: 5_000 }),
      row({ key: 'a2', project: 'Relist', people: [bo, ana], dueMs: 3_000 }),
      row({ key: 'a3', project: 'Relist', status: 'DONE', done: true, dueMs: 1_000 }),
      row({ key: 'a4', project: 'Relist', status: 'CANCELED' }),
      row({ key: 'b1', project: 'Audit' }),
    ]);
    assert.deepEqual(
      projects.map((p) => [p.name, p.open, p.done, p.nextDueMs, p.people.map((x) => x.name)]),
      [
        ['Relist', 2, 1, 3_000, ['Ana', 'Bo']],
        ['Audit', 1, 0, null, []],
      ],
    );
  });
});

describe('taskBoardDueFace', () => {
  // 2026-09-29 12:00 in Los Angeles (PDT, UTC-7).
  const noon = Date.parse('2026-09-29T19:00:00Z');
  it('reads late, today, tomorrow in the warehouse zone', () => {
    assert.equal(taskBoardDueFace(Date.parse('2026-09-27T19:00:00Z'), noon)?.label, '2d late');
    assert.equal(taskBoardDueFace(Date.parse('2026-09-29T18:00:00Z'), noon)?.tone, 'late');
    assert.equal(taskBoardDueFace(Date.parse('2026-09-30T00:00:00Z'), noon)?.label, 'Today 5:00 PM');
    // 23:30 UTC on the 30th is still the 30th in LA → tomorrow.
    assert.equal(taskBoardDueFace(Date.parse('2026-09-30T23:30:00Z'), noon)?.label, 'Tomorrow');
    // Six days out reads its weekday; past a week, the date.
    assert.equal(taskBoardDueFace(Date.parse('2026-10-05T19:00:00Z'), noon)?.label, 'Mon');
    assert.equal(taskBoardDueFace(Date.parse('2026-10-20T19:00:00Z'), noon)?.label, 'Oct 20');
    assert.equal(taskBoardDueFace(null, noon), null);
  });
});

describe('taskBoardUrgency (warehouse civil dates)', () => {
  // 2026-10-03 23:30 in Los Angeles (PDT, UTC-7) = 2026-10-04 06:30 UTC — already "tomorrow" in UTC.
  const lateNight = Date.parse('2026-10-04T06:30:00Z');
  const bucket = (dueIso: string | null, over: Partial<TaskBoardRow> = {}) =>
    taskBoardUrgency(row({ key: 'r', dueMs: dueIso ? Date.parse(dueIso) : null, ...over }), lateNight);

  it('past its due instant is Overdue, even earlier the same day; later today is Today', () => {
    assert.equal(bucket('2026-10-04T05:00:00Z'), 'overdue', '22:00 LA today, now 23:30');
    assert.equal(bucket('2026-10-04T06:45:00Z'), 'today', '23:45 LA today');
  });

  it('splits on Pacific midnight, never UTC', () => {
    // 00:15 LA on the 4th — tomorrow, though UTC calls both the 4th.
    assert.equal(bucket('2026-10-04T07:15:00Z'), 'tomorrow');
    // 23:59 LA on the 4th — still tomorrow; 00:01 LA on the 5th — this week.
    assert.equal(bucket('2026-10-05T06:59:00Z'), 'tomorrow');
    assert.equal(bucket('2026-10-05T07:01:00Z'), 'week');
  });

  it('six days out is This week, seven is Later; no date and closed rows have their own buckets', () => {
    assert.equal(bucket('2026-10-09T19:00:00Z'), 'week');
    assert.equal(bucket('2026-10-10T19:00:00Z'), 'later');
    assert.equal(bucket(null), 'none');
    assert.equal(bucket('2026-10-01T19:00:00Z', { status: 'DONE', done: true, taskStatus: 'DONE' }), 'closed', 'done work is never overdue');
  });
});

describe('taskBoardGroups', () => {
  const noon = Date.parse('2026-09-29T19:00:00Z');

  it('urgency: time order, empty groups dropped, arrival order kept inside a group', () => {
    const groups = taskBoardGroups(
      [
        row({ key: 'later', dueMs: Date.parse('2026-10-20T19:00:00Z') }),
        row({ key: 'today-b', dueMs: Date.parse('2026-09-29T23:00:00Z') }),
        row({ key: 'late', dueMs: Date.parse('2026-09-28T19:00:00Z') }),
        row({ key: 'today-a', dueMs: Date.parse('2026-09-29T20:00:00Z') }),
        row({ key: 'undated' }),
      ],
      'urgency',
      noon,
    );
    assert.deepEqual(
      groups.map((g) => [g.label, g.rows.map((r) => r.key)]),
      [
        ['Overdue', ['late']],
        ['Today', ['today-b', 'today-a']],
        ['Later', ['later']],
        ['No date', ['undated']],
      ],
    );
    assert.ok(!groups.some((g) => g.urgency === 'tomorrow' || g.urgency === 'week'), 'empty buckets never paint');
  });

  it('type: board order; the ticket group is Support follow-ups', () => {
    const groups = taskBoardGroups(
      [
        row({ key: 'plain' }),
        row({ key: 'ticket', ticket: { number: 1, subject: null, status: 'open' } }),
        row({ key: 'proj', project: 'Relist' }),
        row({ key: 'check', source: 'checklist', status: null, taskStatus: null }),
      ],
      'type',
      noon,
    );
    assert.deepEqual(
      groups.map((g) => [g.type, g.label]),
      [
        ['checklist', 'Daily checklist'],
        ['ticket', 'Support follow-ups'],
        ['project', 'Long-term projects'],
        ['task', 'Standalone tasks'],
      ],
    );
  });

  it('status: TASK_STATUSES order; a checklist item reads To do / Done', () => {
    const groups = taskBoardGroups(
      [
        row({ key: 'blocked', taskStatus: 'BLOCKED' }),
        row({ key: 'todo' }),
        row({ key: 'check', source: 'checklist', status: null, taskStatus: null }),
        row({ key: 'working', taskStatus: 'IN_PROGRESS' }),
      ],
      'status',
      noon,
    );
    assert.deepEqual(
      groups.map((g) => [g.status, g.label, g.rows.map((r) => r.key)]),
      [
        ['TODO', 'To do', ['todo', 'check']],
        ['IN_PROGRESS', 'In progress', ['working']],
        ['BLOCKED', 'Blocked', ['blocked']],
      ],
    );
  });

  it('project: busiest first, then No project; none: one group, or nothing for no rows', () => {
    const rows = [
      row({ key: 'solo' }),
      row({ key: 'a1', project: 'Audit' }),
      row({ key: 'r1', project: 'Relist' }),
      row({ key: 'r2', project: 'Relist' }),
    ];
    assert.deepEqual(
      taskBoardGroups(rows, 'project', noon).map((g) => [g.label, g.project, g.rows.length]),
      [
        ['Relist', 'Relist', 2],
        ['Audit', 'Audit', 1],
        ['No project', null, 1],
      ],
    );
    assert.deepEqual(
      taskBoardGroups(rows, 'none', noon).map((g) => g.rows.map((r) => r.key)),
      [['solo', 'a1', 'r1', 'r2']],
    );
    assert.deepEqual(taskBoardGroups([], 'none', noon), []);
  });
});

describe('sortTaskBoardRowsBy', () => {
  it('urgency is the board order', () => {
    const rows = [
      row({ key: 'b', dueMs: 2_000 }),
      row({ key: 'u', urgent: true }),
      row({ key: 'a', dueMs: 1_000 }),
    ];
    assert.deepEqual(
      sortTaskBoardRowsBy(rows, 'urgency').map((r) => r.key),
      sortTaskBoardRows(rows).map((r) => r.key),
    );
  });

  it('due: soonest due first, undated sink, closed rows still last; ties fall back to urgency', () => {
    const sorted = sortTaskBoardRowsBy(
      [
        row({ key: 'done', status: 'DONE', done: true, dueMs: 1 }),
        row({ key: 'undated-urgent', urgent: true }),
        row({ key: 'due-2000', dueMs: 2_000 }),
        row({ key: 'due-1000', dueMs: 1_000 }),
        row({ key: 'due-1000-urgent', dueMs: 1_000, urgent: true }),
      ],
      'due',
    );
    assert.deepEqual(
      sorted.map((r) => r.key),
      ['due-1000-urgent', 'due-1000', 'due-2000', 'undated-urgent', 'done'],
    );
  });

  it('status walks TASK_STATUSES; newest is the latest handoff first', () => {
    const rows = [
      row({ key: 'blocked', taskStatus: 'BLOCKED', createdMs: 3 }),
      row({ key: 'todo', createdMs: 1 }),
      row({ key: 'pending', taskStatus: 'PENDING', createdMs: 2 }),
    ];
    assert.deepEqual(sortTaskBoardRowsBy(rows, 'status').map((r) => r.key), ['todo', 'pending', 'blocked']);
    assert.deepEqual(sortTaskBoardRowsBy(rows, 'newest').map((r) => r.key), ['blocked', 'pending', 'todo']);
  });

  it('parses ?group= / ?sort=, unknown reads as unset', () => {
    assert.equal(parseTaskBoardGroupBy('urgency'), 'urgency');
    assert.equal(parseTaskBoardGroupBy('bogus'), null);
    assert.equal(parseTaskBoardGroupBy(null), null);
    assert.equal(parseTaskBoardSort('due'), 'due');
    assert.equal(parseTaskBoardSort('updated'), null);
  });
});
