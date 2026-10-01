/** Completed-tasks catalog guards, materialization, resolver and adapter. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dataTableCompoundColumnsFor, dataTableCompoundSortFactFor } from '@/components/tables/compound/data-table-compound-columns';
import { reportTasksCompoundView } from '@/components/reports/report-tasks-grid/report-tasks-row-view';
import { parseTaskDeskReportRows } from '@/lib/reports/report-tasks-feed';
import { TASK_PRIORITY } from '@/lib/tasks/task-vocabulary';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import {
  REPORT_TASKS_FAMILY,
  REPORT_TASKS_FIELD_CATALOG,
  REPORT_TASKS_PRODUCT_LAYOUT,
} from './report-tasks';
import { resolveReportTasksSlotValue } from './report-tasks-resolve';

import { MAX_DEFAULT_VISIBLE_TRACKS } from '../table-definition';

/** The skeleton's six non-gutter chrome tracks leave this many status slots. */
const STATUS_SLOT_BUDGET = MAX_DEFAULT_VISIBLE_TRACKS - 6;

const DEADLINE_MS = Date.parse('2026-09-18T17:00:00.000Z');

function row(overrides: Partial<TaskDeskRow> = {}): TaskDeskRow {
  return {
    id: 4120,
    entityType: 'support_ticket',
    entityId: 77,
    note: 'Refund the second label',
    projectName: null,
    status: 'DONE',
    priority: TASK_PRIORITY.normal,
    urgency: 'normal',
    assignee: { id: 9, name: 'Dana' },
    assignees: [{ id: 9, name: 'Dana' }],
    assignedBy: { id: 3, name: 'Milo' },
    assignedAtMs: Date.parse('2026-09-15T15:00:00.000Z'),
    startedAtMs: null,
    deadlineAtMs: DEADLINE_MS,
    completedAtMs: Date.parse('2026-09-18T16:00:00.000Z'),
    remindAtMs: null,
    lastFollowUpAtMs: null,
    nextFollowUpAtMs: null,
    ticket: {
      id: 77,
      provider: 'zendesk',
      subject: 'Label printed twice',
      status: 'solved',
      externalId: '10577',
    },
    links: [],
    photoCount: 0,
    videoCount: 0,
    coverPhotoId: null,
    docCount: 0,
    ...overrides,
  };
}

describe('report-tasks catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = REPORT_TASKS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of REPORT_TASKS_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'report-tasks', `${field.id} is not a task-report fact`);
      assert.ok(field.id.startsWith('report-tasks.'), `${field.id} is not qualified`);
    }
  });

  it('product default parses, and the ASSIGNMENT ID is the identity', () => {
    const parsed = REPORT_TASKS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    // Identity purity: neither person may occupy column one.
    assert.equal(parsed.identityFieldId, 'report-tasks.id');
    assert.equal(
      REPORT_TASKS_FIELD_CATALOG.find((f) => f.id === parsed.identityFieldId)?.displayType,
      'id',
    );
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['report-tasks.assignee', 'report-tasks.assigned_by', 'report-tasks.urgency'],
    );
    // A task has no money fact.
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('stays inside the status slots the whole skeleton leaves', () => {
    assert.ok(
      REPORT_TASKS_PRODUCT_LAYOUT.statusBindings.length <= STATUS_SLOT_BUDGET,
      'one more status binding fails parseTableDefinition at module load',
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      REPORT_TASKS_PRODUCT_LAYOUT.identityFieldId,
      ...REPORT_TASKS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
    ]);
    const unbound = REPORT_TASKS_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // Title, note line, the two DATES lines and the state pill paint these.
    assert.deepEqual(unbound, [
      'report-tasks.note',
      'report-tasks.record',
      'report-tasks.completed',
      'report-tasks.deadline',
      'report-tasks.status',
    ]);
    for (const id of unbound) {
      const field = REPORT_TASKS_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('report-tasks materialization', () => {
  const columns = dataTableCompoundColumnsFor(REPORT_TASKS_FAMILY, REPORT_TASKS_PRODUCT_LAYOUT);
  const col = (key: string) => columns.find((c) => String(c.key) === key);

  it('gives every painted chrome header a live sort over the fact behind it', () => {
    assert.equal(dataTableCompoundSortFactFor(REPORT_TASKS_FAMILY, col('fulfillment')!), 'report-tasks.id');
    assert.equal(dataTableCompoundSortFactFor(REPORT_TASKS_FAMILY, col('item')!), 'report-tasks.note');
    assert.equal(
      dataTableCompoundSortFactFor(REPORT_TASKS_FAMILY, col('dates')!),
      'report-tasks.completed',
    );
    assert.equal(dataTableCompoundSortFactFor(REPORT_TASKS_FAMILY, col('state')!), 'report-tasks.status');
  });
});

describe('report-tasks resolver', () => {
  it('resolves both people as PERSON values, never as text', () => {
    assert.deepEqual(resolveReportTasksSlotValue(row(), 'report-tasks.assignee'), {
      kind: 'person',
      staffId: 9,
      name: 'Dana',
    });
    assert.deepEqual(resolveReportTasksSlotValue(row(), 'report-tasks.assigned_by'), {
      kind: 'person',
      staffId: 3,
      name: 'Milo',
    });
  });

  it('reads the urgency word off the STORED priority threshold', () => {
    assert.deepEqual(resolveReportTasksSlotValue(row({ urgency: 'urgent' }), 'report-tasks.urgency'), {
      kind: 'value',
      text: 'Urgent',
    });
    assert.deepEqual(resolveReportTasksSlotValue(row(), 'report-tasks.urgency'), {
      kind: 'value',
      text: 'Normal',
    });
  });

  it('resolves a missing deadline to blank TEXT, never to a stand-in day', () => {
    assert.deepEqual(
      resolveReportTasksSlotValue(row({ deadlineAtMs: null }), 'report-tasks.deadline'),
      { kind: 'value', text: null },
    );
  });

  it('names the linked record by the number the operator quotes, plus the subject', () => {
    // 10577 is `external_ticket_id` — the helpdesk number. 77 is the local
    // `support_tickets.id` the assignment is anchored to, which nobody quotes
    // and which means a DIFFERENT ticket to Zendesk.
    assert.deepEqual(resolveReportTasksSlotValue(row(), 'report-tasks.record'), {
      kind: 'value',
      text: 'Ticket 10577 · Label printed twice',
    });
  });

  it('paints the status word from workStatusLabel', () => {
    assert.deepEqual(resolveReportTasksSlotValue(row({ status: 'CANCELED' }), 'report-tasks.status'), {
      kind: 'value',
      text: 'Canceled',
    });
  });
});

describe('report-tasks row view', () => {
  it('measures lateness against the DEADLINE, not against now', () => {
    const late = reportTasksCompoundView(
      row({ completedAtMs: DEADLINE_MS + 3 * 86_400_000 }),
    );
    assert.equal(late.delay?.days, 3);
    assert.equal(late.delay?.overdue, true);
    // Finishing early is on time, never a negative age.
    const early = reportTasksCompoundView(row({ completedAtMs: DEADLINE_MS - 86_400_000 }));
    assert.equal(early.delay?.days, 0);
    assert.equal(early.delay?.overdue, false);
  });

  it('paints BOTH dates: when it landed over the day it was promised for', () => {
    const view = reportTasksCompoundView(row());
    assert.ok(view.orderedAt?.dateKey, 'the completion day seeds the Hash line');
    assert.ok(view.delay?.dateLabel, 'the deadline day seeds the Calendar line');
    assert.equal(reportTasksCompoundView(row({ deadlineAtMs: null })).delay, null);
  });

  it('carries the assignment id in column one, and no person', () => {
    const view = reportTasksCompoundView(row());
    assert.deepEqual(view.identityFace, { value: '4120', label: 'Task id' });
    assert.equal(view.orderId, null);
  });

  it('names a note-less task by its record, and does not repeat it below', () => {
    const view = reportTasksCompoundView(row({ note: '' }));
    assert.equal(view.title, 'Ticket 10577');
    assert.equal(view.note, null);
  });
});

describe('report-tasks feed', () => {
  const wire = (id: number, note: string, priority: number) => ({
    id,
    entityType: 'order',
    entityId: 54 + id,
    note,
    projectName: null,
    status: 'DONE',
    taskState: null,
    priority,
    assignee: null,
    assignees: [],
    assignedBy: null,
    assignedAt: '2026-09-15T15:00:00.000Z',
    startedAt: null,
    deadlineAt: null,
    completedAt: '2026-09-16T15:00:00.000Z',
    remindAt: null,
    lastFollowUpAt: null,
    nextFollowUpAt: null,
    ticket: null,
    links: [],
    photoCount: 0,
    videoCount: 0,
    coverPhotoId: null,
    docCount: 0,
  });

  it('narrows the wire envelope into desk-ordered rows', () => {
    const rows = parseTaskDeskReportRows({
      ok: true,
      count: 2,
      tasks: [wire(1, 'Normal', TASK_PRIORITY.normal), wire(2, 'Urgent', TASK_PRIORITY.urgent)],
    });
    // Desk order, from the shared comparator: urgent first.
    assert.deepEqual(rows.map((r) => r.id), [2, 1]);
    assert.equal(rows[0].urgency, 'urgent');
    assert.equal(rows[0].completedAtMs, Date.parse('2026-09-16T15:00:00.000Z'));
  });

  it('throws on a failed envelope rather than painting an empty report', () => {
    assert.throws(() => parseTaskDeskReportRows({ ok: false, error: 'nope', tasks: [] }), /nope/);
  });
});
