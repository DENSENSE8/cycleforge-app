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
  q: 9,
  mediaEntityType: 10,
  assignedBy: 11,
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
    project_name: null,
    assignees: [{ id: 9, name: 'Dana' }],
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
    remind_at: null,
    ticket_id: null,
    ticket_provider: null,
    ticket_subject: null,
    ticket_status: null,
    ticket_external_id: null,
    links: null,
    photo_count: '0',
    cover_photo_id: null,
    video_count: '0',
    doc_count: '0',
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

test('a search is not a page: `q` binds a pattern and opens the row window', async () => {
  // The defect this pins: a searching read that honoured the caller's `limit`
  // would answer "no match" for a task one row past that bound — the same lie
  // as the browser-side filter it replaced, one layer down.
  const searching = fakes();
  await listTaskDeskRows(ORG, { limit: 10, q: '  printer ' }, searching.deps);
  assert.equal(searching.calls[0].params[P.q], '%printer%');
  assert.equal(searching.calls[0].params[P.limit], TASK_DESK_MAX_LIMIT);

  // No text (and whitespace is no text) leaves the predicate standing down and
  // the caller's window intact.
  const plain = fakes();
  await listTaskDeskRows(ORG, { limit: 10, q: '   ' }, plain.deps);
  assert.equal(plain.calls[0].params[P.q], null);
  assert.equal(plain.calls[0].params[P.limit], 10);
});

test('the assignee filter is bound as an int, and absent means everyone', async () => {
  const mine = fakes();
  await listTaskDeskRows(ORG, { assigneeStaffId: 9 }, mine.deps);
  assert.equal(mine.calls[0].params[P.assignee], 9);

  const team = fakes();
  await listTaskDeskRows(ORG, { assigneeStaffId: null }, team.deps);
  assert.equal(team.calls[0].params[P.assignee], null);
});

test('the thrower filter is bound as an int, independent of the assignee filter', async () => {
  const handedOff = fakes();
  await listTaskDeskRows(ORG, { assigneeStaffId: null, assignedByStaffId: 7 }, handedOff.deps);
  assert.equal(handedOff.calls[0].params[P.assignedBy], 7);
  assert.equal(handedOff.calls[0].params[P.assignee], null);

  const plain = fakes();
  await listTaskDeskRows(ORG, { assigneeStaffId: 9 }, plain.deps);
  assert.equal(plain.calls[0].params[P.assignedBy], null);
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
  assert.deepEqual(row.assignees, [{ id: 9, name: 'Dana' }]);
  assert.deepEqual(row.assignedBy, { id: 7, name: 'Sam' });
  assert.deepEqual(row.ticket, {
    id: 77,
    provider: 'zendesk',
    subject: 'Broken hinge',
    status: 'open',
    externalId: 'ZD-501',
  });
});

test('one shared assignment maps once with its lead, secondary members and project', async () => {
  const { deps } = fakes([sqlRow({
    project_name: 'Returns launch',
    assignees: [{ id: 9, name: 'Dana' }, { id: 11, name: 'Lee' }],
  })]);
  const rows = await listTaskDeskRows(ORG, {}, deps);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].projectName, 'Returns launch');
  assert.deepEqual(rows[0].assignee, { id: 9, name: 'Dana' });
  assert.deepEqual(rows[0].assignees, [
    { id: 9, name: 'Dana' }, { id: 11, name: 'Lee' },
  ]);
});

test('link faces, media counts and the reminder fold into the wire row', async () => {
  const { deps } = fakes([
    sqlRow({
      remind_at: new Date('2026-09-26T15:30:00.000Z'),
      links: [
        { kind: 'order', label: '112-0000000-1' },
        // A discriminator the TS does not know yet is dropped, not guessed.
        { kind: null, label: 'mystery' },
        { kind: 'tracking', label: '1Z999AA10123456784' },
      ],
      photo_count: '3',
      cover_photo_id: '501',
      video_count: '1',
      doc_count: '2',
    }),
    sqlRow({ id: 12 }),
  ]);

  const [withMedia, bare] = await listTaskDeskRows(ORG, {}, deps);
  assert.equal(withMedia.remindAt, '2026-09-26T15:30:00.000Z');
  assert.deepEqual(withMedia.links, [
    { kind: 'order', label: '112-0000000-1' },
    { kind: 'tracking', label: '1Z999AA10123456784' },
  ]);
  assert.equal(withMedia.photoCount, 3);
  assert.equal(withMedia.coverPhotoId, 501);
  assert.equal(withMedia.videoCount, 1);
  assert.equal(withMedia.docCount, 2);

  assert.deepEqual(bare.links, [], 'no links is an empty list, not null');
  assert.equal(bare.coverPhotoId, null);
  assert.equal(bare.docCount, 0);
  assert.equal(bare.remindAt, null);
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
        const count = found ? (Array.isArray(params[1]) ? params[1].length : 1) : 0;
        return { rows: Array.from({ length: count }, () => ({ id: 1 })), rowCount: count };
      }
      if (/SELECT staff_id FROM work_assignment_assignees/.test(sql)) {
        return { rows: [{ staff_id: 9 }], rowCount: 1 };
      }
      if (/^\s*(UPDATE|DELETE|INSERT)/.test(sql)) return { rows: [{ id: 11 }], rowCount: 1 };
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
  assert.deepEqual(result.before, {
    status: 'OPEN', assigneeStaffId: 9, assigneeStaffIds: [9], projectName: null,
  });
  assert.deepEqual([...result.changed].sort(), ['deadlineAt', 'status']);
  assert.equal(result.task.id, 11);
});

test('a blank note clears the column; a real note is stored trimmed', async () => {
  const blank = txFakes();
  await patchTaskDeskRowInTx(ORG, 11, { note: '   ' }, blank.tx);
  const blankUpdate = blank.statements.find((s) => /^\s*UPDATE/.test(s.sql));
  assert.match(blankUpdate?.sql ?? '', /notes = \$3/);
  assert.equal(blankUpdate?.params[2], null);

  const real = txFakes();
  await patchTaskDeskRowInTx(ORG, 11, { note: '  call the carrier  ', remindAt: null }, real.tx);
  const realUpdate = real.statements.find((s) => /^\s*UPDATE/.test(s.sql));
  assert.equal(realUpdate?.params[2], 'call the carrier');
  assert.match(realUpdate?.sql ?? '', /remind_at = \$4::timestamptz/);
  assert.equal(realUpdate?.params[3], null, 'null clears the reminder');
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

test('replacing members keeps the first lead and writes one membership set inside the transaction', async () => {
  const { tx, statements } = txFakes({ read: [sqlRow({
    assignee_staff_id: 11,
    assignee_name: 'Lee',
    project_name: 'Launch B',
    assignees: [{ id: 11, name: 'Lee' }, { id: 12, name: 'Kai' }],
  })] });
  const result = await patchTaskDeskRowInTx(ORG, 11, {
    assigneeStaffIds: [11, 12], projectName: ' Launch B ',
  }, tx);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.task.assignee?.id, 11);
  assert.deepEqual(result.task.assignees.map(({ id }) => id), [11, 12]);
  assert.equal(result.task.projectName, 'Launch B');
  assert.deepEqual(result.before.assigneeStaffIds, [9]);
  const update = statements.find(({ sql }) => /^\s*UPDATE/.test(sql));
  assert.ok(update?.params.includes(11), 'lead moves with membership');
  assert.ok(statements.some(({ sql, params }) =>
    /^\s*INSERT INTO work_assignment_assignees/.test(sql) &&
    params[0] === ORG && params[1] === 11 &&
    Array.isArray(params[2]) && params[2].join(',') === '11,12'));
});

test('foreign or repeated replacement members refuse every write', async () => {
  for (const ids of [[11, 11], [], [11, 12]]) {
    const { tx, statements } = txFakes({ staffInOrg: ids.length !== 2 || ids[1] === 11 });
    const result = await patchTaskDeskRowInTx(ORG, 11, { assigneeStaffIds: ids }, tx);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'invalid_assignee');
    assert.equal(statements.some(({ sql }) => /^\s*(UPDATE|INSERT|DELETE)/.test(sql)), false);
  }
});

test('legacy single-assignee patch replaces the shared membership with one recipient', async () => {
  const { tx, statements } = txFakes({ read: [sqlRow({
    assignee_staff_id: 12, assignee_name: 'Kai',
    assignees: [{ id: 12, name: 'Kai' }],
  })] });
  const result = await patchTaskDeskRowInTx(ORG, 11, { assigneeStaffId: 12 }, tx);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.task.assignees, [{ id: 12, name: 'Kai' }]);
  assert.equal(result.task.assignee?.id, 12);
  const membershipWrite = statements.find(({ sql }) => /^\s*INSERT INTO work_assignment_assignees/.test(sql));
  assert.deepEqual(membershipWrite?.params, [ORG, 11, [12]]);
});
