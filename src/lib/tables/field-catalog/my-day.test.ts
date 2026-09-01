/**
 * My-Day catalog guards + resolver behaviour — wave 1.4's eighth family, and
 * the one the kill list called out for a `fieldsMenu: true` that was "leftover
 * column-display lip copy". It is honest now, and these are the guards behind
 * it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MY_DAY_SHEET_COLUMNS,
  myDaySheetColumnsFor,
  myDaySortFactFor,
} from '@/lib/my-day/my-day-grid-layout';
import type { MyDayTask } from '@/lib/my-day/my-day-tasks';
import { MY_DAY_FIELD_CATALOG, MY_DAY_PRODUCT_LAYOUT } from './my-day';
import { resolveMyDaySlotValue } from './my-day-resolve';
import { parseSlotLayout } from '../slot-layout';

function task(overrides: Partial<MyDayTask> = {}): MyDayTask {
  return {
    id: 'wo:8812',
    lane: 'do_next',
    title: 'Pack order 09-88231',
    subtitle: 'Bose Wave Radio IV',
    queueLabel: 'Orders',
    recordLabel: '09-88231-44120',
    href: '/shipping',
    status: 'IN_PROGRESS',
    deadlineAt: '2026-09-01T17:00:00.000Z',
    updatedAt: '2026-08-31T09:00:00.000Z',
    source: { kind: 'work_order', row: {} },
    ...overrides,
  } as MyDayTask;
}

describe('my-day catalog', () => {
  it('has unique ids, all my-day-family, each bindable somewhere', () => {
    const ids = MY_DAY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of MY_DAY_FIELD_CATALOG) {
      assert.equal(field.family, 'my-day', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('my-day.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the lean core view)', () => {
    const parsed = parseSlotLayout(MY_DAY_PRODUCT_LAYOUT, MY_DAY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'my-day.task');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'my-day.lane' },
      { fieldId: 'my-day.record' },
      { fieldId: 'my-day.due' },
    ]);
  });

  it('queue and status ship UNBOUND — each for its own stated reason', () => {
    const bound = new Set(MY_DAY_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId));
    for (const id of ['my-day.queue', 'my-day.status']) {
      assert.ok(MY_DAY_FIELD_CATALOG.some((f) => f.id === id), `${id} is offered`);
      assert.ok(!bound.has(id), `${id} is not bound by default`);
    }
  });
});

describe('myDaySheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's CORE view scan order", () => {
    assert.deepEqual(
      MY_DAY_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['task', null],
        ['status:1', 'my-day.lane'],
        ['status:2', 'my-day.record'],
        ['status:3', 'my-day.due'],
      ],
    );
  });

  it('sort facts: the structural task track keeps its own fact', () => {
    const byKey = new Map(MY_DAY_SHEET_COLUMNS.map((c) => [c.key, myDaySortFactFor(c)]));
    assert.equal(byKey.get('select'), null);
    assert.equal(byKey.get('task'), 'task');
    assert.equal(byKey.get('status:3'), 'my-day.due');
  });

  it('binding the optional facts opens tracks after the core ones', () => {
    const columns = myDaySheetColumnsFor({
      ...MY_DAY_PRODUCT_LAYOUT,
      statusBindings: [
        ...MY_DAY_PRODUCT_LAYOUT.statusBindings,
        { fieldId: 'my-day.queue' },
        { fieldId: 'my-day.status' },
      ],
    });
    assert.equal(columns.find((c) => c.key === 'status:4')?.fieldId, 'my-day.queue');
    assert.equal(columns.find((c) => c.key === 'status:5')?.fieldId, 'my-day.status');
  });
});

describe('resolveMyDaySlotValue', () => {
  it('resolves each catalog field off the normalized row', () => {
    const t = task();
    assert.deepEqual(resolveMyDaySlotValue(t, 'my-day.task'), { kind: 'value', text: 'wo:8812' });
    assert.deepEqual(resolveMyDaySlotValue(t, 'my-day.queue'), { kind: 'value', text: 'Orders' });
    assert.deepEqual(resolveMyDaySlotValue(t, 'my-day.record'), {
      kind: 'value',
      text: '09-88231-44120',
    });
    assert.deepEqual(resolveMyDaySlotValue(t, 'my-day.lane'), { kind: 'value', text: 'Do next' });
    assert.ok((resolveMyDaySlotValue(t, 'my-day.due') as { text: string | null }).text);
  });

  it('an interrupt has no status machine — a dash, not a borrowed work-order word', () => {
    assert.deepEqual(resolveMyDaySlotValue(task({ status: null }), 'my-day.status'), {
      kind: 'value',
      text: null,
    });
  });

  it('honest absence: no record and no deadline resolve null', () => {
    const bare = task({ recordLabel: null, deadlineAt: null });
    assert.deepEqual(resolveMyDaySlotValue(bare, 'my-day.record'), { kind: 'value', text: null });
    assert.deepEqual(resolveMyDaySlotValue(bare, 'my-day.due'), { kind: 'value', text: null });
  });

  it('a lane the registry does not know falls back to its raw code, never undefined', () => {
    const odd = task({ lane: 'brand_new_lane' } as Partial<MyDayTask>);
    assert.deepEqual(resolveMyDaySlotValue(odd, 'my-day.lane'), {
      kind: 'value',
      text: 'brand_new_lane',
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveMyDaySlotValue(task(), 'my-day.ghost'), null);
  });
});
