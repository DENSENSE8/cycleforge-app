/**
 * Repair → task reconcile: one task per open repair, closed when the repair
 * ends, reopened only when the sync itself closed it, never re-imported.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isRepairOpen,
  isRepairOwnTicket,
  isSyncOwnedNote,
  paperworkTicketNumber,
  planRepairTaskSync,
  repairIdInTicketSubject,
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
    // Linked by default so each test pins one concern; the ticket tests below unlink it.
    hasTicketLink: true,
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
    updateTask: async (a: Exclude<RepairTaskAction, { kind: 'create' } | { kind: 'linkTicket' } | { kind: 'findTicket' }>) => {
      writes.push(`${a.kind}:${a.taskId}`);
      return true;
    },
    linkTicket: async (a: Extract<RepairTaskAction, { kind: 'linkTicket' }>) => {
      writes.push(`linkTicket:${a.taskId}:${a.ticketNumber}`);
      return true;
    },
    findTicket: async () => 'linked' as const,
  });

  const dry = await runRepairTaskSync(OWNERS, deps(null), { dryRun: true });
  assert.deepEqual(dry.summary, { repairs: 3, created: 2, closed: 1, reopened: 0, refreshed: 0, ticketLinked: 0, ticketUnmatched: 0, failed: 0 });
  assert.deepEqual(writes, []);

  const applied = await runRepairTaskSync(OWNERS, deps(2));
  assert.deepEqual(applied.summary, { repairs: 3, created: 1, closed: 1, reopened: 0, refreshed: 0, ticketLinked: 0, ticketUnmatched: 0, failed: 1 });
  assert.deepEqual(writes, ['create:1', 'create:2', 'close:900']);
});

test('a mirrored paperwork number is linked once, never for a withdrawn task', () => {
  const unlinked = task({ hasTicketLink: false });
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [unlinked], OWNERS), [
    { kind: 'linkTicket', taskId: 900, repairId: 53, ticketNumber: '10089' },
  ]);
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [task()], OWNERS), []);
  assert.deepEqual(
    planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [task({ hasTicketLink: false, status: 'CANCELED' })], OWNERS),
    [],
  );
  // A fresh create carries the number so the link lands with the task.
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '10089', helpdeskTicketNumber: '10089' })], [], OWNERS), [
    { kind: 'create', repairId: 53, note: repairTaskNote(repair({ ticketNumber: '10089' })), assigneeStaffIds: OWNERS, ticketNumber: '10089' },
  ]);
});

test('an unmirrored open repair asks the helpdesk live — with the slip number when it is one; a closed repair never does', () => {
  const unlinked = task({ hasTicketLink: false });
  // RS-77's slip says #9431, a Zendesk number the mirror had never seen (the Ticket tab read "not linked").
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '#9431' })], [unlinked], OWNERS), [
    { kind: 'findTicket', taskId: 900, repairId: 53, paperworkNumber: 9431 },
  ]);
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: 'RS-0053' })], [unlinked], OWNERS), [
    { kind: 'findTicket', taskId: 900, repairId: 53, paperworkNumber: null },
  ]);
  assert.deepEqual(planRepairTaskSync([repair({ ticketNumber: '#9431', status: 'Done' })], [task({ hasTicketLink: false, status: 'DONE' })], OWNERS), []);
});

test('slip numbers: only a bare or #-led number is a helpdesk number', () => {
  assert.equal(paperworkTicketNumber('#9431'), 9431);
  assert.equal(paperworkTicketNumber(' 10089 '), 10089);
  assert.equal(paperworkTicketNumber('RS-0053'), null);
  assert.equal(paperworkTicketNumber('NA'), null);
  assert.equal(paperworkTicketNumber(null), null);
});

test('a helpdesk ticket is the repair’s own only when its subject proves it', () => {
  // Real subjects (Zendesk, 2026-10-03).
  assert.equal(repairIdInTicketSubject('Repair RS 77: Walk-in Royce Ann Young - 949-646-4990'), 77);
  assert.equal(repairIdInTicketSubject('RS-4894 — REPAIR SERVICE  for Bose Wave® music system IV'), 4894);
  assert.equal(repairIdInTicketSubject('RS-0053 follow-up'), 53);
  // The product word "REPAIRS"/"REPAIR SERVICE" is not an RS id.
  assert.equal(repairIdInTicketSubject('REPAIR SERVICE for Bose Wave Radio'), null);

  assert.equal(isRepairOwnTicket(77, 'Repair RS 77: Walk-in Royce Ann Young'), true);
  assert.equal(isRepairOwnTicket(77, 'Repair RS 770: Walk-in someone else'), false);
  assert.equal(isRepairOwnTicket(77, 'Repair RS 78: Walk-in Mike Dunphy'), false);
  // An older slip whose subject predates the RS id (RS-3 → #8192) is still a repair intake.
  assert.equal(isRepairOwnTicket(3, 'Repair: Walk-in Allan Hinton - 760-518-1504'), true);
  // A stale in-store number that lands on an unrelated helpdesk ticket is never linked.
  assert.equal(isRepairOwnTicket(3, 'Where is my order #4412?'), false);
  assert.equal(isRepairOwnTicket(3, null), false);
});

test('run: an unproven helpdesk thread is counted unmatched, not failed; an unreachable helpdesk is a failure', async () => {
  const deps = (found: () => Promise<'linked' | 'unmatched' | 'refused'>) => ({
    listRepairs: async () => [repair({ ticketNumber: '#9431' })],
    listRepairTasks: async () => [task({ hasTicketLink: false })],
    createTask: async () => true,
    updateTask: async () => true,
    linkTicket: async () => true,
    findTicket: found,
  });
  const base = { repairs: 1, created: 0, closed: 0, reopened: 0, refreshed: 0 };
  assert.deepEqual((await runRepairTaskSync(OWNERS, deps(async () => 'linked'))).summary, { ...base, ticketLinked: 1, ticketUnmatched: 0, failed: 0 });
  assert.deepEqual((await runRepairTaskSync(OWNERS, deps(async () => 'unmatched'))).summary, { ...base, ticketLinked: 0, ticketUnmatched: 1, failed: 0 });
  assert.deepEqual((await runRepairTaskSync(OWNERS, deps(async () => { throw new Error('zendesk 503'); }))).summary, { ...base, ticketLinked: 0, ticketUnmatched: 0, failed: 1 });
});
