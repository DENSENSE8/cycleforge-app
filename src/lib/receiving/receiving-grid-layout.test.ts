import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECEIVING_GRID_COLUMNS,
  isReceivingGridFrozen,
  receivingGridTemplate,
} from '@/lib/receiving/receiving-grid-layout';

describe('RECEIVING_GRID_COLUMNS — Sheets/Notion Product unlock', () => {
  it('freezes select only — Order and Product scroll with the facts', () => {
    assert.equal(isReceivingGridFrozen('select'), true);
    assert.equal(isReceivingGridFrozen('order'), false);
    assert.equal(isReceivingGridFrozen('title'), false);
    assert.equal(RECEIVING_GRID_COLUMNS.find((c) => c.key === 'title')?.frozen, undefined);
  });

  it('Product Title is a fixed preferred track — not the fill 1fr', () => {
    const title = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    assert.equal(title.label, 'Product Title');
    assert.equal(title.gridLabel, 'Product');
    // Fill-track resize trap: minmax(var(--cf-col-title), 1fr) made narrow
    // drags invisible. Fixed rem ⇒ drag writes exact px (Sheets-like).
    assert.equal(title.width, 'minmax(16rem, 16rem)');
    assert.equal(title.width.includes('1fr'), false);
  });

  it('does NOT flex title — leftover width is trailing `_fill`', () => {
    const template = receivingGridTemplate();
    const frMatches = template.match(/1fr/g) ?? [];
    assert.equal(frMatches.length, 1, 'exactly one flex track — trailing `_fill`');
    assert.match(
      template,
      /minmax\(var\(--cf-col-_fill, 0rem\), 1fr\)/,
      'slack absorbed by structural `_fill`, not Product',
    );
    assert.match(
      template,
      /var\(--cf-col-title, minmax\(16rem, 16rem\)\)/,
      'title is a fixed 16rem preferred track, not minmax(…, 1fr)',
    );
  });
});
