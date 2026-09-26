/**
 * Line-money identity — under the title after qty on every PRODUCT_TABLES
 * peer that catalogs `{family}.amount` or `{family}.price`.
 *
 * Run: node --import tsx --test src/lib/tables/slot-table-line-money.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldCatalog, FieldDef } from './field-catalog/types';
import { SLOT_LAYOUT_TABLES } from './org-table-layouts';
import { resolveEffectiveLayout } from './resolve-effective-layout';
import type { SlotLayout } from './slot-layout-core';
import { lineQtyField } from './slot-table-line-qty';
import {
  ensureLineMoneySubtitle,
  isLineMoneyField,
  isLineMoneyFieldId,
  LINE_MONEY_LOCKED_REASON,
  lineMoneyField,
  lineMoneySubtitlePart,
  pinLineMoneyAfterQty,
} from './slot-table-line-money';

const MONEY: FieldDef = {
  id: 'widget.price',
  family: 'receiving',
  label: 'Price',
  displayType: 'money',
  slotKinds: ['subtitle'],
};
const COST: FieldDef = {
  id: 'widget.cost',
  family: 'catalog',
  label: 'Last cost',
  displayType: 'money',
  slotKinds: ['subtitle'],
};
const CATALOG: FieldCatalog = [
  {
    id: 'widget.order',
    family: 'orders',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
  },
  {
    id: 'widget.qty',
    family: 'orders',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['subtitle'],
  },
  MONEY,
  {
    id: 'widget.notes',
    family: 'orders',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['subtitle'],
  },
];

function emptyLayout(overrides: Partial<SlotLayout> = {}): SlotLayout {
  return {
    morph: 'compound',
    identityFieldId: 'widget.order',
    statusBindings: [],
    subtitleBindings: [],
    amountFieldId: null,
    ...overrides,
  };
}

describe('isLineMoneyFieldId', () => {
  it('matches `{family}.amount` / `{family}.price` and skips cost / occupancy', () => {
    assert.equal(isLineMoneyFieldId('orders.amount'), true);
    assert.equal(isLineMoneyFieldId('receiving.price'), true);
    assert.equal(isLineMoneyFieldId('incoming.price'), true);
    assert.equal(isLineMoneyFieldId('catalog.cost'), false);
    assert.equal(isLineMoneyFieldId('sku-velocity.stock'), false);
    assert.equal(isLineMoneyFieldId(null), false);
  });

  it('requires money + subtitle on the catalog field', () => {
    assert.equal(isLineMoneyField(MONEY), true);
    assert.equal(isLineMoneyField(COST), false);
    assert.equal(
      isLineMoneyField({ ...MONEY, slotKinds: ['amount'] }),
      false,
    );
  });
});

describe('ensureLineMoneySubtitle', () => {
  it('pins price after qty', () => {
    const next = ensureLineMoneySubtitle(
      emptyLayout({ subtitleBindings: [{ fieldId: 'widget.qty' }] }),
      CATALOG,
    );
    assert.deepEqual(next.subtitleBindings, [
      { fieldId: 'widget.qty' },
      { fieldId: 'widget.price' },
    ]);
  });

  it('clears amountFieldId when that field is the line money', () => {
    const next = ensureLineMoneySubtitle(
      emptyLayout({ amountFieldId: 'widget.price' }),
      CATALOG,
    );
    assert.equal(next.amountFieldId, null);
    assert.equal(next.subtitleBindings[0]?.fieldId, 'widget.price');
  });

  it('is a no-op when the catalog has no line money', () => {
    const layout = emptyLayout();
    assert.equal(ensureLineMoneySubtitle(layout, [COST]), layout);
    assert.equal(lineMoneyField([COST]), null);
  });
});

describe('pinLineMoneyAfterQty', () => {
  it('sits money immediately after qty', () => {
    const parts = pinLineMoneyAfterQty([
      { text: 'Used', key: 'orders.condition' },
      { text: '$9.00', key: 'orders.amount', widthCh: 8 },
      { text: '2', key: 'orders.qty', widthCh: 2 },
    ]);
    assert.equal(parts[0]?.key, 'orders.qty');
    assert.equal(parts[1]?.key, 'orders.amount');
    assert.equal(parts[2]?.key, 'orders.condition');
  });
});

describe('lineMoneySubtitlePart', () => {
  it('keeps the currency mark when empty', () => {
    const part = lineMoneySubtitlePart('orders.amount', null);
    assert.equal(part.text, '$-');
    assert.equal(part.widthCh, 8);
  });
});

describe('LINE_MONEY_LOCKED_REASON', () => {
  it('names the under-title lock', () => {
    assert.match(LINE_MONEY_LOCKED_REASON, /under the item title/i);
  });
});

describe('blanket: every SLOT_LAYOUT_TABLES catalog with line money', () => {
  it('gets amount/price under the title from an empty product default', () => {
    const withMoney: string[] = [];
    for (const [tableId, { catalog, morphs }] of Object.entries(SLOT_LAYOUT_TABLES)) {
      const money = lineMoneyField(catalog);
      if (!money) continue;
      withMoney.push(tableId);
      const identity = catalog.find((f) => f.slotKinds.includes('identity'));
      assert.ok(identity, `${tableId} missing identity`);
      const dummy: SlotLayout = {
        morph: morphs[0] ?? 'compound',
        identityFieldId: identity.id,
        statusBindings: [],
        subtitleBindings: [],
        amountFieldId: null,
      };
      const resolved = resolveEffectiveLayout({ productDefault: dummy, catalog });
      const qty = lineQtyField(catalog);
      const moneyAt = qty ? 1 : 0;
      assert.equal(
        resolved.subtitleBindings[moneyAt]?.fieldId,
        money.id,
        `${tableId} must pin ${money.id} under the title`,
      );
      assert.equal(resolved.amountFieldId, null, `${tableId} must not keep an amount slot`);
    }
    assert.ok(withMoney.includes('orders'));
    assert.ok(withMoney.includes('receiving'));
    assert.ok(withMoney.length >= 4);
  });
});
