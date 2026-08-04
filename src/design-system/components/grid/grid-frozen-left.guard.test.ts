/**
 * Cross-family guard for the frozen-pane sticky offset.
 *
 * `gridFrozenLeft` emits a CSS `calc()`. Two things about it are easy to get
 * wrong by hand, and both shipped:
 *
 *  1. **The width fallback must be a LENGTH.** Ten surfaces each carried a
 *     byte-identical copy that pushed `var(--cf-col-KEY, ${col.width})`, and
 *     `col.width` is the grid-track string `minmax(2rem, 2rem)`. `minmax()` is
 *     a grid-track function and is illegal inside `calc()`, so the whole value
 *     was invalid and `left` computed to `auto` — the frozen pane silently did
 *     not pin at all, on every family. It was invisible in review because a
 *     staffer who had drag-resized the preceding column set the var to a real
 *     px value, which made it work for exactly the person testing it. Measured
 *     in Chrome (16px root): the emitted expression resolved to `auto`, the
 *     same one with rem fallbacks to `116px`.
 *
 *  2. **The pane must be the SURFACE's own.** Four layouts aliased the
 *     orders-queue copy, whose closure sums `ORDERS_QUEUE_COLUMNS`, so grids
 *     freezing `select · title` were offset by Orders' `order` track.
 *
 * Neither is visible to a type checker: both produce a well-typed string.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridFrozenLeft } from './grid-column-geometry';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { INCOMING_GRID_COLUMNS } from '@/lib/receiving/incoming-grid-layout';
import { ORDERS_QUEUE_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { CATALOG_GRID_COLUMNS } from '@/lib/products/catalog-grid-layout';
import { PICKUP_GRID_COLUMNS } from '@/components/receiving/pickup/grid/pickup-grid-layout';
import { REPAIR_GRID_COLUMNS } from '@/lib/repair/repair-grid-layout';
import { WARRANTY_GRID_COLUMNS } from '@/components/warranty/grid/warranty-grid-layout';
import { READY_GRID_COLUMNS } from '@/components/outbound/ready/grid/ready-grid-layout';
import { TRACKING_EXCEPTIONS_GRID_COLUMNS } from '@/components/tracking-exceptions/grid/tracking-exceptions-grid-layout';
import { UNFOUND_GRID_COLUMNS } from '@/components/receiving/unfound/grid/unfound-grid-layout';
import { BINS_GRID_COLUMNS } from '@/components/warehouse/bins-grid/bins-grid-layout';
import { MY_DAY_GRID_COLUMNS } from '@/lib/my-day/my-day-grid-layout';
import { CATALOG_LINK_GRID_COLUMNS } from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import { IMPORT_EXCEPTION_GRID_COLUMNS } from '@/features/review/catalog-link/grid/import-exception-grid-layout';

const FAMILIES = {
  receiving: RECEIVING_GRID_COLUMNS,
  incoming: INCOMING_GRID_COLUMNS,
  orders: ORDERS_QUEUE_COLUMNS,
  catalog: CATALOG_GRID_COLUMNS,
  pickup: PICKUP_GRID_COLUMNS,
  repair: REPAIR_GRID_COLUMNS,
  warranty: WARRANTY_GRID_COLUMNS,
  ready: READY_GRID_COLUMNS,
  'tracking-exceptions': TRACKING_EXCEPTIONS_GRID_COLUMNS,
  unfound: UNFOUND_GRID_COLUMNS,
  bins: BINS_GRID_COLUMNS,
  'my-day': MY_DAY_GRID_COLUMNS,
  'catalog-link': CATALOG_LINK_GRID_COLUMNS,
  'import-exception': IMPORT_EXCEPTION_GRID_COLUMNS,
} as const;

describe('grid frozen-pane sticky offset', () => {
  for (const [name, columns] of Object.entries(FAMILIES)) {
    it(`${name}: every frozen offset is a valid calc() — no grid-track function`, () => {
      for (const col of columns.filter((c) => c.frozen)) {
        const left = gridFrozenLeft(columns, col.key);
        assert.ok(
          !left.includes('minmax('),
          `${name}.${col.key} → ${left}\n` +
            'minmax() is illegal inside calc(); the whole declaration is dropped and ' +
            'the cell computes left:auto, so the pane does not pin.',
        );
        // Every var() fallback must be a bare length.
        for (const [, fallback] of left.matchAll(/var\(--cf-col-[\w-]+,\s*([^)]*)\)/g)) {
          assert.match(
            fallback.trim(),
            /^[\d.]+(rem|px)$/,
            `${name}.${col.key} fallback "${fallback}" is not a length`,
          );
        }
      }
    });

    it(`${name}: offsets sum only the frozen columns BEFORE the cell`, () => {
      const frozen = columns.filter((c) => c.frozen).map((c) => c.key);
      frozen.forEach((key, i) => {
        const left = gridFrozenLeft(columns, key);
        const vars = [...left.matchAll(/var\((--cf-col-[\w-]+)/g)].map((m) => m[1]);
        assert.deepEqual(
          vars,
          frozen.slice(0, i).map((k) => `--cf-col-${k}`),
          `${name}.${key} must offset by exactly its predecessors, in order`,
        );
      });
    });

    it(`${name}: the leading frozen cell is offset by the row inset alone`, () => {
      const first = columns.find((c) => c.frozen);
      assert.ok(first, `${name} declares no frozen pane`);
      assert.equal(
        gridFrozenLeft(columns, first.key),
        'calc(var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1))))',
      );
    });
  }

  it('a surface never inherits another surface\'s pane', () => {
    // Orders freezes a third track (`order`); receiving's title must not be
    // offset by it. This is the exact defect the four aliases shipped.
    const ordersTitle = gridFrozenLeft(ORDERS_QUEUE_COLUMNS, 'title');
    const receivingTitle = gridFrozenLeft(RECEIVING_GRID_COLUMNS, 'title');
    assert.ok(ordersTitle.includes('--cf-col-order'), 'orders pins order before title');
    assert.notEqual(
      receivingTitle,
      ordersTitle,
      'receiving must not reuse the orders-queue offset expression',
    );
  });
});
