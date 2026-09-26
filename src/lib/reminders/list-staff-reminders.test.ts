import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listStaffReminders,
  type ChecklistReminderCandidate,
  type StaffReminderDeps,
  type TaskReminderCandidate,
} from './list-staff-reminders';

const ORG = '00000000-0000-0000-0000-0000000000aa';
const STAFF = 7;

interface Captured {
  taskWindows: Array<{ orgId: string; staffId: number; fromIso: string; toIso: string }>;
  checklistDays: string[][];
}

function fakes(opts: {
  tasks?: TaskReminderCandidate[];
  items?: ChecklistReminderCandidate[];
  marks?: Array<{ itemId: number; dayKey: string }>;
}) {
  const cap: Captured = { taskWindows: [], checklistDays: [] };
  const deps: StaffReminderDeps = {
    async listTaskCandidates(orgId, staffId, fromIso, toIso) {
      cap.taskWindows.push({ orgId, staffId, fromIso, toIso });
      return opts.tasks ?? [];
    },
    async listChecklistCandidates(_orgId, _staffId, dayKeys) {
      cap.checklistDays.push(dayKeys);
      return opts.items ?? [];
    },
    async listChecklistMarks() {
      return opts.marks ?? [];
    },
  };
  return { deps, cap };
}

function task(over: Partial<TaskReminderCandidate>): TaskReminderCandidate {
  return {
    id: 41,
    entityType: 'order',
    entityId: 1234,
    note: null,
    projectName: null,
    status: 'OPEN',
    priority: 100,
    remindAt: null,
    deadlineAt: null,
    assignedByName: 'Ana',
    ticket: null,
    ...over,
  };
}

/** Recurring 09:00 item, 30 minutes' notice, live on each given day. */
function recurringOn(dayKeys: string[]): ChecklistReminderCandidate[] {
  return dayKeys.map((dayKey) => ({
    itemId: 5,
    dayKey,
    title: 'Check the dock door',
    dueTime: '09:00',
    remindOffsetMinutes: 30,
  }));
}

test('checklist due times resolve in the warehouse zone across the PDT → PST switch', async () => {
  // 2026-11-01 02:00 PDT falls back to PST. 09:00 civil is 16:00Z before, 17:00Z after.
  const days = ['2026-10-31', '2026-11-01', '2026-11-02'];
  const { deps, cap } = fakes({ items: recurringOn(days) });
  const out = await listStaffReminders(
    ORG,
    STAFF,
    { fromMs: Date.parse('2026-10-31T12:00:00Z'), days: 3, includeTasks: false },
    deps,
  );

  assert.deepEqual(
    out.reminders.map((r) => [r.id, r.dueAt, r.remindAt]),
    [
      ['checklist:5:2026-10-31', '2026-10-31T16:00:00.000Z', '2026-10-31T15:30:00.000Z'],
      ['checklist:5:2026-11-01', '2026-11-01T17:00:00.000Z', '2026-11-01T16:30:00.000Z'],
      ['checklist:5:2026-11-02', '2026-11-02T17:00:00.000Z', '2026-11-02T16:30:00.000Z'],
    ],
  );
  // The window ends 2026-11-03 04:00 PST; the scan runs one civil day past it,
  // because an offset can reach back a whole day.
  assert.deepEqual(cap.checklistDays[0], ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
});

test('a recurring item rings once per day inside the window, never before `from`', async () => {
  // from = 2026-09-25 10:00 PDT, so today's 08:30 ring has already passed.
  const days = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
  const { deps } = fakes({ items: recurringOn(days) });
  const out = await listStaffReminders(
    ORG,
    STAFF,
    { fromMs: Date.parse('2026-09-25T17:00:00Z'), days: 2, includeTasks: false },
    deps,
  );

  assert.deepEqual(
    out.reminders.map((r) => r.id),
    ['checklist:5:2026-09-26', 'checklist:5:2026-09-27'],
  );
  assert.ok(out.reminders.every((r) => r.deepLink === '/m/home' && r.urgent === false));
});

test('a day the staffer already ticked does not ring', async () => {
  const days = ['2026-09-26', '2026-09-27'];
  const { deps } = fakes({
    items: recurringOn(days),
    marks: [{ itemId: 5, dayKey: '2026-09-26' }],
  });
  const out = await listStaffReminders(
    ORG,
    STAFF,
    { fromMs: Date.parse('2026-09-26T07:00:00Z'), days: 2, includeTasks: false },
    deps,
  );

  assert.deepEqual(out.reminders.map((r) => r.id), ['checklist:5:2026-09-27']);
});

test('a task with a deadline and no reminder rings at the deadline', async () => {
  const deadline = '2026-09-26T21:00:00.000Z';
  const { deps, cap } = fakes({ tasks: [task({ deadlineAt: deadline, priority: 10 })] });
  const out = await listStaffReminders(
    ORG,
    STAFF,
    { fromMs: Date.parse('2026-09-25T17:00:00Z'), days: 7, includeTasks: true },
    deps,
  );

  assert.equal(out.reminders.length, 1);
  const [r] = out.reminders;
  assert.equal(r.id, 'task:41');
  assert.equal(r.remindAt, deadline);
  assert.equal(r.dueAt, deadline);
  assert.equal(r.urgent, true);
  assert.equal(r.title, 'Order 1234', 'no note → the record names the task');
  assert.match(r.body ?? '', /^Order 1234 · from Ana · due /);
  assert.equal(r.deepLink, '/m/home?task=41');
  assert.deepEqual(cap.taskWindows[0], {
    orgId: ORG,
    staffId: STAFF,
    fromIso: '2026-09-25T17:00:00.000Z',
    toIso: '2026-10-02T17:00:00.000Z',
  });
});

test('a done task does not ring, and tasks are skipped entirely without the permission', async () => {
  const remindAt = '2026-09-26T16:00:00.000Z';
  const window = { fromMs: Date.parse('2026-09-25T17:00:00Z'), days: 7 };

  const done = fakes({ tasks: [task({ status: 'DONE', remindAt })] });
  const doneOut = await listStaffReminders(ORG, STAFF, { ...window, includeTasks: true }, done.deps);
  assert.deepEqual(doneOut.reminders, []);

  const noPerm = fakes({ tasks: [task({ remindAt })] });
  const noPermOut = await listStaffReminders(ORG, STAFF, { ...window, includeTasks: false }, noPerm.deps);
  assert.deepEqual(noPermOut.reminders, []);
  assert.equal(noPerm.cap.taskWindows.length, 0, 'the task store is never read without the permission');
});
