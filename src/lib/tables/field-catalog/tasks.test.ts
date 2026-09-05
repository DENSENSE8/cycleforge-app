/**
 * Tasks catalog guards + resolver behaviour — wave 1.3's fourth family, and
 * Daily's sibling. The guard that matters most here is the one pinning that
 * they are two vocabularies: `staff_todos` is a staffer's own list,
 * `daily_check_items` is the org's shift checklist with a roster behind it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { StaffTaskRow } from '@/features/tasks/grid/staff-task-row';
import {
  TASKS_COMPOUND_COLUMNS,
  tasksCompoundColumnsFor,
} from '@/lib/staff-todos/tasks-grid-layout';
import { DAILY_FIELD_CATALOG } from './daily';
import { TASKS_FIELD_CATALOG, TASKS_PRODUCT_LAYOUT } from './tasks';
import { resolveTasksSlotValue, tasksSlotValuesFor } from './tasks-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<StaffTaskRow> = {}): StaffTaskRow {
  return {
    id: 19,
    text: 'Reconcile the returns shelf',
    kind: 'recurring',
    station: 'PACK',
    done: false,
    archived: false,
    resetsAtMs: Date.parse('2026-09-01T00:00:00.000Z'),
    intervalMs: 86_400_000,
    checkedAtMs: Date.parse('2026-08-30T17:20:00.000Z'),
    sortOrder: 3,
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

  it('product default parses against the catalog — compound morph, NOTHING bound', () => {
    const parsed = parseSlotLayout(TASKS_PRODUCT_LAYOUT, TASKS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'tasks.task');
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
  });

  it('names project, assignee, and due as bindable facts without a lateness column', () => {
    const ids = TASKS_FIELD_CATALOG.map((f) => f.id);
    assert.ok(ids.includes('tasks.project'));
    assert.ok(ids.includes('tasks.assignee'));
    assert.ok(ids.includes('tasks.due'));
    assert.ok(!ids.includes('tasks.overdue'));
    assert.ok(!ids.includes('tasks.late'));
  });
});

describe('tasksCompoundColumnsFor — the compound materialization', () => {
  it('the product default IS the shared compound skeleton, in order', () => {
    assert.deepEqual(
      TASKS_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
    assert.ok(TASKS_COMPOUND_COLUMNS.every((c) => c.fieldId === undefined));
  });

  it('binding Station opens the track the retired flat model spent a column on', () => {
    const columns = tasksCompoundColumnsFor({
      ...TASKS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'tasks.station' }, { fieldId: 'tasks.resets' }],
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ['select', 'fulfillment', 'thumb', 'item', 'dates', 'state', 'status:1', 'status:2', '_fill'],
    );
    assert.equal(columns.find((c) => c.key === 'status:2')?.slotDisplayType, 'date');
  });
});

describe('resolveTasksSlotValue', () => {
  it('resolves each catalog field off the view-model row', () => {
    const r = row();
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.task'), { kind: 'value', text: '#19' });
    assert.deepEqual(resolveTasksSlotValue(r, 'tasks.kind'), { kind: 'value', text: 'Recurring' });
    assert.equal(resolveTasksSlotValue(r, 'tasks.status')?.kind, 'value');
    assert.ok((resolveTasksSlotValue(r, 'tasks.station') as { text: string | null }).text);
    assert.ok((resolveTasksSlotValue(r, 'tasks.resets') as { text: string | null }).text);
  });

  it('a general task has no cycle to reset — a dash, not an invented date', () => {
    assert.deepEqual(
      resolveTasksSlotValue(row({ kind: 'general', resetsAtMs: null }), 'tasks.resets'),
      { kind: 'value', text: null },
    );
    assert.deepEqual(resolveTasksSlotValue(row({ kind: 'general' }), 'tasks.kind'), {
      kind: 'value',
      text: 'General',
    });
  });

  it('an archived row reads Deleted, not Open — history that reads open is a lie', () => {
    assert.deepEqual(resolveTasksSlotValue(row({ archived: true }), 'tasks.status'), {
      kind: 'value',
      text: 'Deleted',
    });
  });

  it('honest absence: no station and no check-off resolve to null', () => {
    const bare = row({ station: '', checkedAtMs: null });
    assert.deepEqual(resolveTasksSlotValue(bare, 'tasks.station'), { kind: 'value', text: null });
    assert.deepEqual(resolveTasksSlotValue(bare, 'tasks.checked'), { kind: 'value', text: null });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveTasksSlotValue(row(), 'tasks.ghost'), null);
  });
});

describe('tasksSlotValuesFor', () => {
  it('keys resolved values by TRACK key', () => {
    const columns = tasksCompoundColumnsFor({
      ...TASKS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'tasks.kind' }],
    });
    assert.deepEqual(tasksSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: 'Recurring' },
    });
  });

  it('the product default resolves no slots at all', () => {
    assert.equal(tasksSlotValuesFor(row(), TASKS_COMPOUND_COLUMNS), undefined);
  });
});
