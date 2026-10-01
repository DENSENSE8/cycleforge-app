/** Bins catalog guards + resolver behaviour — wave 1.4's second family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BINS_SHEET_COLUMNS,
  binsSheetColumnsFor,
  binsSortFactFor,
} from '@/components/warehouse/bins-grid/bins-grid-layout';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { BINS_FIELD_CATALOG, BINS_PRODUCT_LAYOUT } from './bins';
import { resolveBinsSlotValue } from './bins-resolve';


function row(overrides: Partial<BinsOverviewRow> = {}): BinsOverviewRow {
  return {
    id: 5,
    barcode: 'BIN-A-12',
    name: 'A-12',
    room: 'Main floor',
    row_label: 'A',
    col_label: '12',
    capacity: 40,
    bin_type: 'SHELF',
    zone_letter: 'A',
    total_qty: 18,
    sku_count: 4,
    fill_pct: 45,
    last_counted: '2026-08-12T10:00:00.000Z',
    is_empty: false,
    is_stale: true,
    has_low_stock: false,
    is_over_capacity: false,
    ...overrides,
  };
}

describe('bins catalog', () => {
  it('has unique ids, all bins-family, each bindable somewhere', () => {
    const ids = BINS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of BINS_FIELD_CATALOG) {
      assert.equal(field.family, 'bins', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('bins.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the full set bound)', () => {
    const parsed = BINS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'bins.barcode');
    assert.equal(parsed.statusBindings.length, 6);
  });
});

describe('binsSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's scan order", () => {
    assert.deepEqual(
      BINS_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['barcode', null],
        ['status:1', 'bins.location'],
        ['status:2', 'bins.sku_count'],
        ['status:3', 'bins.total_qty'],
        ['status:4', 'bins.fill'],
        ['status:5', 'bins.last_counted'],
        ['status:6', 'bins.status'],
      ],
    );
  });

  it('keeps exactly one flex track (the structural barcode identity)', () => {
    const flex = BINS_SHEET_COLUMNS.filter((c) => c.width.includes('1fr'));
    assert.deepEqual(flex.map((c) => c.key), ['barcode']);
  });

  it('the flag composite never sorts, and that rule rides the FACT', () => {
    const byKey = new Map(BINS_SHEET_COLUMNS.map((c) => [c.key, binsSortFactFor(c)]));
    assert.equal(byKey.get('select'), null);
    assert.equal(byKey.get('barcode'), 'bins.barcode');
    assert.equal(byKey.get('status:1'), 'bins.location');
    assert.equal(byKey.get('status:6'), null);

    // Rebound into a different slot, it is still unsortable.
    const rebound = binsSheetColumnsFor({
      ...BINS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'bins.status' }],
    });
    const track = rebound.find((c) => c.fieldId === 'bins.status');
    assert.ok(track);
    assert.equal(binsSortFactFor(track), null);
  });
});

describe('resolveBinsSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveBinsSlotValue(r, 'bins.barcode'), { kind: 'value', text: 'BIN-A-12' });
    assert.deepEqual(resolveBinsSlotValue(r, 'bins.sku_count'), { kind: 'value', text: '4' });
    assert.deepEqual(resolveBinsSlotValue(r, 'bins.total_qty'), { kind: 'value', text: '18' });
    assert.deepEqual(resolveBinsSlotValue(r, 'bins.fill'), { kind: 'value', text: '45%' });
    assert.deepEqual(resolveBinsSlotValue(r, 'bins.location'), {
      kind: 'value',
      text: 'Main floor [A] · A · 12',
    });
  });

  it('the status fact names the flags that are TRUE, in the chip row order', () => {
    assert.deepEqual(resolveBinsSlotValue(row(), 'bins.status'), {
      kind: 'value',
      text: 'Stale',
    });
    assert.deepEqual(
      resolveBinsSlotValue(row({ is_empty: true, has_low_stock: true }), 'bins.status'),
      { kind: 'value', text: 'Empty · Low · Stale' },
    );
  });

  it('honest absence: no flags, no capacity and never counted all resolve null', () => {
    const clean = row({
      is_stale: false,
      fill_pct: null,
      last_counted: null,
    });
    assert.deepEqual(resolveBinsSlotValue(clean, 'bins.status'), { kind: 'value', text: null });
    assert.deepEqual(resolveBinsSlotValue(clean, 'bins.fill'), { kind: 'value', text: null });
    assert.deepEqual(resolveBinsSlotValue(clean, 'bins.last_counted'), {
      kind: 'value',
      text: null,
    });
  });

  it('a special bin with no grid coordinates falls back to its name', () => {
    assert.deepEqual(
      resolveBinsSlotValue(row({ row_label: null, col_label: null, name: 'Returns cage' }), 'bins.location'),
      { kind: 'value', text: 'Main floor [A] · Returns cage' },
    );
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveBinsSlotValue(row(), 'bins.ghost'), null);
  });
});
