import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECEIVING_GRID_COLUMNS,
  RECEIVING_GRID_FROZEN_EDGE_KEY,
  isReceivingGridFrozen,
  receivingGridTemplate,
} from '@/lib/receiving/receiving-grid-layout';

describe('RECEIVING_GRID_COLUMNS — Sheets/Notion Product unlock', () => {
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

  it('Product is the flex + resizable track — absorbs sheet slack', () => {
    const title = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    assert.equal(title.label, 'Product Title');
    assert.equal(title.gridLabel, 'Product');
    assert.equal(title.width, 'minmax(8rem, 1fr)');
    assert.equal(title.resizable, true);
    // Real minimum drag width (no sliver) — 8rem clears the "Product" label-fit.
    assert.equal(title.minTrackRem, 8);
  });

  it('template flexes Product — no trailing `_fill`', () => {
    const template = receivingGridTemplate();
    const frMatches = template.match(/1fr/g) ?? [];
    assert.equal(frMatches.length, 1, 'exactly one flex track — Product');
    assert.match(
      template,
      /minmax\(var\(--cf-col-title, calc\(8rem \* var\(--cf-density, 1\)\)\), 1fr\)/,
      'slack absorbed by Product; 8rem floor keeps the "Product" label legible while fixed-column resize drains into it',
    );
    assert.equal(
      RECEIVING_GRID_COLUMNS.some((c) => c.key === '_fill'),
      false,
      'structural `_fill` retired — Product owns leftover width',
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
