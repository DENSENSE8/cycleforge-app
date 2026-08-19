/**
 * Amazon returns catalog-ASIN gate — unit tests with injected deps (no DB).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  importDeskInboundRow,
  isDeskImportSkip,
  type ImportDeskInboundRowDeps,
} from './desk-import';
import { deskRowFromCsvRecord } from './desk-csv';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function amazonRow(overrides: Record<string, string> = {}) {
  return deskRowFromCsvRecord({
    'Order ID': '111-222-333',
    'Return request status': 'Approved',
    'Amazon RMA ID': 'RMA1',
    'Tracking ID': '1Z999',
    ASIN: 'B0HITSKU01',
    'Item Name': 'Hit Product',
    'Return quantity': '1',
    'Return Reason': 'UNWANTED_ITEM',
    ...overrides,
  });
}

function mockDeps(opts: {
  catalog?: { id: number; sku: string; product_title: string } | null;
  ingestCreated?: boolean;
}): ImportDeskInboundRowDeps {
  const catalog = opts.catalog === undefined
    ? { id: 42, sku: 'B0HITSKU01', product_title: 'Catalog Title' }
    : opts.catalog;
  return {
    resolveCatalogByAsinSku: async () => catalog,
    ingestPurchase: async (_org, input) => {
      assert.equal(input.sourceType, 'amazon');
      assert.equal(input.skuCatalogId, catalog?.id ?? null);
      return {
        receivingLineId: 1001,
        created: opts.ingestCreated ?? true,
        platformAccountId: null,
        sourceType: 'amazon',
        sourceOrderId: String(input.sourceOrderId),
      };
    },
    tagInboundAsReturn: async () => {},
    stampClassify: async () => ({
      sourcePlatform: 'amazon',
      receivingType: 'RETURN',
      priorityTier: null,
    }),
    receiveIfCartonUnboxed: async () => null,
  };
}

describe('importDeskInboundRow — Amazon returns ingest', () => {
  it('skips cancelled rows without calling ingest', async () => {
    let ingestCalled = false;
    const row = amazonRow({ 'Return request status': 'Cancelled' });
    const outcome = await importDeskInboundRow(ORG, row, {
      resolveCatalogByAsinSku: async () => {
        throw new Error('should not resolve');
      },
      ingestPurchase: async () => {
        ingestCalled = true;
        throw new Error('should not ingest');
      },
    });
    assert.equal(ingestCalled, false);
    assert.ok(isDeskImportSkip(outcome));
    assert.equal(outcome.reason, 'cancelled');
  });

  it('ingests when ASIN is not in sku_catalog so tracking still lands', async () => {
    const row = amazonRow({ ASIN: 'B0MISSING99' });
    let seenSku: string | null | undefined;
    let seenCatalogId: number | null | undefined;
    const outcome = await importDeskInboundRow(
      ORG,
      row,
      {
        ...mockDeps({ catalog: null }),
        ingestPurchase: async (_org, input) => {
          seenSku = input.sku ?? null;
          seenCatalogId = input.skuCatalogId ?? null;
          assert.equal(input.trackingNumber, '1Z999');
          return {
            receivingLineId: 1001,
            created: true,
            platformAccountId: null,
            sourceType: 'amazon',
            sourceOrderId: '111-222-333',
          };
        },
      },
    );
    assert.equal(isDeskImportSkip(outcome), false);
    assert.equal(seenSku, 'B0MISSING99');
    assert.equal(seenCatalogId, null);
  });

  it('ingests when ASIN equals sku_catalog.sku and stamps catalog id', async () => {
    const row = amazonRow();
    let seenSkuCatalogId: number | null | undefined;
    const outcome = await importDeskInboundRow(ORG, row, {
      resolveCatalogByAsinSku: async (_org, asin) => {
        assert.equal(asin, 'B0HITSKU01');
        return { id: 42, sku: 'B0HITSKU01', product_title: 'Catalog Title' };
      },
      ingestPurchase: async (_org, input) => {
        seenSkuCatalogId = input.skuCatalogId ?? null;
        assert.equal(input.sku, 'B0HITSKU01');
        assert.equal(input.trackingNumber, '1Z999');
        assert.equal(input.sourceLineItemId, 'RMA1:B0HITSKU01');
        return {
          receivingLineId: 1001,
          created: true,
          platformAccountId: null,
          sourceType: 'amazon',
          sourceOrderId: '111-222-333',
        };
      },
      tagInboundAsReturn: async () => {},
      stampClassify: async () => ({
        sourcePlatform: 'amazon',
        receivingType: null,
        priorityTier: null,
      }),
      receiveIfCartonUnboxed: async () => null,
    });
    assert.equal(isDeskImportSkip(outcome), false);
    if (!isDeskImportSkip(outcome)) {
      assert.equal(outcome.created, true);
      assert.equal(outcome.receivingLineId, 1001);
      assert.equal(outcome.kind, 'return');
    }
    assert.equal(seenSkuCatalogId, 42);
  });

  it('fills blank item name from catalog title', async () => {
    // Omit Item Name so cell() yields null — catalog title fills the gap.
    const blankTitle = deskRowFromCsvRecord({
      'Order ID': '111-222-333',
      'Return request status': 'Approved',
      'Amazon RMA ID': 'RMA1',
      'Tracking ID': '1Z999',
      ASIN: 'B0HITSKU01',
      'Return quantity': '1',
    });
    let seenName: string | null | undefined;
    await importDeskInboundRow(ORG, blankTitle, {
      resolveCatalogByAsinSku: async () => ({
        id: 7,
        sku: 'B0HITSKU01',
        product_title: 'From Catalog',
      }),
      ingestPurchase: async (_org, input) => {
        seenName = input.itemName ?? null;
        return {
          receivingLineId: 2,
          created: true,
          platformAccountId: null,
          sourceType: 'amazon',
          sourceOrderId: '111-222-333',
        };
      },
      tagInboundAsReturn: async () => {},
      stampClassify: async () => ({
        sourcePlatform: 'amazon',
        receivingType: null,
        priorityTier: null,
      }),
      receiveIfCartonUnboxed: async () => null,
    });
    assert.equal(seenName, 'From Catalog');
  });

  it('does not gate Cycle Forge desk amazon returns on catalog', async () => {
    const row = deskRowFromCsvRecord({
      kind: 'return',
      source: 'amazon',
      order_id: '111-222-333',
      sku: 'NOT-AN-ASIN',
      item_name: 'Desk row',
    });
    assert.equal(row.amazonNativeReturn, undefined);
    let resolveCalled = false;
    const outcome = await importDeskInboundRow(ORG, row, {
      resolveCatalogByAsinSku: async () => {
        resolveCalled = true;
        return null;
      },
      ingestPurchase: async () => ({
        receivingLineId: 9,
        created: true,
        platformAccountId: null,
        sourceType: 'amazon',
        sourceOrderId: '111-222-333',
      }),
      tagInboundAsReturn: async () => {},
      stampClassify: async () => ({
        sourcePlatform: 'amazon',
        receivingType: null,
        priorityTier: null,
      }),
      receiveIfCartonUnboxed: async () => null,
    });
    assert.equal(resolveCalled, false);
    assert.equal(isDeskImportSkip(outcome), false);
  });
});
