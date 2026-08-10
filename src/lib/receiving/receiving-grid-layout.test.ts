import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECEIVING_GRID_COLUMNS,
  RECEIVING_GRID_FROZEN_EDGE_KEY,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  receivingGridTemplate,
} from '@/lib/receiving/receiving-grid-layout';

describe('RECEIVING_GRID_COLUMNS — Sheets Product + trailing `_fill`', () => {
  it('freezes select · order — Date and Product scroll with the facts', () => {
    assert.equal(isReceivingGridFrozen('select'), true);
    assert.equal(isReceivingGridFrozen('order'), true);
    assert.equal(isReceivingGridFrozen('date'), false);
    assert.equal(isReceivingGridFrozen('title'), false);
    assert.equal(RECEIVING_GRID_COLUMNS.find((c) => c.key === 'order')?.frozen, true);
    assert.equal(RECEIVING_GRID_COLUMNS.find((c) => c.key === 'date')?.frozen, undefined);
    assert.equal(RECEIVING_GRID_FROZEN_EDGE_KEY, 'order');
    // Contiguous prefix: order sits immediately after select.
    const keys = RECEIVING_GRID_COLUMNS.map((c) => c.key);
    assert.equal(keys.indexOf('order'), keys.indexOf('select') + 1);
  });

  it('places Product before Status before Date (date is not jammed under title)', () => {
    const keys = RECEIVING_GRID_COLUMNS.map((c) => c.key);
    assert.ok(keys.indexOf('title') < keys.indexOf('status'));
    assert.ok(keys.indexOf('status') < keys.indexOf('date'));
  });

  it('Date is the day-floor track — not the sticky stamp pane', () => {
    const date = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'date')!;
    assert.equal(date.width, 'minmax(4.5rem, 4.5rem)');
    assert.equal(date.dateFace, 'day');
    assert.equal(date.frozen, undefined);
  });

  it('Order is a tight last-8 identity track', () => {
    const order = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'order')!;
    assert.equal(order.width, 'minmax(5.5rem, 5.5rem)');
    assert.equal(order.frozen, true);
  });

  it('does not ship a platform column', () => {
    const keys = RECEIVING_GRID_COLUMNS.map((c) => c.key);
    assert.equal(keys.includes('platform'), false);
  });

  it('Product is a hard resizable track — `_fill` absorbs sheet slack', () => {
    const title = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    assert.equal(title.label, 'Product Title');
    assert.equal(title.gridLabel, 'Product');
    assert.equal(title.width, 'minmax(16rem, 16rem)');
    assert.equal(title.resizable, true);
    // Real minimum drag width (no sliver) — 8rem clears the "Product" label-fit.
    assert.equal(title.minTrackRem, 8);
  });

  it('template flexes trailing `_fill` — not Product', () => {
    const template = receivingGridTemplate();
    const frMatches = template.match(/1fr/g) ?? [];
    assert.equal(frMatches.length, 1, 'exactly one flex track — `_fill`');
    assert.ok(
      RECEIVING_GRID_COLUMNS.some((c) => c.key === '_fill'),
      'structural `_fill` absorbs leftover width',
    );
    const fill = RECEIVING_GRID_COLUMNS.find((c) => c.key === '_fill')!;
    assert.equal(fill.width, 'minmax(0rem, 1fr)');
    assert.equal(fill.resizable, false);
    assert.equal(fill.sortable, false);
    assert.match(
      template,
      /var\(--cf-col-title, calc\(16rem \* var\(--cf-density, 1\)\)\)/,
      'Product stays hard 16rem so drag-resize is Sheets-visible',
    );
    assert.match(
      template,
      /minmax\(var\(--cf-col-_fill, calc\(0rem \* var\(--cf-density, 1\)\)\), 1fr\)/,
      'sole 1fr is trailing `_fill`',
    );
  });

  it('Tracking is iconless under the TRACK header (Incoming quiet)', () => {
    const tracking = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'tracking')!;
    assert.equal(tracking.omitCellIcon, true);
    assert.equal(tracking.width, 'minmax(8rem, 8rem)');
  });

  it('Price is iconless under the Price header (Sheets quiet)', () => {
    const price = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'price')!;
    assert.equal(price.omitCellIcon, true);
  });

  it('places price after qty; condition and serial stay optional', () => {
    const keys = RECEIVING_GRID_COLUMNS.map((c) => c.key);
    assert.equal(keys.indexOf('price'), keys.indexOf('qty') + 1);
    assert.equal(RECEIVING_GRID_COLUMNS.find((c) => c.key === 'price')?.tier, undefined);
    assert.equal(RECEIVING_GRID_COLUMNS.find((c) => c.key === 'condition')?.tier, 'optional');
    assert.equal(RECEIVING_GRID_COLUMNS.find((c) => c.key === 'serial')?.tier, 'optional');
  });
});

describe('isReceivingGridSortable — the one sortability answer', () => {
  it('keeps the static data columns sortable and the chrome tracks not', () => {
    assert.equal(isReceivingGridSortable('title'), true);
    assert.equal(isReceivingGridSortable('date'), true);
    assert.equal(isReceivingGridSortable('select'), false);
    assert.equal(isReceivingGridSortable('_fill'), false);
  });

  // Custom columns are merged in at runtime, so they can never appear in the
  // static sortable-key derivation — they are admitted by key SHAPE. All three
  // consumers (descriptor `isSortable`, the header, `useUrlColumnSort`'s
  // `isColumn`) read this one predicate, so this is what makes a custom column
  // clickable AND durable in `?colsort=` together.
  it('admits org custom columns by key shape', () => {
    assert.equal(isReceivingGridSortable('custom:rack_slot'), true);
    assert.equal(isReceivingGridSortable('custom:vendor_ref'), true);
  });

  it('still rejects a bare prefix or an unknown system key', () => {
    assert.equal(isReceivingGridSortable('custom:'), false);
    assert.equal(isReceivingGridSortable('custom'), false);
    assert.equal(isReceivingGridSortable('not_a_column'), false);
  });
});
