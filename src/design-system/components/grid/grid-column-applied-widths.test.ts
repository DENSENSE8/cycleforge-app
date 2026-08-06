/**
 * Guard: locked / retired column width prefs must not paint `--cf-col-*`.
 *
 *   npx tsx --test src/design-system/components/grid/grid-column-applied-widths.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ORDERS_QUEUE_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import {
  clampPersistedGridColumnWidths,
  filterAppliedGridColumnWidths,
  gridColumnWidthVars,
} from './grid-column-applied-widths';
import { gridColumnTrackRem } from './grid-column-geometry';

describe('filterAppliedGridColumnWidths', () => {
  it('drops locked receiving tracks; keeps resizable Product (stale date prefs die)', () => {
    const stale = {
      date: 192, // old 12rem stamp
      order: 160,
      title: 400,
      platform: 64, // retired column
    };
    const applied = filterAppliedGridColumnWidths(stale, RECEIVING_GRID_COLUMNS);
    assert.deepEqual(applied, { title: 400 });
    const date = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'date')!;
    assert.equal(gridColumnTrackRem(date), 4.5);
  });

  it('orders queue: retired + locked prefs stay inert; only Product paints', () => {
    const stale = {
      date: 80,
      condition: 80,
      sla: 120,
      age: 80,
      title: 400,
      order: 160,
    };
    const applied = filterAppliedGridColumnWidths(stale, ORDERS_QUEUE_COLUMNS);
    assert.deepEqual(applied, { title: 400 });
  });

  it('keeps only resizable live keys', () => {
    const columns = [
      { key: 'select', resizable: false },
      { key: 'title', type: 'text', resizable: true },
      { key: 'qty', type: 'number' },
    ] as const;
    const applied = filterAppliedGridColumnWidths(
      { select: 40, title: 320, qty: 80, gone: 99 },
      columns,
    );
    assert.deepEqual(applied, { title: 320 });
  });

  it('gridColumnWidthVars emits --cf-col-* only for applied keys', () => {
    const vars = gridColumnWidthVars({ title: 320 }) as Record<string, string>;
    assert.equal(vars['--cf-col-title'], '320px');
    assert.equal(vars['--cf-col-date'], undefined);
  });
});

describe('clampPersistedGridColumnWidths', () => {
  it('raises a stale pref below the typed Product floor', () => {
    const title = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    // Product floor is 8rem → 128px at root 16.
    const clamped = clampPersistedGridColumnWidths(
      { title: 80 },
      [title],
      {},
    );
    assert.equal(clamped.title, 128);
  });

  it('honors staff min/max on load', () => {
    const title = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    const clamped = clampPersistedGridColumnWidths(
      { title: 900 },
      [title],
      { title: { max: 400 } },
    );
    assert.equal(clamped.title, 400);
  });
});
