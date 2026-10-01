/** Units catalog guards + resolver behaviour — wave 1.4's first family, and the first SHEET port of that wave. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNITS_SHEET_COLUMNS,
  unitsSheetColumnsFor,
  unitsSortFactFor,
} from '@/components/inventory/units-grid/units-grid-layout';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import { UNITS_FIELD_CATALOG, UNITS_PRODUCT_LAYOUT } from './units';
import { resolveUnitsSlotValue } from './units-resolve';


function row(overrides: Partial<UnitsOverviewRow> = {}): UnitsOverviewRow {
  return {
    id: 88,
    serial_number: '9M52B2C4',
    product_title: 'Bose Wave Radio IV',
    sku: 'BOSE-WAVE-IV',
    current_status: 'TESTED',
    condition_grade: 'USED_A',
    current_location: 'BIN A-12',
    updated_at: '2026-08-30T15:04:00.000Z',
    ...overrides,
  };
}

describe('units catalog', () => {
  it('has unique ids, all units-family, each bindable somewhere', () => {
    const ids = UNITS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of UNITS_FIELD_CATALOG) {
      assert.equal(field.family, 'units', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('units.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the full set bound)', () => {
    const parsed = UNITS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'units.serial');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'units.status' },
      { fieldId: 'units.condition' },
      { fieldId: 'units.location' },
      { fieldId: 'units.updated' },
    ]);
  });

  it('names no SKU fact — it is the second line of the Product cell, not a track', () => {
    assert.ok(!UNITS_FIELD_CATALOG.some((f) => f.id === 'units.sku'));
  });
});

describe('unitsSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's scan order", () => {
    assert.deepEqual(
      UNITS_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['serial', null],
        ['product', null],
        ['status:1', 'units.status'],
        ['status:2', 'units.condition'],
        ['status:3', 'units.location'],
        ['status:4', 'units.updated'],
      ],
    );
  });

  it('subtitle bindings open real columns directly after Product (sheet morph)', () => {
    const columns = unitsSheetColumnsFor({
      ...UNITS_PRODUCT_LAYOUT,
      subtitleBindings: [{ fieldId: 'units.location' }],
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ['serial', 'product', 'subtitle:1', 'status:1', 'status:2', 'status:3', 'status:4'],
    );
  });

  it('keeps exactly one flex track (the structural product title)', () => {
    const flex = UNITS_SHEET_COLUMNS.filter((c) => c.width.includes('1fr'));
    assert.deepEqual(flex.map((c) => c.key), ['product']);
  });

  it('sort facts: structural tracks map to their own facts, slot tracks to their bound field', () => {
    const byKey = new Map(UNITS_SHEET_COLUMNS.map((c) => [c.key, unitsSortFactFor(c)]));
    assert.equal(byKey.get('serial'), 'units.serial');
    assert.equal(byKey.get('product'), 'product');
    assert.equal(byKey.get('status:1'), 'units.status');
    assert.equal(byKey.get('status:4'), 'units.updated');
  });
});

describe('resolveUnitsSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveUnitsSlotValue(r, 'units.serial'), {
      kind: 'value',
      text: '9M52B2C4',
    });
    assert.deepEqual(resolveUnitsSlotValue(r, 'units.status'), { kind: 'value', text: 'TESTED' });
    assert.deepEqual(resolveUnitsSlotValue(r, 'units.location'), {
      kind: 'value',
      text: 'BIN A-12',
    });
    assert.equal(resolveUnitsSlotValue(r, 'units.condition')?.kind, 'value');
    assert.ok((resolveUnitsSlotValue(r, 'units.updated') as { text: string | null }).text);
  });

  it('the updated fact is the ABSOLUTE day — a resolver must not read the clock', () => {
    // Two calls on the same row must agree forever; the relative "3d" face
    // belongs to the cell, which has a tooltip carrying the instant.
    const first = resolveUnitsSlotValue(row(), 'units.updated');
    const second = resolveUnitsSlotValue(row(), 'units.updated');
    assert.deepEqual(first, second);
  });

  it('honest absence: a unit with no serial, grade or bin resolves null', () => {
    const bare = row({ serial_number: null, condition_grade: null, current_location: null, updated_at: null });
    for (const id of ['units.serial', 'units.condition', 'units.location', 'units.updated']) {
      assert.deepEqual(resolveUnitsSlotValue(bare, id), { kind: 'value', text: null }, id);
    }
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveUnitsSlotValue(row(), 'units.ghost'), null);
  });
});
