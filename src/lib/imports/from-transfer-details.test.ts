/**
 * DB-free: the writer's per-row detail → the import record's rows.
 * Run: npx tsx --test src/lib/imports/from-transfer-details.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { TransferOrderDetail } from '@/lib/orders-sync/types';
import { importRowsFromTransferDetails } from './from-transfer-details';

const detail = (over: Partial<TransferOrderDetail>): TransferOrderDetail => ({
  orderId: 'X',
  productTitle: 'Widget',
  sku: 'SKU1',
  itemNumber: 'ITEM1',
  tracking: '',
  titleSource: 'sheet',
  ...over,
});

const platformOf = (source: string | null | undefined) =>
  ({ ebay: 'ebay', mekong: 'ebay', amazon: 'amazon' } as Record<string, string>)[(source ?? '').toLowerCase()] ?? null;

test('inserted and backfilled rows carry orders.id, the account and its catalog platform, and the filled columns', () => {
  const rows = importRowsFromTransferDetails(
    {
      inserted: [detail({ orderId: 'N1', orderRowId: 41, accountSource: 'MEKONG', tracking: '1Z9', shipmentId: 7, skuCatalogId: 3 })],
      updated: [detail({ orderId: 'B1', orderRowId: 42, accountSource: 'Amazon', outcome: 'backfilled', filledFields: ['item_number', 'sku'] })],
    },
    { platformOf },
  );
  assert.deepEqual(
    rows.map((r) => [r.outcome, r.orderRowId, r.externalOrderId, r.accountSource, r.platform, r.filledFields]),
    [
      ['inserted', 41, 'N1', 'MEKONG', 'ebay', []],
      ['backfilled', 42, 'B1', 'Amazon', 'amazon', ['item_number', 'sku']],
    ],
  );
  assert.equal(rows[0].trackingNumber, '1Z9');
  assert.equal(rows[0].shipmentId, 7);
  assert.equal(rows[0].skuCatalogId, 3);
});

test('a backfill that changed no column is no row; adopt / claim keep their kind; a tracking-only fill is tracking_filled', () => {
  const rows = importRowsFromTransferDetails({
    inserted: [],
    updated: [
      detail({ orderId: 'U0', orderRowId: 1, outcome: 'backfilled', filledFields: [] }),
      detail({ orderId: 'A1', orderRowId: 2, outcome: 'adopted', filledFields: ['notes'] }),
      detail({ orderId: 'C1', orderRowId: 3, outcome: 'claimed', filledFields: ['account_source', 'product_title'] }),
      detail({ orderId: 'T1', orderRowId: 4, outcome: 'adopted', filledFields: ['shipment_id'] }),
      detail({ orderId: 'T2', orderRowId: 5, outcome: 'backfilled', filledFields: ['shipment_id', 'notes'] }),
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.externalOrderId, r.outcome]),
    [
      ['A1', 'adopted'],
      ['C1', 'claimed'],
      ['T1', 'tracking_filled'],
      ['T2', 'backfilled'],
    ],
  );
});

test('quarantined and ambiguous orders have no orders.id, keep their reason and the exception they were parked on', () => {
  const rows = importRowsFromTransferDetails({
    inserted: [],
    updated: [],
    quarantined: [
      detail({ orderId: 'Q1', platform: 'eBay', quarantineReason: 'unknown store', importExceptionId: 88, orderRowId: 9 }),
      detail({ orderId: 'Q2', outcome: 'ambiguous', quarantineReason: 'two platforms' }),
    ],
    ambiguous: [detail({ orderId: 'M1', accountSource: 'Amazon', quarantineReason: 'ambiguous_match' })],
  });
  assert.deepEqual(
    rows.map((r) => [r.externalOrderId, r.outcome, r.orderRowId, r.reason, r.importExceptionId, r.accountSource]),
    [
      ['Q1', 'quarantined', null, 'unknown store', 88, 'eBay'],
      ['Q2', 'ambiguous', null, 'two platforms', null, null],
      ['M1', 'ambiguous', null, 'ambiguous_match', null, 'Amazon'],
    ],
  );
});

test('decorate stamps the ids only the caller knows, per row', () => {
  const rows = importRowsFromTransferDetails(
    { inserted: [detail({ orderId: 'N1', orderRowId: 41 }), detail({ orderId: 'N2', orderRowId: 43 })], updated: [] },
    { decorate: (d) => (d.orderRowId === 41 ? { sheetTab: 'Sheet_09_28_2026', sheetRow: 5 } : {}) },
  );
  assert.deepEqual(
    rows.map((r) => [r.externalOrderId, r.sheetTab ?? null, r.sheetRow ?? null]),
    [
      ['N1', 'Sheet_09_28_2026', 5],
      ['N2', null, null],
    ],
  );
});
