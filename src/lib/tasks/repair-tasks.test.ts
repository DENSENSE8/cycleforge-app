/**
 * Repair → task reconcile: one task per open repair, closed when the repair
 * ends, reopened only when the sync itself closed it, never re-imported.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isRepairOpen,
  isSyncOwnedNote,
  planRepairTaskSync,
  repairOpenSql,
  repairTaskNote,
  runRepairTaskSync,
  REPAIR_CLOSED_STATUSES,
  REPAIR_TASK_OWNER_IDS,
  type RepairSyncTask,
  type RepairTaskAction,
  type RepairTaskSource,
} from './repair-tasks';

const OWNERS = REPAIR_TASK_OWNER_IDS['00000000-0000-0000-0000-000000000001'];

function repair(overrides: Partial<RepairTaskSource> = {}): RepairTaskSource {
  return {
    id: 53,
    ticketNumber: 'RS-0053',
    productTitle: 'Bose Wave® music system REPAIR SERVICE',
    status: 'Pending Repair',
    issue: 'CD Issues',
    pickedUp: false,
    helpdeskTicketNumber: null,
    ...overrides,
  };
}

function task(overrides: Partial<RepairSyncTask> = {}): RepairSyncTask {
  return {
    taskId: 900,
    repairId: 53,
    status: 'OPEN',
    note: repairTaskNote(repair()),
    closedBySync: false,
    hasTicketLink: false,
    ...overrides,
  };
}

test('open = not Done / Picked Up / Shipped / Cancelled and no signed pickup', () => {
  assert.equal(isRepairOpen(repair()), true);
  assert.equal(isRepairOpen(repair({ status: 'Repaired, Contact Customer' })), true);
  assert.equal(isRepairOpen(repair({ status: null })), true);
  for (const status of REPAIR_CLOSED_STATUSES) assert.equal(isRepairOpen(repair({ status })), false, status);
  assert.equal(isRepairOpen(repair({ status: ' Done ' })), false);
  // A signed pickup ends the repair even while the status still says otherwise.
  assert.equal(isRepairOpen(repair({ status: 'Repaired, Contact Customer', pickedUp: true })), false);
});

test('the SQL predicate names the same closed statuses and the pickup stamp', () => {
  const sql = repairOpenSql('rs');
  for (const status of REPAIR_CLOSED_STATUSES) assert.ok(sql.includes(`'${status}'`), status);
  assert.match(sql, /rs\.pickup_signed_at IS NULL/);
});

test('the note: product — status, the ticket number, the issue in plain text', () => {
  assert.equal(
    repairTaskNote(repair({ productTitle: 'REPAIR SERVICE  for <b>Wave</b>', issue: 'No sound\n - radio  board' })),
    'REPAIR SERVICE for Wave — Pending Repair\nRepair ticket RS-0053\nNo sound - radio board',
  );
  // Nothing stamped: the repair's own code stands in; no issue, no third line.
  assert.equal(
    repairTaskNote(repair({ productTitle: null, ticketNumber: null, issue: '  ', status: null })),
    'Repair RS-53 — No status\nRepair ticket RS-53',
  );
});

test('backfill: every open repair without a task is created once, closed repairs are never imported', () => {
  const actions = planRepairTaskSync(
    [repair({ id: 3 }), repair({ id: 4, status: 'Done' }), repair({ id: 5, pickedUp: true }), repair({ id: 6, status: 'Incoming Shipment' })],
    [],
    OWNERS,
  );
  assert.deepEqual(actions.map((a) => [a.kind, a.repairId]), [['create', 3], ['create', 6]]);
  const create = actions[0] as Extract<RepairTaskAction, { kind: 'create' }>;
  assert.deepEqual(create.assigneeStaffIds, [1, 8, 2, 3]);
  assert.match(create.note, /^Bose Wave® music system REPAIR SERVICE — Pending Repair\nRepair ticket RS-0053/);
});

test('rerun: a repair that already owns a task is a no-op', () => {
  assert.deepEqual(planRepairTaskSync([repair()], [task()], OWNERS), []);
});

test('flip: the repair is marked Done → its open task closes', () => {
  const done = repair({ status: 'Done' });
  assert.deepEqual(planRepairTaskSync([done], [task({ status: 'IN_PROGRESS' })], OWNERS), [
    { kind: 'close', taskId: 900, repairId: 53, note: repairTaskNote(done) },
  ]);
});

test('flip: a signed pickup closes the task', () => {
  const picked = repair({ status: 'Repaired, Contact Customer', pickedUp: true });
  const [action] = planRepairTaskSync([picked], [task()], OWNERS);
  assert.equal(action.kind, 'close');
});

test('flip back: a repair returning to an open status reopens the task the sync closed', () => {
  const reopened = repair({ status: 'Pending Repair' });
  const closedNote = repairTaskNote(repair({ status: 'Done' }));
  assert.deepEqual(
    planRepairTaskSync([reopened], [task({ status: 'DONE', closedBySync: true, note: closedNote })], OWNERS),
    [{ kind: 'reopen', taskId: 900, repairId: 53, note: repairTaskNote(reopened) }],
  );
});

test('an operator who marked the task done while the repair is open is not overruled', () => {
  assert.deepEqual(planRepairTaskSync([repair()], [task({ status: 'DONE', closedBySync: false })], OWNERS), []);
});

test('a withdrawn (CANCELED) task stays withdrawn and is not re-created', () => {
  assert.deepEqual(planRepairTaskSync([repair()], [task({ status: 'CANCELED' })], OWNERS), []);
  assert.deepEqual(planRepairTaskSync([repair({ status: 'Done' })], [task({ status: 'CANCELED' })], OWNERS), []);
});

test('a status move rewrites the sync-owned note, never an operator-edited one', () => {
  const moved = repair({ status: 'Repaired, Contact Customer' });
  assert.deepEqual(planRepairTaskSync([moved], [task()], OWNERS), [
    { kind: 'refresh', taskId: 900, repairId: 53, note: repairTaskNote(moved) },
  ]);
  const edited = task({ note: `${repairTaskNote(repair())}\nCustomer called twice` });
  assert.equal(isSyncOwnedNote(edited.note, moved), false);
  assert.deepEqual(planRepairTaskSync([moved], [edited], OWNERS), []);
  // Closing still closes an operator-edited task; it just keeps their words.
  assert.deepEqual(planRepairTaskSync([repair({ status: 'Done' })], [edited], OWNERS), [
    { kind: 'close', taskId: 900, repairId: 53, note: null },
  ]);
});

test('two tasks on one repair: the oldest is the repair’s, the other is left alone', () => {
  const actions = planRepairTaskSync([repair({ status: 'Done' })], [task({ taskId: 950 }), task({ taskId: 901 })], OWNERS);
  assert.deepEqual(actions.map((a) => a.kind === 'create' ? null : a.taskId), [901]);
});

test('no owners configured: nothing is imported', () => {
  assert.deepEqual(planRepairTaskSync([repair()], [], []), []);
});

test('run: dry-run counts the plan without writing; apply counts refusals as failed and carries on', async () => {
  const writes: string[] = [];
  const deps = (refuse: number | null) => ({
    listRepairs: async () => [repair({ id: 1 }), repair({ id: 2 }), repair({ id: 53, status: 'Done' })],
    listRepairTasks: async () => [task()],
    createTask: async (a: Extract<RepairTaskAction, { kind: 'create' }>) => {
      writes.push(`create:${a.repairId}`);
      return a.repairId !== refuse;
    },
    updateTask: async (a: Exclude<RepairTaskAction, { kind: 'create' } | { kind: 'linkTicket' }>) => {
      writes.push(`${a.kind}:${a.taskId}`);
      return true;
    },
    linkTicket: async (a: Extract<RepairTaskAction, { kind: 'linkTicket' }>) => {
      writes.push(`linkTicket:${a.taskId}:${a.ticketNumber}`);
      return true;
    },
  });

  const dry = await runRepairTaskSync(OWNERS, deps(null), { dryRun: true });
  assert.deepEqual(dry.summary, { repairs: 3, created: 2, closed: 1, reopened: 0, refreshed: 0, ticketLinked: 0, failed: 0 });
  assert.deepEqual(writes, []);

  const applied = await runRepairTaskSync(OWNERS, deps(2));
  assert.deepEqual(applied.summary, { repairs: 3, created: 1, closed: 1, reopened: 0, refreshed: 0, ticketLinked: 0, failed: 1 });
  assert.deepEqual(writes, ['create:1', 'create:2', 'close:900']);
});

test('a paperwork number that is a real helpdesk thread is linked once, never for a withdrawn task', () => {
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [task()], OWNERS), [
    { kind: 'linkTicket', taskId: 900, repairId: 53, ticketNumber: '10089' },
  ]);
  // Already linked, or the number matches no helpdesk thread: nothing to do.
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [task({ hasTicketLink: true })], OWNERS), []);
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: 'RS-0053' })], [task()], OWNERS), []);
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [task({ status: 'CANCELED' })], OWNERS), []);
  // A fresh create carries the number so the link lands with the task.
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [], OWNERS), [
    { kind: 'create', repairId: 53, note: repairTaskNote(repair({ ticketNumber: '10089' })), assigneeStaffIds: OWNERS, ticketNumber: '10089' },
  ]);
});
