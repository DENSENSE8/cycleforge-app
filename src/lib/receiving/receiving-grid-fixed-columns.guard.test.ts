/**
 * Unbox History / Receiving — deterministic fact tracks stay FIXED; Product
 * (flex) and Status are drag-resizable (2026-08-06). Zoom scales rem floors via
 * density.
 *
 *   npx tsx --test src/lib/receiving/receiving-grid-fixed-columns.guard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isGridColumnResizable } from '@/design-system/components/grid/grid-column-editability';
import { RECEIVING_GRID_COLUMNS } from './receiving-grid-layout';

const FIXED_FACT_KEYS = [
  'select',
  'order',
  'date',
  'status',
  'qty',
  'price',
  'condition',
  'location',
  'tracking',
  'serial',
  'zoho',
] as const;

// Product (flex) + Status expose a drag-resize grip (2026-08-06); every other
// fact track stays locked.
const RESIZABLE_KEYS = new Set(['title', 'status']);

describe('RECEIVING_GRID_COLUMNS — fixed facts · resizable Product + Status', () => {
  it('only Product and Status are resizable', () => {
    for (const col of RECEIVING_GRID_COLUMNS) {
      if (RESIZABLE_KEYS.has(col.key)) {
        assert.equal(col.resizable, true, `${col.key} must allow drag-resize`);
        assert.equal(isGridColumnResizable(col), true);
        continue;
      }
      assert.equal(
        col.resizable,
        false,
        `${col.key} must stay locked (deterministic fact track)`,
      );
      assert.equal(
        isGridColumnResizable(col),
        false,
        `${col.key} must not expose a drag-resize grip`,
      );
    }
  });

  it('fact tracks are content-hard minmax(X,X); Product flexes', () => {
    for (const col of RECEIVING_GRID_COLUMNS) {
      if (col.key === 'title') {
        assert.match(col.width, /1fr/, 'Product absorbs leftover sheet width');
        continue;
      }
      assert.match(
        col.width,
        /^minmax\(([\d.]+)rem,\s*\1rem\)$/,
        `${col.key} must be content-hard minmax(X,X), got ${col.width}`,
      );
    }
    for (const key of FIXED_FACT_KEYS) {
      assert.ok(
        RECEIVING_GRID_COLUMNS.some((c) => c.key === key),
        `missing fixed fact ${key}`,
      );
    }
  });

  it('order / tracking / serial start; date / qty / price end (strict alignment)', () => {
    const startKeys = ['order', 'title', 'status', 'location', 'tracking', 'serial'] as const;
    for (const key of startKeys) {
      const col = RECEIVING_GRID_COLUMNS.find((c) => c.key === key);
      assert.ok(col, key);
      assert.equal(col!.align, 'start', `${key} must be start (text/ID)`);
    }
    for (const key of ['date', 'qty', 'price'] as const) {
      const col = RECEIVING_GRID_COLUMNS.find((c) => c.key === key);
      assert.ok(col, key);
      assert.equal(col!.align, 'end', `${key} must be end (number/date)`);
    }
  });
});
