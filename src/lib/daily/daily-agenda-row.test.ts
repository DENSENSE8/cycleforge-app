/** The agenda's THREE bands, and the one store two of them share. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAILY_AGENDA_BAND_ORDER,
  DAILY_AGENDA_TYPE_LABEL,
  bandDailyAgendaRows,
  dailyAgendaFromChecklist,
  dailyAgendaFromTask,
  isDailyAgendaWork,
  sortDailyAgendaRows,
} from './daily-agenda-row';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';

function task(overrides: Partial<TaskDeskRow> = {}): TaskDeskRow {
  return {
    id: 41,
    entityType: 'receiving',
    entityId: 4412,
    note: 'Re-test the battery',
    projectName: null,
    status: 'OPEN',
    priority: 100,
    urgency: 'normal',
    assignee: { id: 3, name: 'Dana' },
    assignees: [{ id: 3, name: 'Dana' }],
    assignedBy: { id: 9, name: 'Lee' },
    assignedAtMs: Date.parse('2026-09-22T15:00:00.000Z'),
    startedAtMs: null,
    deadlineAtMs: null,
    completedAtMs: null,
    remindAtMs: null,
    lastFollowUpAtMs: null,
    nextFollowUpAtMs: null,
    ticket: null,
    links: [],
    photoCount: 0,
    videoCount: 0,
    coverPhotoId: null,
    docCount: 0,
    ...overrides,
  };
}

const ticketTask = (overrides: Partial<TaskDeskRow> = {}) =>
  task({
    id: 55,
    entityType: 'support_ticket',
    entityId: 312,
    ticket: {
      id: 312,
      provider: 'zendesk',
      subject: 'Cracked housing',
      status: 'open',
      externalId: '48120',
    },
    ...overrides,
  });

const checklist = () =>
  dailyAgendaFromChecklist({
    id: 7,
    title: 'Front door locked',
    sortOrder: 0,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    done: false,
    teamDone: 3,
    teamTotal: 5,
    markedAt: null,
  });

test('a ticket task bands as Ticket and keeps its own key space', () => {
  const row = dailyAgendaFromTask(ticketTask());
  assert.equal(row.type, 'ticket');
  assert.equal(row.key, 'ticket:55');
  // The id is still the ASSIGNMENT's, because that is what `?task=` selects
  // and what PATCH /api/tasks/[id] patches.
  assert.equal(row.id, 55);
});

test('a carton task still bands as Task', () => {
  const row = dailyAgendaFromTask(task());
  assert.equal(row.type, 'task');
  assert.equal(row.key, 'task:41');
});

test('a ticket row carries the helpdesk door, not the registry id', () => {
  const row = dailyAgendaFromTask(ticketTask());
  assert.equal(row.recordLabel, 'Ticket 48120');
  assert.equal(row.recordHref, '/support?q=48120');
});

test('both work bands answer isDailyAgendaWork; the checklist does not', () => {
  assert.equal(isDailyAgendaWork(dailyAgendaFromTask(task())), true);
  assert.equal(isDailyAgendaWork(dailyAgendaFromTask(ticketTask())), true);
  assert.equal(isDailyAgendaWork(checklist()), false);
});

test('bands come out in declared order, and an empty band is dropped', () => {
  const bands = bandDailyAgendaRows(
    sortDailyAgendaRows([
      dailyAgendaFromTask(ticketTask()),
      checklist(),
      dailyAgendaFromTask(task()),
    ]),
  );
  assert.deepEqual(
    bands.map(([band]) => band),
    ['checklist', 'task', 'ticket'],
  );

  const noTickets = bandDailyAgendaRows([checklist(), dailyAgendaFromTask(task())]);
  assert.deepEqual(
    noTickets.map(([band]) => band),
    ['checklist', 'task'],
  );
});

test('urgency ordering applies inside the ticket band too', () => {
  const normal = dailyAgendaFromTask(ticketTask({ id: 1 }));
  const urgent = dailyAgendaFromTask(ticketTask({ id: 2, priority: 1, urgency: 'urgent' }));
  const sorted = sortDailyAgendaRows([normal, urgent]);
  assert.deepEqual(
    sorted.map((r) => r.id),
    [2, 1],
  );
});

test('every declared band has a caption — a band key with no word is a blank header', () => {
  for (const band of DAILY_AGENDA_BAND_ORDER) {
    assert.equal(typeof DAILY_AGENDA_TYPE_LABEL[band], 'string');
    assert.ok(DAILY_AGENDA_TYPE_LABEL[band].length > 0);
  }
});
