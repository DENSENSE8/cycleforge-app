/**
 * Orders / To Ship — deterministic fact tracks stay FIXED; Product alone is
 * resizable (hard width); trailing `_fill` absorbs leftover sheet width
 * (2026-08-05). Twin of receiving-grid-fixed-columns.guard.
 *
 *   npx tsx --test src/lib/orders-queue-fixed-columns.guard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isGridColumnFillTrack,
  isGridColumnResizable,
} from '@/design-system/components/grid/grid-column-editability';
import {
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_LOCKED_KEYS,
  ORDERS_QUEUE_RESIZABLE_KEYS,
  ORDERS_QUEUE_TESTED_COLUMNS,
} from './dashboard-order-row-layout';

describe('ORDERS_QUEUE_COLUMNS — fixed facts · resizable Product · trailing fill', () => {
  it('only Product is resizable', () => {
    for (const col of ORDERS_QUEUE_COLUMNS) {
      if (col.key === 'title') {
        assert.equal(col.resizable, true, 'title must allow drag-resize');
        assert.equal(isGridColumnResizable(col), true);
        continue;
      }
      assert.equal(
        col.resizable,
        false,
        `${col.key} must stay locked (deterministic fact track or fill)`,
      );
      assert.equal(
        isGridColumnResizable(col),
        false,
        `${col.key} must not expose a drag-resize grip`,
      );
    }
    assert.deepEqual([...ORDERS_QUEUE_RESIZABLE_KEYS], ['title']);
  });

  it('TESTED lane also locks every non-Product track', () => {
    for (const col of ORDERS_QUEUE_TESTED_COLUMNS) {
      if (col.key === 'title') {
        assert.equal(col.resizable, true);
        continue;
      }
      assert.equal(col.resizable, false, `${col.key} must stay locked on TESTED`);
    }
  });

  it('fact tracks are content-hard minmax(X,X); Product hard; _fill flexes', () => {
    for (const col of ORDERS_QUEUE_COLUMNS) {
      if (isGridColumnFillTrack(col)) {
        assert.match(col.width, /1fr/, '_fill absorbs leftover sheet width');
        continue;
      }
      if (col.key === 'title') {
        assert.match(
          col.width,
          /^minmax\(([\d.]+)rem,\s*\1rem\)$/,
          'Product must be hard minmax(X,X) so drag sets a real width',
        );
        continue;
      }
      assert.match(
        col.width,
        /^minmax\(([\d.]+)rem,\s*\1rem\)$/,
        `${col.key} must be content-hard minmax(X,X), got ${col.width}`,
      );
    }
  });

  it('locked pane is select · order · age · title (contiguous)', () => {
    assert.deepEqual([...ORDERS_QUEUE_LOCKED_KEYS], ['select', 'order', 'age', 'title']);
  });

  it('scan order is triage-first with trailing fill', () => {
    assert.deepEqual(
      ORDERS_QUEUE_COLUMNS.map((c) => c.key),
      [
        'select',
        'order',
        'age',
        'title',
        'condition',
        'qty',
        'tracking',
        'packStation',
        '_fill',
      ],
    );
  });
});
