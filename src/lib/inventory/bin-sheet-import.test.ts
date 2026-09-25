import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planBinSheet, type BinSheetOverrides, type BinSheetRow } from './bin-sheet-import';

const base = (rows: BinSheetOverrides['rows'], extra: Partial<BinSheetOverrides> = {}): BinSheetOverrides => ({
  importKey: 'sheet-1',
  ledgerNote: 'sheet 1',
  titleFixes: [['\\bBoss\\b', 'Bose']],
  rows,
  ...extra,
});

describe('planBinSheet', () => {
  it('stocks units under the chosen SKU and parts (p and bare +n) under a parts temp', () => {
    const rows: BinSheetRow[] = [
      { location: 'A-1', item: 'RC28T1-27', sku_raw: '00187-P-1', sku_kind: 'zoho', raw_qty: '15 + 18p', units: 15, parts: 18 },
      { location: 'A-2', item: 'Cinemate GS I', sku_raw: 'NO SKU', sku_kind: 'none', raw_qty: '13 + 3', units: 13, other: 3 },
    ];
    const plan = planBinSheet(
      rows,
      base({
        'A-1': { sku: '00187-P-1', partsTemp: 'p1' },
        'A-2': { temp: 't2', partsTemp: 'p2' },
      }),
    );
    assert.deepEqual(
      plan.lines.map((l) => [l.location, l.target, l.qty, l.what]),
      [
        ['A-1', { kind: 'real', sku: '00187-P-1' }, 15, 'units'],
        ['A-1', { kind: 'temp', key: 'p1' }, 18, 'parts'],
        ['A-2', { kind: 'temp', key: 't2' }, 13, 'units'],
        ['A-2', { kind: 'temp', key: 'p2' }, 3, 'parts'],
      ],
    );
    assert.equal(plan.products.find((p) => p.key === 'p1')?.title, 'RC28T1-27 — parts');
    assert.equal(plan.products.find((p) => p.key === 'p2')?.sourceRef, 'sheet-1:p2');
  });

  it('does not stock a "bad" unit but notes it on the product', () => {
    const plan = planBinSheet(
      [{ location: 'A-1', item: 'Cable white', sku_raw: 'X', sku_kind: 'zoho', raw_qty: '72 + 1 bad', units: 72, other: 1 }],
      base({ 'A-1': { temp: 'cable' } }),
    );
    assert.deepEqual(plan.lines.map((l) => l.qty), [72]);
    assert.match(plan.products[0].description, /1 bad unit at A-1 not stocked/);
  });

  it('shares one temp across cells, splits colour variants, and flags a missing count', () => {
    const rows: BinSheetRow[] = [
      { location: 'A-1', item: 'Boss RC', sku_raw: '45 WRONG', sku_kind: 'wrong', raw_qty: '3', units: 3, note: 'In box' },
      { location: 'A-2', item: 'Boss RC', sku_raw: '45 WRONG', sku_kind: 'wrong', raw_qty: '4', units: 4 },
      { location: 'A-3', item: 'Media center', sku_raw: '672', sku_kind: 'numeric', raw_qty: 'White: 2, Gray: 15', units: 17, variants: { White: 2, Gray: 15 } },
      { location: 'A-4', item: 'Mix box', sku_raw: '', sku_kind: 'none', raw_qty: '', units: null },
      { location: 'A-5', item: 'NA', sku_kind: 'empty' },
    ];
    const plan = planBinSheet(
      rows,
      base({
        'A-1': { temp: 'wrong' },
        'A-2': { temp: 'wrong' },
        'A-3': { variants: { White: 'mc-w', Gray: 'mc-g' } },
        'A-4': { temp: 'mix' },
      }),
    );
    const wrong = plan.products.find((p) => p.key === 'wrong');
    assert.equal(wrong?.title, 'Bose RC');
    assert.deepEqual(wrong?.locations, ['A-1', 'A-2']);
    assert.match(wrong?.description ?? '', /ITEM "Boss RC"/);
    assert.deepEqual(
      plan.products.filter((p) => p.key.startsWith('mc-')).map((p) => p.title),
      ['Media center (White)', 'Media center (Gray)'],
    );
    const mix = plan.products.find((p) => p.key === 'mix');
    assert.equal(mix?.countNeeded, true);
    assert.equal(plan.lines.find((l) => l.location === 'A-4')?.qty, null);
    assert.deepEqual(plan.empty, ['A-5']);
  });

  it('refuses cells the overrides do not decide, and overrides for cells not on the sheet', () => {
    const row: BinSheetRow = { location: 'A-1', item: 'RC', sku_raw: '1', sku_kind: 'numeric', raw_qty: '2 + 1p', units: 2, parts: 1 };
    assert.throws(() => planBinSheet([row], base({})), /A-1: no override/);
    assert.throws(() => planBinSheet([row], base({ 'A-1': { temp: 't' } })), /1 parts but no partsTemp/);
    assert.throws(
      () => planBinSheet([row], base({ 'A-1': { temp: 't', partsTemp: 'p' }, 'B-9': { temp: 'x' } })),
      /B-9: override for a cell not on the sheet/,
    );
  });

  it('requires an explicit title when cells sharing a temp disagree', () => {
    const rows: BinSheetRow[] = [
      { location: 'A-1', item: 'Cable black', sku_raw: 'BK', sku_kind: 'zoho', raw_qty: '10', units: 10 },
      { location: 'A-2', item: 'AM input cable', sku_raw: 'BK', sku_kind: 'zoho', raw_qty: '5', units: 5 },
    ];
    const rowsOv = { 'A-1': { temp: 'bk' }, 'A-2': { temp: 'bk' } };
    assert.throws(() => planBinSheet(rows, base(rowsOv)), /disagree on the title/);
    const plan = planBinSheet(rows, base(rowsOv, { products: { bk: { title: 'Cable black' } } }));
    assert.equal(plan.products[0].title, 'Cable black');
  });
});
