/**
 *   npx tsx --test src/lib/orders-sync/run-detail.test.ts
 *
 * The run's per-row answer to "which ones?". The cases that matter are the ones
 * that mislead an operator when they are wrong: work-to-do must sort above
 * good news, and a run with no detail must read as empty, not broken.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSyncRunDetail } from './run-detail';
import type { TransferOrderDetail, TransferTabState } from './types';

function order(orderId: string, productTitle: string): TransferOrderDetail {
  return {
    orderId,
    productTitle,
    sku: '',
    itemNumber: '',
    tracking: `1Z${orderId}`,
    titleSource: 'sku_catalog',
  };
}

function tab(partial: Partial<TransferTabState['details'] & object>): TransferTabState {
  return {
    status: 'done',
    details: {
      inserted: [],
      updated: [],
      deleted: [],
      unknownTitle: [],
      unresolvedTracking: [],
      unmatchedCatalog: [],
      ...partial,
    },
  };
}

describe('sync run detail', () => {
  it('puts work-to-do above good news', () => {
    const detail = buildSyncRunDetail(
      tab({
        inserted: [order('A-1', 'Speaker')],
        unmatchedCatalog: [order('A-2', 'Dock')],
      }),
    );
    assert.equal(detail.groups[0]?.id, 'unmatched-catalog', 'the fixable group leads');
    assert.equal(detail.hasActionable, true);
    assert.ok(detail.groups.some((group) => group.id === 'inserted'));
    assert.equal(detail.total, 2);
  });

  it('is empty, not broken, for a run that reported no detail', () => {
    const detail = buildSyncRunDetail({ status: 'done' });
    assert.deepEqual(detail.groups, []);
    assert.equal(detail.total, 0);
    assert.equal(detail.hasActionable, false);
  });

  it('gives every row a stable unique key', () => {
    const detail = buildSyncRunDetail(
      tab({ inserted: [order('A', 'One'), order('A', 'Duplicate order id')] }),
    );
    const keys = detail.groups.flatMap((group) => group.rows.map((row) => row.key));
    assert.equal(new Set(keys).size, keys.length, 'duplicate order ids must not collide');
  });

  it('holds quarantined orders as work-to-do and names the real platform, never the importer', () => {
    const detail = buildSyncRunDetail(
      tab({
        inserted: [{ ...order('111-1', 'Speaker'), platform: 'Amazon' }],
        quarantined: [{ ...order('500', ''), quarantineReason: 'already under eBay, Walmart' }],
      }),
    );
    assert.equal(detail.groups[0]?.id, 'quarantined');
    assert.equal(detail.groups[0]?.actionable, true);
    const inserted = detail.groups.find((group) => group.id === 'inserted');
    assert.equal(inserted?.rows[0]?.platform, 'Amazon');
  });
});
