/**
 * DB-free tests for the task desk reader.
 * Run: npx tsx --test src/lib/tasks/list-tasks.test.ts
 *
 * The SQL string itself is deliberately NOT asserted — pinning it would make
 * every column rename a test edit. What is pinned is the contract a caller can
 * observe: which statuses a lane reads, which org the query is scoped to, what
 * the limit clamps to, and which rows are allowed out.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampTaskDeskLimit,
  isTaskDeskTransitionAllowed,
  listTaskDeskRows,
  patchTaskDeskRowInTx,
  TASK_DESK_DEFAULT_LIMIT,
  TASK_DESK_MAX_LIMIT,
  type TaskDeskDeps,
  type TaskDeskTx,
} from './list-tasks';
import { TASK_PRIORITY, TASK_WORK_TYPE } from './task-vocabulary';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const OTHER_ORG = '99999999-8888-7777-6666-555555555555' as OrgId;

/** Param slots of the one statement, named so a reorder fails loudly. */
const P = {
  org: 0,
  ticketEnum: 1,
  workType: 2,
  statuses: 3,
  assignee: 4,
  priorityAtMost: 5,
  priorityAbove: 6,
  taskId: 7,
  limit: 8,
} as const;

interface Captured {
  orgId: OrgId;
  sql: string;
  params: unknown[];
}

function fakes(rows: Array<Record<string, unknown>> = []) {
  const calls: Captured[] = [];
  const deps: TaskDeskDeps = {
    query: async (orgId, sql, params) => {
      calls.push({ orgId, sql, params });
      return { rows, rowCount: rows.length };
    },
  };
  return { deps, calls };
}

function sqlRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 11,
    entity_type: 'ORDER',
    entity_id: '4242',
    notes: 'check the serial',
    status: 'OPEN',
    priority: 100,
    assignee_staff_id: 9,
    assignee_name: 'Dana',
    assigned_by_staff_id: 7,
    assigned_by_name: 'Sam',
    assigned_at: new Date('2026-09-01T10:00:00.000Z'),
    started_at: null,
    deadline_at: null,
    completed_at: null,
    ticket_id: null,
    ticket_provider: null,
    ticket_subject: null,
    ticket_status: null,
    ticket_external_id: null,
    ...over,
  };
}

test('the default lane is `open`, and it reads exactly the three working statuses', async () => {
  const { deps, calls } = fakes();
  await listTaskDeskRows(ORG, {}, deps);

  assert.deepEqual(calls[0].params[P.statuses], ['OPEN', 'ASSIGNED', 'IN_PROGRESS']);
  assert.equal(calls[0].params[P.workType], TASK_WORK_TYPE);
});

test('lane → statuses: done reads DONE only, all reads every status', async () => {
  const done = fakes();
  await listTaskDeskRows(ORG, { lane: 'done' }, done.deps);
  assert.deepEqual(done.calls[0].params[P.statuses], ['DONE']);

  const all = fakes();
  await listTaskDeskRows(ORG, { lane: 'all' }, all.deps);
  assert.equal(
    all.calls[0].params[P.statuses],
    null,
    'the audit lane filters no status — including CANCELED',
  );
});

test('organizationId is threaded into the query, as both scope and parameter', async () => {
  const { deps, calls } = fakes();
  await listTaskDeskRows(ORG, {}, deps);

  assert.equal(calls[0].orgId, ORG, 'the GUC wrapper must be handed the caller org');
  assert.equal(calls[0].params[P.org], ORG, 'and the predicate must bind the same org');

  const other = fakes();
  await listTaskDeskRows(OTHER_ORG, {}, other.deps);
  assert.equal(other.calls[0].orgId, OTHER_ORG);
  assert.equal(other.calls[0].params[P.org], OTHER_ORG);
});

test('a row whose entity_type is outside the task vocabulary is dropped, not guessed', async () => {
  const { deps } = fakes([
    sqlRow({ id: 1, entity_type: 'ORDER' }),
    // A station work kind that a FOLLOW_UP row should never carry. Painting it
    // would give the desk an "open the record" href pointing nowhere.
    sqlRow({ id: 2, entity_type: 'FBA_SHIPMENT' }),
    sqlRow({ id: 3, entity_type: 'SUPPORT_TICKET' }),
  ]);

  const rows = await listTaskDeskRows(ORG, {}, deps);
  assert.deepEqual(
    rows.map((r) => r.id),
    [1, 3],
  );
  assert.deepEqual(
    rows.map((r) => r.entityType),
    ['order', 'support_ticket'],
  );
});

test('limit: defaults to 200, clamps to 500, and never asks for zero rows', async () => {
  assert.equal(clampTaskDeskLimit(undefined), TASK_DESK_DEFAULT_LIMIT);
  assert.equal(clampTaskDeskLimit(5000), TASK_DESK_MAX_LIMIT);
  assert.equal(clampTaskDeskLimit(0), 1);
  assert.equal(clampTaskDeskLimit(-3), 1);
  assert.equal(clampTaskDeskLimit(Number.NaN), TASK_DESK_DEFAULT_LIMIT);
  assert.equal(clampTaskDeskLimit(25), 25);

  const { deps, calls } = fakes();
  await listTaskDeskRows(ORG, { limit: 10_000 }, deps);
  assert.equal(calls[0].params[P.limit], TASK_DESK_MAX_LIMIT);
});

test('the assignee filter is bound as an int, and absent means everyone', async () => {
  const mine = fakes();
  await listTaskDeskRows(ORG, { assigneeStaffId: 9 }, mine.deps);
  assert.equal(mine.calls[0].params[P.assignee], 9);

  const team = fakes();
  await listTaskDeskRows(ORG, { assigneeStaffId: null }, team.deps);
  assert.equal(team.calls[0].params[P.assignee], null);
});

test('urgency maps onto the stored priority bounds, not a second column', async () => {
  const urgent = fakes();
  await listTaskDeskRows(ORG, { urgency: 'urgent' }, urgent.deps);
  assert.equal(urgent.calls[0].params[P.priorityAtMost], TASK_PRIORITY.urgent);
  assert.equal(urgent.calls[0].params[P.priorityAbove], null);

  const normal = fakes();
  await listTaskDeskRows(ORG, { urgency: 'normal' }, normal.deps);
  assert.equal(normal.calls[0].params[P.priorityAtMost], null);
  assert.equal(normal.calls[0].params[P.priorityAbove], TASK_PRIORITY.urgent);

  const both = fakes();
  await listTaskDeskRows(ORG, {}, both.deps);
  assert.equal(both.calls[0].params[P.priorityAtMost], null);
  assert.equal(both.calls[0].params[P.priorityAbove], null);
});

test('rows cross the wire as ISO strings, with the ticket folded in', async () => {
  const { deps } = fakes([
    sqlRow({
      entity_type: 'SUPPORT_TICKET',
      entity_id: '77',
      deadline_at: new Date('2026-09-30T17:00:00.000Z'),
      ticket_id: '77',
      ticket_provider: 'zendesk',
      ticket_subject: 'Broken hinge',
      ticket_status: 'open',
      ticket_external_id: 'ZD-501',
    }),
  ]);

  const [row] = await listTaskDeskRows(ORG, {}, deps);
  assert.equal(row.assignedAt, '2026-09-01T10:00:00.000Z');
  assert.equal(row.deadlineAt, '2026-09-30T17:00:00.000Z');
  assert.equal(row.startedAt, null);
  assert.equal(row.entityId, 77, 'bigint comes back as a string and must be numeric on the wire');
  assert.deepEqual(row.assignee, { id: 9, name: 'Dana' });
  assert.deepEqual(row.assignedBy, { id: 7, name: 'Sam' });
  assert.deepEqual(row.ticket, {
    id: 77,
    provider: 'zendesk',
    subject: 'Broken hinge',
    status: 'open',
    externalId: 'ZD-501',
  });
});

test('an unassigned task has no assignee rather than an invented one', async () => {
  const { deps } = fakes([sqlRow({ assignee_staff_id: null, assignee_name: null })]);
  const [row] = await listTaskDeskRows(ORG, {}, deps);
  assert.equal(row.assignee, null);
});

test('CANCELED is terminal; every other transition is reversible', () => {
  assert.equal(isTaskDeskTransitionAllowed('CANCELED', 'OPEN'), false);
  assert.equal(isTaskDeskTransitionAllowed('CANCELED', 'DONE'), false);
  assert.equal(isTaskDeskTransitionAllowed('CANCELED', 'CANCELED'), true);
  assert.equal(isTaskDeskTransitionAllowed('DONE', 'IN_PROGRESS'), true);
  assert.equal(isTaskDeskTransitionAllowed('OPEN', 'CANCELED'), true);
  assert.equal(isTaskDeskTransitionAllowed('IN_PROGRESS', 'DONE'), true);
});

// ── patch ───────────────────────────────────────────────────────────────────

interface TxScript {
  /** The pre-image row, or nothing for "no such task". */
  current?: Record<string, unknown> | null;
  /** Whether the assignee check finds the staffer in this org. */
  staffInOrg?: boolean;
  /** What the re-read returns. Defaults to one mappable row. */
  read?: Array<Record<string, unknown>>;
}

function txFakes(script: TxScript = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const tx: TaskDeskTx = {
    query: async (sql, params) => {
      statements.push({ sql, params });
      if (/FOR UPDATE/.test(sql)) {
        const current = script.current === undefined ? { status: 'OPEN', assignee_staff_id: 9 } : script.current;
        return { rows: current ? [current] : [], rowCount: current ? 1 : 0 };
      }
      if (/FROM staff/.test(sql)) {
        const found = script.staffInOrg !== false;
        return { rows: found ? [{ '?column?': 1 }] : [], rowCount: found ? 1 : 0 };
      }
      if (/^\s*UPDATE/.test(sql)) return { rows: [{ id: 11 }], rowCount: 1 };
      return { rows: script.read ?? [sqlRow()], rowCount: 1 };
    },
  };
  const updateSql = () => statements.find((s) => /^\s*UPDATE/.test(s.sql))?.sql ?? null;
  return { tx, statements, updateSql };
}

test('marking DONE stamps a completion instant; reopening clears it', async () => {
  const done = txFakes();
  const result = await patchTaskDeskRowInTx(ORG, 11, { status: 'DONE' }, done.tx);
  assert.equal(result.ok, true);
  assert.match(done.updateSql() ?? '', /completed_at = COALESCE\(completed_at, now\(\)\)/);

  const reopened = txFakes({ current: { status: 'DONE', assignee_staff_id: 9 } });
  await patchTaskDeskRowInTx(ORG, 11, { status: 'IN_PROGRESS' }, reopened.tx);
  assert.match(
    reopened.updateSql() ?? '',
    /completed_at = NULL/,
    'a task back in progress is not a completed task',
  );
});

test('one column is assigned once, even when the status and the body both move it', async () => {
  // Two `started_at =` clauses in one UPDATE is a Postgres error, not a
  // precedence puzzle — the explicit value has to win before the SQL is built.
  const { tx, updateSql } = txFakes();
  const result = await patchTaskDeskRowInTx(
    ORG,
    11,
    { status: 'IN_PROGRESS', startedAt: '2026-09-02T08:00:00.000Z' },
    tx,
  );
  assert.equal(result.ok, true);
  const sql = updateSql() ?? '';
  assert.equal(sql.match(/started_at =/g)?.length, 1);
  assert.doesNotMatch(sql, /started_at = COALESCE/, 'the explicit instant outranks the stamp');
});

test('a withdrawn task refuses a new status, and nothing is written', async () => {
  const { tx, updateSql } = txFakes({ current: { status: 'CANCELED', assignee_staff_id: 9 } });
  const result = await patchTaskDeskRowInTx(ORG, 11, { status: 'IN_PROGRESS' }, tx);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'illegal_transition');
  assert.equal(updateSql(), null);
});

test('an unknown id is not_found before any write', async () => {
  const { tx, updateSql } = txFakes({ current: null });
  const result = await patchTaskDeskRowInTx(ORG, 404, { status: 'DONE' }, tx);
  assert.equal(result.ok === false && result.reason, 'not_found');
  assert.equal(updateSql(), null);
});

test('handing a task to a staffer outside the org is refused, not written', async () => {
  const { tx, updateSql } = txFakes({ staffInOrg: false });
  const result = await patchTaskDeskRowInTx(ORG, 11, { assigneeStaffId: 4242 }, tx);
  assert.equal(result.ok === false && result.reason, 'invalid_assignee');
  assert.equal(updateSql(), null);
});

test('a successful patch reports the pre-image and which fields moved', async () => {
  // This is what makes "who moved this deadline" answerable — the audit row
  // needs the diff, not just the fact that an update happened.
  const { tx } = txFakes({ current: { status: 'OPEN', assignee_staff_id: 9 } });
  const result = await patchTaskDeskRowInTx(
    ORG,
    11,
    { status: 'DONE', deadlineAt: '2026-10-01T00:00:00.000Z' },
    tx,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.before, { status: 'OPEN', assigneeStaffId: 9 });
  assert.deepEqual([...result.changed].sort(), ['deadlineAt', 'status']);
  assert.equal(result.task.id, 11);
});

test('the patch re-reads through the list mapper, on the same connection', async () => {
  const { tx, statements } = txFakes();
  await patchTaskDeskRowInTx(ORG, 11, { priority: TASK_PRIORITY.urgent }, tx);

  const reread = statements[statements.length - 1];
  assert.match(reread.sql, /FROM work_assignments/);
  assert.equal(reread.params[P.org], ORG);
  assert.equal(reread.params[P.taskId], 11, 'the re-read is narrowed to the patched row');
  assert.equal(reread.params[P.statuses], null, 'and reads it in the all lane, whatever it became');
});
