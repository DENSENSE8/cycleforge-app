/** FBA catalog guards + resolver behaviour — the third family's mirror of `orders.test.ts` / `pickup.test.ts`: */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FbaBoardItem } from '@/lib/fba/types';
import { FBA_FIELD_CATALOG, FBA_PRODUCT_LAYOUT } from './fba';
import { resolveFbaSlotValue } from './fba-resolve';
import { parseSlotLayout } from '../slot-layout';

function item(overrides: Partial<FbaBoardItem> = {}): FbaBoardItem {
  return {
    item_id: 7,
    fnsku: '01P14H5X',
    expected_qty: 1,
    actual_qty: 3,
    item_status: 'PACKED',
    display_title: 'Bose 151 Speakers',
    asin: 'B0007AJXQS',
    sku: 'PT-D051-M7LE',
    item_notes: null,
    shipment_id: 12,
    shipment_ref: 'FBA-2026-081',
    amazon_shipment_id: 'FBA18XYZ',
    due_date: '2026-08-25',
    shipment_status: 'OPEN',
    destination_fc: 'SMF3',
    tracking_numbers: [],
    condition: 'NewItem',
    ...overrides,
  } as FbaBoardItem;
}

describe('fba catalog', () => {
  it('has unique ids, all fba-family, each bindable somewhere', () => {
    const ids = FBA_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of FBA_FIELD_CATALOG) {
      assert.equal(field.family, 'fba', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
    }
  });

  it('product default parses against the catalog (sheet morph; asin identity)', () => {
    const parsed = parseSlotLayout(FBA_PRODUCT_LAYOUT, FBA_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'fba.asin');
    assert.deepEqual(parsed.subtitleBindings, [
      { fieldId: 'fba.fnsku' },
      { fieldId: 'fba.qty' },
      { fieldId: 'fba.condition' },
    ]);
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'fba.status' },
      { fieldId: 'fba.due' },
      { fieldId: 'fba.plan' },
    ]);
  });
});

describe('resolveFbaSlotValue', () => {
  it('resolves each catalog field off the board row', () => {
    const i = item();
    assert.deepEqual(resolveFbaSlotValue(i, 'fba.fnsku'), { kind: 'value', text: '01P14H5X' });
    assert.deepEqual(resolveFbaSlotValue(i, 'fba.qty'), { kind: 'value', text: '3 / 1' });
    assert.deepEqual(resolveFbaSlotValue(i, 'fba.condition'), { kind: 'value', text: 'NewItem' });
    assert.deepEqual(resolveFbaSlotValue(i, 'fba.plan'), { kind: 'value', text: 'FBA-2026-081' });
    assert.equal(resolveFbaSlotValue(i, 'fba.due')?.kind, 'value');
  });

  it('plan falls back to the Amazon shipment id; blanks resolve null text', () => {
    assert.deepEqual(resolveFbaSlotValue(item({ shipment_ref: null }), 'fba.plan'), {
      kind: 'value',
      text: 'FBA18XYZ',
    });
    assert.deepEqual(
      resolveFbaSlotValue(item({ due_date: null, condition: null }), 'fba.due'),
      { kind: 'value', text: null },
    );
  });

  it('status resolves the label SoT and unknown field ids resolve null', () => {
    const value = resolveFbaSlotValue(item(), 'fba.status');
    assert.equal(value?.kind, 'value');
    if (value?.kind === 'value') assert.ok(value.text);
    assert.equal(resolveFbaSlotValue(item(), 'fba.ghost'), null);
  });
});
