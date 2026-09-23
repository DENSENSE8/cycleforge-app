/**
 * The merged day: TWO stores, one timeline, one fraction.
 *
 * The bugs this file defends against are all failures of MEMBERSHIP — the
 * question "was this task part of THIS person's THIS day". Getting it wrong is
 * silent: a task finished last Tuesday quietly re-credits today's shift, a
 * canceled task quietly blames someone for work nobody wants, and a check id
 * that happens to equal a task id quietly drops a row from the sheet.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildStaffDayAgenda,
  buildStaffDayAgendas,
} from './staff-day-agenda';
import type { StaffDay, StaffDayTask } from '@/lib/daily-checks/staff-day';
import { taskDeskRowFromWire, type TaskDeskWireRow } from '@/lib/tasks/task-desk-row';

const DAY = '2026-09-22';
const DANA = 3;

/** Real fixtures: through the wire mapper, never a hand-built row model. */
function wire(overrides: Partial<TaskDeskWireRow> = {}): TaskDeskWireRow {
  return {
    id: 41,
    entityType: 'receiving',
    entityId: 4412,
    note: 'Re-test the battery',
    status: 'OPEN',
    priority: 100,
    assignee: { id: DANA, name: 'Dana' },
    assignedBy: { id: 9, name: 'Lee' },
    // 2026-09-22 08:00 PST
    assignedAt: '2026-09-22T15:00:00.000Z',
    startedAt: null,
    deadlineAt: null,
    completedAt: null,
    ticket: null,
    ...overrides,
  };
}

const rows = (...wires: Partial<TaskDeskWireRow>[]) =>
  wires.map((w) => taskDeskRowFromWire(wire(w)));

function check(overrides: Partial<StaffDayTask> = {}): StaffDayTask {
  return {
    itemId: 1,
    title: 'Sweep the pack bench',
    kind: 'recurring',
    ticketId: null,
    assignedStaffName: null,
    checkedAt: null,
    ...overrides,
  };
}

function day(overrides: Partial<StaffDay> = {}): StaffDay {
  return {
    dateKey: DAY,
    staffId: DANA,
    name: 'Dana',
    doneCount: 0,
    total: 0,
    lastMarkedAt: null,
    tasks: [],
    ...overrides,
  };
}

test('a task completed on the day lands as a done entry carrying its instant', () => {
  const agenda = buildStaffDayAgenda(
    day(),
    rows({ status: 'DONE', completedAt: '2026-09-22T17:30:00.000Z' }),
  );

  assert.deepEqual(
    agenda.entries.map((e) => [e.key, e.source, e.doneAt]),
    [['task:41', 'task', '2026-09-22T17:30:00.000Z']],
  );
  assert.equal(agenda.taskDone, 1);
  assert.equal(agenda.taskTotal, 1);
  assert.equal(agenda.lastActivityAt, '2026-09-22T17:30:00.000Z');
});

test('a task finished on a different WAREHOUSE day is not on this day', () => {
  // 2026-09-23T06:00Z is 2026-09-22 23:00 PST — the SAME warehouse day, so
  // the UTC date alone would wrongly exclude it.
  const sameWarehouseDay = buildStaffDayAgenda(
    day(),
    rows({ status: 'DONE', completedAt: '2026-09-23T06:00:00.000Z' }),
  );
  assert.equal(sameWarehouseDay.taskDone, 1);

  // 2026-09-23T17:30Z is 2026-09-23 10:30 PST — the next warehouse day.
  const nextDay = buildStaffDayAgenda(
    day(),
    rows({ status: 'DONE', completedAt: '2026-09-23T17:30:00.000Z' }),
  );
  assert.deepEqual(nextDay.entries, []);
  assert.equal(nextDay.taskDone, 0);
  assert.equal(nextDay.taskTotal, 0);
  assert.equal(nextDay.lastActivityAt, null);
});

test('a CANCELED task is neither owed nor done', () => {
  const agenda = buildStaffDayAgenda(
    day(),
    rows({ status: 'CANCELED', completedAt: '2026-09-22T17:30:00.000Z' }),
  );
  assert.deepEqual(agenda.entries, []);
  assert.equal(agenda.taskTotal, 0);
});

test('an open task thrown on or before the day is owed; one thrown later is not', () => {
  const agenda = buildStaffDayAgenda(
    day(),
    rows(
      { id: 41, status: 'IN_PROGRESS', assignedAt: '2026-09-20T15:00:00.000Z' },
      { id: 42, status: 'ASSIGNED', assignedAt: '2026-09-22T15:00:00.000Z' },
      { id: 43, status: 'OPEN', assignedAt: '2026-09-23T15:00:00.000Z' },
    ),
  );

  assert.deepEqual(
    agenda.entries.map((e) => [e.key, e.doneAt]),
    [
      ['task:41', null],
      ['task:42', null],
    ],
  );
  assert.equal(agenda.taskTotal, 2);
  assert.equal(agenda.taskDone, 0);
});

test('a task assigned to someone else never joins this staffer\u2019s day', () => {
  const agenda = buildStaffDayAgenda(
    day(),
    rows({ assignee: { id: 99, name: 'Ali' } }, { assignee: null, id: 42 }),
  );
  assert.deepEqual(agenda.entries, []);
});

test('done entries interleave checks and tasks chronologically, owed work tails', () => {
  const agenda = buildStaffDayAgenda(
    day({
      doneCount: 2,
      total: 3,
      lastMarkedAt: '2026-09-22T18:00:00.000Z',
      tasks: [
        check({ itemId: 1, title: 'Sweep', checkedAt: '2026-09-22T16:00:00.000Z' }),
        check({ itemId: 2, title: 'Count cash', checkedAt: '2026-09-22T18:00:00.000Z' }),
        check({ itemId: 3, title: 'Lock the cage', kind: 'once' }),
      ],
    }),
    rows(
      { id: 41, status: 'DONE', completedAt: '2026-09-22T17:00:00.000Z' },
      { id: 42, note: 'Chase the carrier', deadlineAt: '2026-09-25T00:00:00.000Z' },
      { id: 43, note: 'Fire drill', priority: 10 },
    ),
  );

  assert.deepEqual(
    agenda.entries.map((e) => e.key),
    // done, chronological across BOTH stores …
    ['check:1', 'task:41', 'check:2',
      // … then owed checks in authored order, then owed tasks urgent-first.
      'check:3', 'task:43', 'task:42'],
  );
});

test('combined counts are the two stores summed, and the check half is never re-derived', () => {
  const agenda = buildStaffDayAgenda(
    day({
      doneCount: 2,
      total: 5,
      // Deliberately fewer rows than `total`: the per-staff denominator is the
      // report's, and this module must not recount it from `tasks`.
      tasks: [check({ itemId: 1, checkedAt: '2026-09-22T16:00:00.000Z' })],
    }),
    rows(
      { id: 41, status: 'DONE', completedAt: '2026-09-22T17:00:00.000Z' },
      { id: 42 },
      { id: 43 },
    ),
  );

  assert.equal(agenda.checkDone, 2);
  assert.equal(agenda.checkTotal, 5);
  assert.equal(agenda.taskDone, 1);
  assert.equal(agenda.taskTotal, 3);
  assert.equal(agenda.doneCount, 3);
  assert.equal(agenda.total, 8);
});

test('a check id equal to a task id yields two distinct keys and two rows', () => {
  const agenda = buildStaffDayAgenda(
    day({ total: 1, tasks: [check({ itemId: 41, title: 'Sweep' })] }),
    rows({ id: 41 }),
  );

  assert.deepEqual(agenda.entries.map((e) => e.key), ['check:41', 'task:41']);
  assert.equal(new Set(agenda.entries.map((e) => e.key)).size, 2);
  assert.deepEqual(agenda.entries.map((e) => e.id), [41, 41]);
});

test('a ticket task carries the PROVIDER number and a record label; a check keeps its own ticket', () => {
  const agenda = buildStaffDayAgenda(
    day({ total: 1, tasks: [check({ itemId: 7, ticketId: 991 })] }),
    rows({
      id: 41,
      entityType: 'support_ticket',
      entityId: 312,
      note: '',
      ticket: { id: 312, provider: 'zendesk', subject: 'RMA', status: 'open', externalId: '48120' },
    }),
  );

  const [checkEntry, taskEntry] = agenda.entries;
  assert.equal(checkEntry.ticketId, 991);
  assert.equal(checkEntry.recordLabel, null);
  assert.equal(checkEntry.cadence, 'recurring');
  assert.equal(taskEntry.ticketId, 48120);
  assert.equal(taskEntry.recordLabel, 'Ticket 48120');
  // A wordless handoff names its record rather than painting an empty title.
  assert.equal(taskEntry.title, 'Ticket 48120');
  assert.equal(taskEntry.cadence, null);
});

test('lastActivityAt is the newest instant from EITHER store', () => {
  const taskWins = buildStaffDayAgenda(
    day({ lastMarkedAt: '2026-09-22T16:00:00.000Z' }),
    rows({ status: 'DONE', completedAt: '2026-09-22T19:00:00.000Z' }),
  );
  assert.equal(taskWins.lastActivityAt, '2026-09-22T19:00:00.000Z');

  const markWins = buildStaffDayAgenda(
    day({ lastMarkedAt: '2026-09-22T20:00:00.000Z' }),
    rows({ status: 'DONE', completedAt: '2026-09-22T19:00:00.000Z' }),
  );
  assert.equal(markWins.lastActivityAt, '2026-09-22T20:00:00.000Z');

  assert.equal(buildStaffDayAgenda(day(), []).lastActivityAt, null);
});

test('the roster keeps its order and each staffer only gets their own tasks', () => {
  const agendas = buildStaffDayAgendas(
    [day({ staffId: DANA, name: 'Dana' }), day({ staffId: 9, name: 'Lee' })],
    rows({ id: 41 }, { id: 42, assignee: { id: 9, name: 'Lee' } }),
  );

  assert.deepEqual(
    agendas.map((a) => [a.name, a.entries.map((e) => e.key)]),
    [
      ['Dana', ['task:41']],
      ['Lee', ['task:42']],
    ],
  );
});
