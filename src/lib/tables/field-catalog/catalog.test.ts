/** Products-catalog catalog guards + resolver behaviour — wave 1.4's fourth family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CatalogListRow } from '@/components/products/catalog/types';
import {
  CATALOG_SHEET_COLUMNS,
  catalogSheetColumnsFor,
  catalogSortFactFor,
} from '@/lib/products/catalog-grid-layout';
import { CATALOG_FIELD_CATALOG, CATALOG_PRODUCT_LAYOUT } from './catalog';
import { resolveCatalogSlotValue } from './catalog-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<CatalogListRow> = {}): CatalogListRow {
  return {
    id: 44,
    sku: 'BOSE-WAVE-IV',
    product_title: 'Bose Wave Radio IV',
    category: 'Audio',
    image_url: null,
    is_active: true,
    lifecycle_status: 'ACTIVE',
    reorder_threshold: null,
    last_known_cost_cents: 12_500,
    platform_count: 2,
    manual_count: 0,
    qc_step_count: 3,
    order_count: 7,
    provider_item_id: 'ZI-9912',
    inventory_title: 'Bose Wave IV (master)',
    is_inventory_linked: true,
    has_pending_action: false,
    display_title: 'Bose Wave Radio IV',
    ...overrides,
  };
}

describe('products-catalog catalog', () => {
  it('has unique ids, all catalog-family, each bindable somewhere', () => {
    const ids = CATALOG_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of CATALOG_FIELD_CATALOG) {
      assert.equal(field.family, 'catalog', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('catalog.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the lean core view)', () => {
    const parsed = parseSlotLayout(CATALOG_PRODUCT_LAYOUT, CATALOG_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'catalog.sku');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'catalog.inventory' },
      { fieldId: 'catalog.status' },
    ]);
  });

  it('the four roll-up counts and the cost ship UNBOUND — the old optional tier', () => {
    const bound = new Set(CATALOG_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId));
    for (const id of [
      'catalog.channels',
      'catalog.manuals',
      'catalog.qc',
      'catalog.orders',
      'catalog.cost',
      'catalog.category',
    ]) {
      assert.ok(CATALOG_FIELD_CATALOG.some((f) => f.id === id), `${id} is offered`);
      assert.ok(!bound.has(id), `${id} is not bound by default`);
    }
  });
});

describe('catalogSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's CORE view scan order", () => {
    assert.deepEqual(
      CATALOG_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['title', null],
        ['status:1', 'catalog.inventory'],
        ['status:2', 'catalog.status'],
      ],
    );
  });

  it('binding a roll-up count opens a magnitude track', () => {
    const columns = catalogSheetColumnsFor({
      ...CATALOG_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'catalog.orders' }],
    });
    const track = columns.find((c) => c.fieldId === 'catalog.orders');
    assert.ok(track);
    assert.equal(track.slotDisplayType, 'number');
    assert.equal(catalogSortFactFor(track), 'catalog.orders');
  });

  it('keeps exactly one flex track (the structural product title)', () => {
    const flex = CATALOG_SHEET_COLUMNS.filter((c) => c.width.includes('1fr'));
    assert.deepEqual(flex.map((c) => c.key), ['title']);
  });
});

describe('resolveCatalogSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveCatalogSlotValue(r, 'catalog.sku'), {
      kind: 'value',
      text: 'BOSE-WAVE-IV',
    });
    assert.deepEqual(resolveCatalogSlotValue(r, 'catalog.inventory'), {
      kind: 'value',
      text: 'Bose Wave IV (master)',
    });
    assert.deepEqual(resolveCatalogSlotValue(r, 'catalog.orders'), { kind: 'value', text: '7' });
    assert.deepEqual(resolveCatalogSlotValue(r, 'catalog.cost'), { kind: 'value', text: '$125.00' });
    assert.deepEqual(resolveCatalogSlotValue(r, 'catalog.status'), { kind: 'value', text: 'ACTIVE' });
  });

  it('a zero roll-up is blank, never a 0', () => {
    assert.deepEqual(resolveCatalogSlotValue(row(), 'catalog.manuals'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolveCatalogSlotValue(row({ order_count: 0 }), 'catalog.orders'), {
      kind: 'value',
      text: null,
    });
  });

  it('an unlinked product resolves no inventory — a column must not invent the link', () => {
    assert.deepEqual(
      resolveCatalogSlotValue(row({ is_inventory_linked: false }), 'catalog.inventory'),
      { kind: 'value', text: null },
    );
  });

  it('status names what has happened, worst first', () => {
    assert.deepEqual(resolveCatalogSlotValue(row({ has_pending_action: true }), 'catalog.status'), {
      kind: 'value',
      text: 'Needs attention',
    });
    assert.deepEqual(resolveCatalogSlotValue(row({ is_active: false }), 'catalog.status'), {
      kind: 'value',
      text: 'Inactive',
    });
  });

  it('a product nobody has bought has no cost — not a free one', () => {
    assert.deepEqual(
      resolveCatalogSlotValue(row({ last_known_cost_cents: null }), 'catalog.cost'),
      { kind: 'value', text: null },
    );
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveCatalogSlotValue(row(), 'catalog.ghost'), null);
  });
});
