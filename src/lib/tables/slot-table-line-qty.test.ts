/**
 * Line-qty identity — under the title on every PRODUCT_TABLES peer that
 * catalogs `{family}.qty`. A table added later inherits the same place.
 *
 * Run: node --import tsx --test src/lib/tables/slot-table-line-qty.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldCatalog, FieldDef } from './field-catalog/types';
import { SLOT_LAYOUT_TABLES } from './org-table-layouts';
import { BINS_FIELD_CATALOG, BINS_PRODUCT_LAYOUT } from './field-catalog/bins';
import {
  ORDERS_IMPORT_FIELD_CATALOG,
  ORDERS_IMPORT_PRODUCT_LAYOUT,
} from './field-catalog/orders-import';
import { resolveEffectiveLayout } from './resolve-effective-layout';
import type { SlotLayout } from './slot-layout-core';
import {
  ensureLineQtySubtitle,
  isLineQtyField,
  isLineQtyFieldId,
  LINE_QTY_LOCKED_REASON,
  lineQtyField,
  lineQtySubtitlePart,
  pinLineQtyFirst,
  pinLineQtySubtitleBindings,
  slotSubtitlePartsFor,
} from './slot-table-line-qty';

const QTY: FieldDef = {
  id: 'widget.qty',
  family: 'orders',
  label: 'Qty',
  displayType: 'number',
  slotKinds: ['subtitle'],
};
const OCCUPANCY: FieldDef = {
  id: 'bins.total_qty',
  family: 'bins',
  label: 'Qty',
  displayType: 'number',
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
  QTY,
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

describe('isLineQtyFieldId', () => {
  it('matches `{family}.qty` and skips occupancy', () => {
    assert.equal(isLineQtyFieldId('incoming.qty'), true);
    assert.equal(isLineQtyFieldId('receiving.qty'), true);
    assert.equal(isLineQtyFieldId('orders.qty'), true);
    assert.equal(isLineQtyFieldId('bins.total_qty'), false);
    assert.equal(isLineQtyFieldId('orders.notes'), false);
    assert.equal(isLineQtyFieldId(null), false);
  });

  it('requires number + subtitle on the catalog field', () => {
    assert.equal(isLineQtyField(QTY), true);
    assert.equal(isLineQtyField(OCCUPANCY), false);
  });
});

describe('ensureLineQtySubtitle', () => {
  it('pins qty first on an empty subtitle band', () => {
    const next = ensureLineQtySubtitle(emptyLayout(), CATALOG);
    assert.deepEqual(next.subtitleBindings, [{ fieldId: 'widget.qty' }]);
  });

  it('moves qty out of status into subtitle:1', () => {
    const parked = emptyLayout({
      statusBindings: [{ fieldId: 'widget.qty' }],
      subtitleBindings: [{ fieldId: 'widget.notes' }],
    });
    const dual: FieldCatalog = [
      CATALOG[0],
      { ...QTY, slotKinds: ['status', 'subtitle'] },
      CATALOG[2],
    ];
    const next = ensureLineQtySubtitle(parked, dual);
    assert.equal(next.subtitleBindings[0]?.fieldId, 'widget.qty');
    assert.equal(next.statusBindings.some((b) => b.fieldId === 'widget.qty'), false);
  });

  it('is a no-op when the catalog has no line qty', () => {
    const layout = emptyLayout();
    assert.equal(ensureLineQtySubtitle(layout, [OCCUPANCY]), layout);
    assert.equal(lineQtyField([OCCUPANCY]), null);
  });
});

describe('pinLineQtyFirst / pinLineQtySubtitleBindings', () => {
  it('puts qty left of later facts', () => {
    const parts = pinLineQtyFirst([
      { text: 'Used', key: 'orders.condition' },
      { text: '2', key: 'orders.qty', widthCh: 2 },
    ]);
    assert.equal(parts[0]?.key, 'orders.qty');
    assert.equal(parts[1]?.key, 'orders.condition');
  });

  it('rewrites a subtitle band so qty is first', () => {
    const next = pinLineQtySubtitleBindings(
      emptyLayout({
        subtitleBindings: [{ fieldId: 'widget.notes' }, { fieldId: 'widget.qty' }],
      }),
    );
    assert.deepEqual(next.subtitleBindings, [
      { fieldId: 'widget.qty' },
      { fieldId: 'widget.notes' },
    ]);
  });
});

describe('lineQtySubtitlePart', () => {
  it('uses the To-ship face: 1 quiet, 2+ warning, widthCh 2', () => {
    const one = lineQtySubtitlePart('incoming.qty', '1');
    assert.equal(one.widthCh, 2);
    assert.match(one.toneClass ?? '', /text-text-default/);
    const many = lineQtySubtitlePart('incoming.qty', '4');
    assert.match(many.toneClass ?? '', /text-text-warning/);
  });
});

describe('slotSubtitlePartsFor', () => {
  it('applies the qty face and pins first even when ids are reversed', () => {
    const parts = slotSubtitlePartsFor(['widget.notes', 'widget.qty'], (id) =>
      id === 'widget.qty'
        ? { kind: 'value', text: '4' }
        : { kind: 'value', text: 'fragile' },
    );
    assert.equal(parts[0]?.key, 'widget.qty');
    assert.equal(parts[0]?.text, '4');
    assert.equal(parts[0]?.widthCh, 2);
    assert.equal(parts[1]?.key, 'widget.notes');
  });
});

describe('blanket: every SLOT_LAYOUT_TABLES catalog with `{family}.qty`', () => {
  it('gets qty as subtitle:1 from an empty product default — a new table inherits the place', () => {
    const withQty: string[] = [];
    for (const [tableId, { catalog, morphs }] of Object.entries(SLOT_LAYOUT_TABLES)) {
      const qty = lineQtyField(catalog);
      if (!qty) continue;
      withQty.push(tableId);
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
      assert.equal(
        resolved.subtitleBindings[0]?.fieldId,
        qty.id,
        `${tableId} must pin ${qty.id} under the title`,
      );
    }
    assert.ok(withQty.includes('incoming'));
    assert.ok(withQty.includes('receiving'));
    assert.ok(withQty.includes('orders'));
    assert.ok(withQty.includes('pickup'));
    assert.ok(withQty.length >= 5);
  });

  it('moves a status-parked qty onto the first subtitle track', () => {
    const resolved = resolveEffectiveLayout({
      productDefault: ORDERS_IMPORT_PRODUCT_LAYOUT,
      catalog: ORDERS_IMPORT_FIELD_CATALOG,
    });
    assert.equal(resolved.subtitleBindings[0]?.fieldId, 'orders-import.qty');
    assert.equal(
      resolved.statusBindings.some((b) => b.fieldId === 'orders-import.qty'),
      false,
    );
  });

  it('does not treat bins.total_qty as line qty', () => {
    const resolved = resolveEffectiveLayout({
      productDefault: BINS_PRODUCT_LAYOUT,
      catalog: BINS_FIELD_CATALOG,
    });
    assert.equal(resolved.subtitleBindings.some((b) => b.fieldId === 'bins.total_qty'), false);
    assert.equal(lineQtyField(BINS_FIELD_CATALOG), null);
  });
});

describe('LINE_QTY_LOCKED_REASON', () => {
  it('is the Fields-picker copy', () => {
    assert.match(LINE_QTY_LOCKED_REASON, /under the item title/i);
  });
});
