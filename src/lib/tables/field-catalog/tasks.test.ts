/** Tasks catalog guards + resolver behaviour — the `work_assignments` family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { dataTableCompoundColumnsFor } from '@/components/tables/compound/data-table-compound-columns';
import { TASKS_COMPOUND_COLUMNS } from '@/features/tasks/grid/tasks-table-definition';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { DAILY_FIELD_CATALOG } from './daily';
import { TASKS_FAMILY, TASKS_FIELD_CATALOG, TASKS_PRODUCT_LAYOUT } from './tasks';
import { resolveTasksSlotValue, tasksSlotValuesFor } from './tasks-resolve';


function row(overrides: Partial<TaskDeskRow> = {}): TaskDeskRow {
  return {
    id: 19,
    entityType: 'receiving',
    entityId: 4412,
    note: 'Reconcile the returns shelf',
    status: 'OPEN',
    priority: 100,
    urgency: 'normal',
    assignee: { id: 7, name: 'Dana Reyes' },
    assignedBy: { id: 3, name: 'Sam Okafor' },
    assignedAtMs: Date.parse('2026-09-01T17:00:00.000Z'),
    startedAtMs: null,
    deadlineAtMs: Date.parse('2026-09-05T17:00:00.000Z'),
    completedAtMs: null,
    ticket: null,
    ...overrides,
  };
}

describe('tasks catalog', () => {
  it('has unique ids, all tasks-family, each bindable somewhere', () => {
    const ids = TASKS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of TASKS_FIELD_CATALOG) {
      assert.equal(field.family, 'tasks', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('tasks.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares NO field id with daily, though the two look alike', () => {
    const daily = new Set(DAILY_FIELD_CATALOG.map((f) => f.id));
    for (const field of TASKS_FIELD_CATALOG) {
      assert.ok(!daily.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('a person is never bindable into IDENTITY — the identity-purity law', () => {
    for (const id of ['tasks.assignee', 'tasks.assignedBy']) {
      const field = TASKS_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field, `${id} missing`);
      assert.ok(
        !field.slotKinds.includes('identity'),
        `${id} may not occupy column one — it carries a person's name`,
      );
    }
  });

  it('product default parses against the catalog — compound morph, NOTHING bound', () => {
    const parsed = TASKS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'tasks.task');
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
  });

  it('names no lateness fact — the shared clock owns that, on the state cell', () => {
    const ids = TASKS_FIELD_CATALOG.map((f) => f.id);
    assert.ok(!ids.includes('tasks.overdue'));
    assert.ok(!ids.includes('tasks.late'));
  });

  it('every chrome binding names a real catalog field', () => {
    for (const [key, binding] of Object.entries(TASKS_FAMILY.chrome ?? {})) {
      const fieldId = (binding as { field?: string }).field;
      if (!fieldId) continue;
      assert.ok(
        TASKS_FIELD_CATALOG.some((f) => f.id === fieldId),
        `chrome.${key} binds ${fieldId}, which the catalog does not declare`,
      );
    }
  });
});

describe('the engine materialization', () => {
  it('the product default IS the shared compound skeleton, in order', () => {
    assert.deepEqual(
      TASKS_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
  });

  it('binding Assignee opens a status track after the state pill', () => {
    const columns = dataTableCompoundColumnsFor(TASKS_FAMILY, {
      ...TASKS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'tasks.assignee' }, { fieldId: 'tasks.deadline' }],
    });
    const keys = columns.map((c) => c.key);
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 3), ['state', 'status:1', 'status:2']);
    assert.equal(columns.find((c) => c.key === 'status:2')?.slotDisplayType, 'date');
  });
});

describe('resolveTasksSlotValue', () => {
  it('resolves each catalog field off the view-model row', () => {
    const r = row();
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.task'), { kind: 'value', text: '#19' });
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.status'), { kind: 'value', text: 'To do' });
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.priority'), { kind: 'value', text: 'Normal' });
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.assignee'), {
      kind: 'value',
      text: 'Dana Reyes',
    });
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.record'), {
      kind: 'value',
      text: 'Carton 4412',
    });
    assert.ok((resolveTasksSlotValue(r, 'tasks.deadline') as { text: string | null }).text);
  });

  it('urgency reads off the stored int, through one threshold', () => {
    assert.deepEqual(resolveTasksSlotValue(row({ urgency: 'urgent', priority: 10 }), 'tasks.priority'), {
      kind: 'value',
      text: 'Urgent',
    });
  });

  it('an unbackfilled assigner is a dash, never the reader', () => {
    assert.deepEqual(resolveTasksSlotValue(row({ assignedBy: null }), 'tasks.assignedBy'), {
      kind: 'value',
      text: null,
    });
  });

  it('a task about an order has no ticket — a dash, not its record handle', () => {
    assert.deepEqual(
      resolveTasksSlotValue(row({ entityType: 'order', entityId: 8101 }), 'tasks.ticket'),
      { kind: 'value', text: null },
    );
    assert.deepEqual(
      resolveTasksSlotValue(row({ entityType: 'order', entityId: 8101 }), 'tasks.record'),
      { kind: 'value', text: 'Order 8101' },
    );
  });

  it('a ticket with no cached subject falls back to its handle, never blank', () => {
    const r = row({
      entityType: 'support_ticket',
      entityId: 77,
      ticket: { id: 77, provider: 'zendesk', subject: null, status: 'open', externalId: '9001' },
    });
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.ticket'), { kind: 'value', text: '#77' });
  });

  it('a task nobody has started or finished resolves those dates to null', () => {
    const bare = row({ startedAtMs: null, completedAtMs: null, deadlineAtMs: null });
    assert.deepEqual(resolveTasksSlotValue(bare, 'tasks.start'), { kind: 'value', text: null });
    assert.deepEqual(resolveTasksSlotValue(bare, 'tasks.completed'), { kind: 'value', text: null });
    assert.deepEqual(resolveTasksSlotValue(bare, 'tasks.deadline'), { kind: 'value', text: null });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveTasksSlotValue(row(), 'tasks.ghost'), null);
  });
});

describe('tasksSlotValuesFor', () => {
  it('keys resolved values by TRACK key', () => {
    const columns = dataTableCompoundColumnsFor(TASKS_FAMILY, {
      ...TASKS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'tasks.priority' }],
    });
    assert.deepEqual(tasksSlotValuesFor(row(), columns), {
      // The identity chrome track binds `tasks.task` through the family
      // record, so it resolves on every mount — that IS the `Id` column.
      fulfillment: { kind: 'value', text: '#19' },
      'status:1': { kind: 'value', text: 'Normal' },
    });
  });

  it('the product default resolves the identity track and nothing else', () => {
    assert.deepEqual(tasksSlotValuesFor(row(), TASKS_COMPOUND_COLUMNS), {
      fulfillment: { kind: 'value', text: '#19' },
    });
  });
});
