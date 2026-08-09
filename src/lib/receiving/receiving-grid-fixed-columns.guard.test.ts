/**
 * Unbox History / Receiving — deterministic fact tracks stay FIXED; Product
 * (hard preferred) and Status are drag-resizable; trailing `_fill` owns the
 * sole `1fr` slack. Zoom scales rem floors via density.
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
  '_fill',
] as const;

// Product + Status expose a drag-resize grip; every other track stays locked.
const RESIZABLE_KEYS = new Set(['title', 'status']);

describe('RECEIVING_GRID_COLUMNS — fixed facts · resizable Product + Status · `_fill` slack', () => {
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

  it('fact tracks are content-hard minmax(X,X); `_fill` flexes; Product is hard', () => {
    for (const col of RECEIVING_GRID_COLUMNS) {
      if (col.key === '_fill') {
        assert.match(col.width, /1fr/, '_fill absorbs leftover sheet width');
        continue;
      }
      if (col.key === 'title') {
        assert.equal(col.width, 'minmax(16rem, 16rem)');
        assert.doesNotMatch(col.width, /1fr/, 'Product must not own the flex track');
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
