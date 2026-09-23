/**
 * Render contract — the desk agenda, as a Reminders list (`/`).
 *
 *   npx tsx --test src/features/home/daily-reminders-list.test.tsx
 *
 * What the list promises:
 *   - the bands paint in `DAILY_AGENDA_BAND_ORDER` with their counts, and an
 *     empty band is absent rather than a caption over nothing;
 *   - a done row strikes through the SAME `StruckLabel` the phone row paints;
 *   - ONE caption line, carrying only what differs from the title, and the
 *     overdue register is the only one it may raise;
 *   - the tick is reachable on every row, and two stores that number their
 *     rows independently never share a DOM id;
 *   - a checklist item never grows a door to a plane it does not have, while a
 *     work row opens its inspector and links its record;
 *   - failure, still-loading and settled-empty stay three DIFFERENT sentences.
 */

import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DailyRemindersList } from '@/features/home/DailyRemindersList';
import {
  dailyAgendaFromChecklist,
  dailyAgendaFromTask,
  sortDailyAgendaRows,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';

/** Noon PST on a Wednesday — the clock every "Due today" below is read against. */
const NOW = Date.parse('2026-09-23T19:00:00.000Z');
const noop = () => {};

function check(overrides: Partial<Parameters<typeof dailyAgendaFromChecklist>[0]> = {}): DailyAgendaRow {
  return dailyAgendaFromChecklist({
    id: 7,
    title: 'Sweep the receiving lane',
    sortOrder: 1,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    done: false,
    teamDone: 0,
    teamTotal: 4,
    markedAt: null,
    ...overrides,
  });
}

function assignment(overrides: Partial<TaskDeskRow> = {}): DailyAgendaRow {
  return dailyAgendaFromTask({
    id: 7,
    entityType: 'receiving',
    entityId: 4412,
    note: 'Re-test the battery',
    status: 'OPEN',
    priority: 100,
    urgency: 'normal',
    assignee: { id: 3, name: 'Dana' },
    assignedBy: { id: 9, name: 'Lee' },
    assignedAtMs: NOW - 3_600_000,
    startedAtMs: null,
    deadlineAtMs: null,
    completedAtMs: null,
    ticket: null,
    ...overrides,
  } as TaskDeskRow);
}

function paint(rows: readonly DailyAgendaRow[], props: Partial<Parameters<typeof DailyRemindersList>[0]> = {}) {
  return renderToStaticMarkup(
    <DailyRemindersList
      rows={sortDailyAgendaRows(rows)}
      nowMs={NOW}
      selectedTaskId={null}
      canTick={() => true}
      onToggle={noop}
      onOpen={noop}
      loading={false}
      error={null}
      emptyMessage="Nothing on the agenda for this day."
      {...props}
    />,
  );
}

test('the bands paint in agenda order, each with its own count', () => {
  const html = paint([
    check(),
    check({ id: 8, title: 'Wipe the bench', sortOrder: 2 }),
    assignment(),
    assignment({
      id: 91,
      entityType: 'support_ticket',
      entityId: 550,
      note: 'Customer wants a return label',
      ticket: { id: 550, number: 48120, subject: 'Return label', status: 'open' },
    } as Partial<TaskDeskRow>),
  ]);

  const headings = [...html.matchAll(/id="daily-band-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(headings, ['checklist', 'task', 'ticket']);
  assert.match(html, /Daily checklist/);
  assert.match(html, /data-band-count="checklist"[^>]*>2</);
  assert.match(html, /data-band-count="task"[^>]*>1</);
  assert.match(html, /data-band-count="ticket"[^>]*>1</);
});

test('a band with no rows is absent, never a caption over nothing', () => {
  const html = paint([check()]);
  assert.match(html, /id="daily-band-checklist"/);
  assert.doesNotMatch(html, /id="daily-band-task"/);
  assert.doesNotMatch(html, /id="daily-band-ticket"/);
});

test('a done row strikes through the shared StruckLabel face', () => {
  const open = paint([check()]);
  assert.match(open, /data-struck="false"/);
  assert.match(open, /text-decoration-thickness:0px/);

  const done = paint([check({ done: true })]);
  assert.match(done, /data-struck="true"/);
  assert.match(done, /\[text-decoration-line:line-through\]/);
  assert.match(done, /text-decoration-thickness:1px/);
  assert.match(done, /data-done="true"/);
});

test('a work row carries ONE caption: when it is owed, what it is about, whose it is', () => {
  const html = paint([assignment({ deadlineAtMs: NOW + 3_600_000 })]);
  assert.match(html, /Due today · Carton 4412 · Dana/);
  // ONE caption line per row — never a second sub-line under the title.
  assert.equal(html.match(/text-role-micro/g)?.length, 1);
});

test('an overdue open task raises the danger register; finishing it lowers it', () => {
  const late = { deadlineAtMs: NOW - 86_400_000 } as Partial<TaskDeskRow>;
  const open = paint([assignment(late)]);
  assert.match(open, /Overdue Sep 22/);
  assert.match(open, /text-text-danger/);

  // Done is never late — it was finished, whenever that was.
  const done = paint([assignment({ ...late, status: 'DONE' })]);
  assert.doesNotMatch(done, /text-text-danger/);
});

test('a plain recurring check paints no caption at all — only the exception is marked', () => {
  const plain = paint([check()]);
  assert.doesNotMatch(plain, /text-role-micro/);

  const once = paint([check({ kind: 'once', assignedStaffName: 'Dana', assignedStaffId: 3 })]);
  assert.match(once, /Today only · Dana/);
});

test('a checklist row and a task row numbered 7 get different checkbox ids', () => {
  // `daily_check_items.id = 7` and `work_assignments.id = 7` land on the same
  // list; one shared DOM id would make the task's label tick the check.
  const html = paint([check(), assignment()]);
  assert.match(html, /id="daily-checklist-7"/);
  assert.match(html, /id="daily-task-7"/);
  assert.match(html, /for="daily-checklist-7"/);
  assert.doesNotMatch(html, /for="daily-task-7"/, 'a work row opens its plane, it does not label-tick');
});

test('a checklist item grows no record door; a work row opens its inspector and links its record', () => {
  const checklist = paint([check()]);
  // One control on the row: the tick. (Radix paints the box as a button.)
  assert.equal(checklist.match(/<button/g)?.length, 1, 'nothing to open — no dead affordance');
  assert.doesNotMatch(checklist, /<a /);

  const work = paint([assignment()]);
  assert.equal(work.match(/<button/g)?.length, 2, 'the tick, plus the title that opens the rail');
  assert.match(work, /href="\/unbox\?carton=4412"/);
  assert.match(work, /aria-label="Open Carton 4412"/);
});

test('a day that cannot take a mark disables the tick instead of lying about it', () => {
  const html = paint([check()], { canTick: (row) => row.type !== 'checklist' });
  assert.match(html, /disabled=""[^>]*id="daily-checklist-7"/);
  assert.doesNotMatch(paint([check()]), /disabled=""/);
});

test('failure, loading and settled-empty are three different sentences', () => {
  assert.match(paint([], { error: 'Could not load the checklist.' }), /Could not load the checklist\./);
  assert.match(paint([], { loading: true }), /Loading the agenda…/);
  assert.match(paint([]), /Nothing on the agenda for this day\./);
  // A failed load must never read as an empty day.
  assert.doesNotMatch(
    paint([], { error: 'Could not load the checklist.' }),
    /Nothing on the agenda/,
  );
});
