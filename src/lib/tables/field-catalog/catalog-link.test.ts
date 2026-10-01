/** Catalog-link catalog guards + resolver behaviour — wave 1.3's fifth family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import {
  CATALOG_LINK_COMPOUND_COLUMNS,
  catalogLinkCompoundColumnsFor,
} from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import { CATALOG_LINK_FIELD_CATALOG, CATALOG_LINK_PRODUCT_LAYOUT } from './catalog-link';
import { catalogLinkSlotValuesFor, resolveCatalogLinkSlotValue } from './catalog-link-resolve';


function row(overrides: Partial<CatalogLinkChoreRow> = {}): CatalogLinkChoreRow {
  return {
    id: 3,
    itemNumber: '9M52B2C4',
    accountSource: 'eBay',
    productTitle: 'Bose Wave Radio IV',
    sku: 'BOSE-WAVE-IV',
    status: 'open',
    skuCatalogId: null,
    orderCount: 2,
    firstSeenAt: '2026-08-20T09:00:00.000Z',
    lastSeenAt: '2026-08-30T09:00:00.000Z',
    ...overrides,
  };
}

describe('catalog-link catalog', () => {
  it('has unique ids, all catalog-link-family, each bindable somewhere', () => {
    const ids = CATALOG_LINK_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of CATALOG_LINK_FIELD_CATALOG) {
      assert.equal(field.family, 'catalog-link', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('catalog-link.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog — compound morph, NOTHING bound', () => {
    const parsed = CATALOG_LINK_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'catalog-link.item');
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
  });

  it('names no status fact — every row in this queue is unlinked by definition', () => {
    const ids = CATALOG_LINK_FIELD_CATALOG.map((f) => f.id);
    assert.ok(!ids.includes('catalog-link.status'));
  });
});

describe('catalogLinkCompoundColumnsFor — the compound materialization', () => {
  it('the product default IS the shared compound skeleton, in order', () => {
    assert.deepEqual(
      CATALOG_LINK_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
    assert.ok(CATALOG_LINK_COMPOUND_COLUMNS.every((c) => c.fieldId === undefined));
  });

  it('binding the blocked-order count opens a magnitude track', () => {
    const columns = catalogLinkCompoundColumnsFor({
      ...CATALOG_LINK_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'catalog-link.orders' }],
    });
    const track = columns.find((c) => c.fieldId === 'catalog-link.orders');
    assert.ok(track);
    assert.equal(track.key, 'status:1');
    assert.equal(track.slotDisplayType, 'number');
  });
});

describe('resolveCatalogLinkSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveCatalogLinkSlotValue(r, 'catalog-link.item'), {
      kind: 'value',
      text: '9M52B2C4',
    });
    assert.deepEqual(resolveCatalogLinkSlotValue(r, 'catalog-link.sku'), {
      kind: 'value',
      text: 'BOSE-WAVE-IV',
    });
    assert.deepEqual(resolveCatalogLinkSlotValue(r, 'catalog-link.orders'), {
      kind: 'value',
      text: '2',
    });
    assert.ok((resolveCatalogLinkSlotValue(r, 'catalog-link.source') as { text: string | null }).text);
    assert.ok((resolveCatalogLinkSlotValue(r, 'catalog-link.first') as { text: string | null }).text);
  });

  it('a listing blocking nothing reads blank, never a 0', () => {
    assert.deepEqual(resolveCatalogLinkSlotValue(row({ orderCount: 0 }), 'catalog-link.orders'), {
      kind: 'value',
      text: null,
    });
  });

  it('honest absence: an uncatalogued listing has no SKU to show', () => {
    assert.deepEqual(resolveCatalogLinkSlotValue(row({ sku: null }), 'catalog-link.sku'), {
      kind: 'value',
      text: null,
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveCatalogLinkSlotValue(row(), 'catalog-link.ghost'), null);
  });
});

describe('catalogLinkSlotValuesFor', () => {
  it('keys resolved values by TRACK key', () => {
    const columns = catalogLinkCompoundColumnsFor({
      ...CATALOG_LINK_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'catalog-link.sku' }],
    });
    assert.deepEqual(catalogLinkSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: 'BOSE-WAVE-IV' },
    });
  });

  it('the product default resolves no slots at all', () => {
    assert.equal(catalogLinkSlotValuesFor(row(), CATALOG_LINK_COMPOUND_COLUMNS), undefined);
  });
});
