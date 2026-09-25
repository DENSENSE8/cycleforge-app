import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogLinkCompoundView } from './catalog-link-compound-view';
import { importExceptionCompoundView } from './import-exception-compound-view';
import { CATALOG_LINK_TABLE_BINDING } from './catalog-link-table-definition';
import { IMPORT_EXCEPTION_TABLE_BINDING } from './import-exception-table-definition';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';

function chore(over: Partial<CatalogLinkChoreRow> = {}): CatalogLinkChoreRow {
  return {
    id: 11,
    itemNumber: '123456789012',
    accountSource: 'eBay',
    productTitle: 'Sony A7 III',
    sku: 'A7III',
    status: 'open',
    skuCatalogId: null,
    orderCount: 4,
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-20T00:00:00.000Z',
    ...over,
  };
}

function exception(over: Partial<ImportExceptionRow> = {}): ImportExceptionRow {
  return {
    id: 22,
    accountOrderId: '19-12345',
    accountSource: 'Amazon',
    reason: 'no_item_number',
    productTitle: 'Canon 5D',
    tracking: '1Z999',
    status: 'open',
    sheetRow: 8,
    resolvedItemNumber: null,
    resolvedOrderId: null,
    seenCount: 3,
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-20T00:00:00.000Z',
    ...over,
  };
}

test('a listing row carries the item number as fulfillment identity', () => {
  const view = catalogLinkCompoundView(chore());
  assert.equal(view.orderId, '123456789012');
  assert.equal(view.title, 'Sony A7 III');
  assert.equal(view.note, 'A7III');
  assert.equal(view.platformValue, 'ebay');
  assert.equal(view.stateTone, 'alert');
  assert.equal(view.thumbUrl, null);
  assert.equal(view.amount, null);
});

test('a listing without a title falls back to the item number', () => {
  const view = catalogLinkCompoundView(chore({ productTitle: null, sku: null, orderCount: 0 }));
  assert.equal(view.title, '123456789012');
  assert.equal(view.note, null);
});

test('a missing-item-number row carries the sale id and tracking', () => {
  const view = importExceptionCompoundView(exception());
  assert.equal(view.orderId, '19-12345');
  assert.equal(view.tracking, '1Z999');
  assert.equal(view.note, 'Sheet row 8');
  assert.equal(view.platformValue, 'amazon');
  assert.equal(view.stateLabel, 'No item #');
});

test('the registered definitions send a row click to the catalog-link rails', () => {
  assert.equal(CATALOG_LINK_TABLE_BINDING.definition.id, 'review.catalog-link');
  assert.deepEqual(CATALOG_LINK_TABLE_BINDING.recordPlane, {
    kind: 'inspector',
    occupantId: 'detail:catalog-link',
  });
  assert.equal(CATALOG_LINK_TABLE_BINDING.definition.capabilities.multiSelect, false);
  assert.equal(CATALOG_LINK_TABLE_BINDING.definition.capabilities.inCellEdit, false);

  assert.equal(IMPORT_EXCEPTION_TABLE_BINDING.definition.id, 'review.import-exception');
  assert.deepEqual(IMPORT_EXCEPTION_TABLE_BINDING.recordPlane, {
    kind: 'inspector',
    occupantId: 'detail:import-exception',
  });
  assert.equal(IMPORT_EXCEPTION_TABLE_BINDING.definition.tableId, 'import-exception');
});
