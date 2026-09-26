/** Pickup catalog guards + resolver behaviour — the second family's mirror of `orders.test.ts`. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PickupLine } from '@/components/receiving/pickup/pickup-lines';
import {
  PICKUP_SHEET_COLUMNS,
  pickupSheetColumnsFor,
  pickupSortFactFor,
} from '@/components/receiving/pickup/grid/pickup-grid-layout';
import { PICKUP_FIELD_CATALOG, PICKUP_PRODUCT_LAYOUT } from './pickup';
import { resolvePickupSlotValue } from './pickup-resolve';
import { parseSlotLayout } from '../slot-layout';

function line(overrides: Partial<PickupLine> = {}): PickupLine {
  return {
    id: 7,
    order_id: 31,
    sku: 'BOSE-1',
    product_title: 'Bose Wave Radio',
    image_url: null,
    quantity: 2,
    condition_grade: 'USED_A',
    parts_status: 'COMPLETE',
    missing_parts_note: null,
    condition_note: null,
    total_price: '120.50',
    po_number: 'LCPU-00042',
    reference_number: null,
    customer_name: 'Dana Vo',
    order_status: 'DRAFT',
    receiving_id: null,
    pickup_date: '2026-08-12',
    zoho_po_id: null,
    zoho_status: null,
    zoho_total: null,
    zoho_po_date: null,
    zoho_vendor_name: null,
    ...overrides,
  } as PickupLine;
}

describe('pickup catalog', () => {
  it('has unique ids, all pickup-family, each bindable somewhere', () => {
    const ids = PICKUP_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of PICKUP_FIELD_CATALOG) {
      assert.equal(field.family, 'pickup', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
    }
  });

  it('product default parses against the catalog (sheet morph; date · status in the status band)', () => {
    const parsed = parseSlotLayout(PICKUP_PRODUCT_LAYOUT, PICKUP_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'pickup.order');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'pickup.date' },
      { fieldId: 'pickup.status' },
    ]);
    assert.deepEqual(parsed.subtitleBindings, []);
  });
});

describe('pickupSheetColumnsFor — the sheet materialization', () => {
  it('product default reproduces the retired hand model\'s CORE view scan order', () => {
    // select · title · order · date · status — what the flat model shipped ON
    // by default (its tier:\'optional\' columns are now unbound catalog facts).
    assert.deepEqual(
      PICKUP_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['title', null],
        ['order', null],
        ['status:1', 'pickup.date'],
        ['status:2', 'pickup.status'],
      ],
    );
  });

  it('subtitle bindings open real columns directly after Order (sheet morph)', () => {
    const columns = pickupSheetColumnsFor({
      ...PICKUP_PRODUCT_LAYOUT,
      subtitleBindings: [{ fieldId: 'pickup.sku' }, { fieldId: 'pickup.price' }],
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ['select', 'title', 'order', 'subtitle:1', 'subtitle:2', 'status:1', 'status:2'],
    );
    // Money geometry rides the display type: Price end-aligns.
    assert.equal(columns.find((c) => c.key === 'subtitle:2')?.align, 'end');
  });

  it('keeps exactly one flex track (the structural title)', () => {
    const flex = PICKUP_SHEET_COLUMNS.filter((c) => c.width.includes('1fr'));
    assert.deepEqual(flex.map((c) => c.key), ['title']);
  });

  it('sort facts: structural tracks map to title/order, slot tracks to their bound field', () => {
    const byKey = new Map(PICKUP_SHEET_COLUMNS.map((c) => [c.key, pickupSortFactFor(c)]));
    assert.equal(byKey.get('select'), null);
    assert.equal(byKey.get('title'), 'title');
    assert.equal(byKey.get('order'), 'order');
    assert.equal(byKey.get('status:1'), 'pickup.date');
    assert.equal(byKey.get('status:2'), 'pickup.status');
  });
});

describe('resolvePickupSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const l = line();
    assert.deepEqual(resolvePickupSlotValue(l, 'pickup.sku'), { kind: 'value', text: 'BOSE-1' });
    assert.deepEqual(resolvePickupSlotValue(l, 'pickup.qty'), { kind: 'value', text: '2' });
    assert.deepEqual(resolvePickupSlotValue(l, 'pickup.price'), { kind: 'value', text: '$120.50' });
    assert.deepEqual(resolvePickupSlotValue(l, 'pickup.customer'), {
      kind: 'value',
      text: 'Dana Vo',
    });
    assert.equal(resolvePickupSlotValue(l, 'pickup.order')?.kind, 'value');
  });

  it('blanks resolve to null text; the fallback order handle never blanks', () => {
    const empty = line({ sku: null, customer_name: null, pickup_date: null, po_number: null });
    assert.deepEqual(resolvePickupSlotValue(empty, 'pickup.sku'), { kind: 'value', text: null });
    assert.deepEqual(resolvePickupSlotValue(empty, 'pickup.customer'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolvePickupSlotValue(empty, 'pickup.date'), { kind: 'value', text: null });
    assert.deepEqual(resolvePickupSlotValue(empty, 'pickup.order'), {
      kind: 'value',
      text: 'order:31',
    });
  });

  it('money face holds the numeric(12,2)::text wire contract', () => {
    assert.deepEqual(resolvePickupSlotValue(line({ total_price: 'abc' }), 'pickup.price'), {
      kind: 'value',
      text: '$0.00',
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolvePickupSlotValue(line(), 'pickup.ghost'), null);
  });
});
