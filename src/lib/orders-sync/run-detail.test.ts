/**
 *   npx tsx --test src/lib/orders-sync/run-detail.test.ts
 *
 * The run's per-row answer to "which ones?". The cases that matter are the ones
 * that mislead an operator when they are wrong: work-to-do must sort above
 * good news, spreadsheet padding must be counted without being listed, and an
 * Ecwid row the SHEET declined must not be dressed up as a problem.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSyncRunDetail, MISSING_ITEM_NUMBER_HREF } from './run-detail';
import type { TransferOrderDetail, TransferSkippedRow, TransferTabState } from './types';

function order(orderId: string, productTitle: string): TransferOrderDetail {
  return {
    orderId,
    productTitle,
    sku: '',
    itemNumber: '',
    tracking: `1Z${orderId}`,
    titleSource: 'sheet',
  };
}

function skip(
  reason: TransferSkippedRow['reason'],
  sheetRow: number,
  orderId = `SK-${sheetRow}`,
): TransferSkippedRow {
  return { sheetRow, reason, orderId, platform: 'eBay', productTitle: 'Thing', tracking: '' };
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
      skippedRows: [],
      recoveredRows: [],
      ...partial,
    },
  };
}

describe('sync run detail', () => {
  it('puts work-to-do above good news', () => {
    const detail = buildSyncRunDetail({
      sheets: tab({
        inserted: [order('A-1', 'Speaker')],
        skippedRows: [skip('noItemNumber', 4)],
      }),
    });
    assert.equal(detail.groups[0]?.id, 'skip-noItemNumber', 'the fixable group leads');
    assert.equal(detail.hasActionable, true);
    assert.ok(detail.groups.some((group) => group.id === 'inserted'));
  });

  it('counts empty spreadsheet rows without listing them', () => {
    const detail = buildSyncRunDetail({
      sheets: tab({ skippedRows: [skip('blankRow', 91), skip('blankRow', 92)] }),
    });
    const blanks = detail.groups.find((group) => group.id === 'skip-blankRow');
    assert.equal(blanks?.rows.length, 0, 'padding is never a row an operator reads');
    assert.equal(blanks?.unlistedCount, 2);
    assert.equal(detail.total, 2, 'still counted in the badge');
  });

  it('keeps an Ecwid-sourced sheet row quiet and unactionable', () => {
    const detail = buildSyncRunDetail({ sheets: tab({ skippedRows: [skip('ecwid', 12)] }) });
    const group = detail.groups.find((g) => g.id === 'skip-ecwid');
    assert.equal(group?.actionable, false);
    assert.equal(group?.tone, 'quiet');
    assert.equal(detail.hasActionable, false, 'nothing here is a task');
  });

  it('carries the fix link only for missing item numbers', () => {
    const detail = buildSyncRunDetail({
      sheets: tab({ skippedRows: [skip('noItemNumber', 5), skip('noTracking', 6)] }),
    });
    assert.equal(
      detail.groups.find((g) => g.id === 'skip-noItemNumber')?.href,
      MISSING_ITEM_NUMBER_HREF,
    );
    assert.equal(detail.groups.find((g) => g.id === 'skip-noTracking')?.href, undefined);
  });

  it('merges both provider lanes and names each row source', () => {
    const detail = buildSyncRunDetail({
      sheets: tab({ inserted: [order('S-1', 'Sheet order')] }),
      ecwid: tab({ inserted: [order('E-1', 'Ecwid order')] }),
    });
    const rows = detail.groups.find((g) => g.id === 'inserted')?.rows ?? [];
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.source).sort(),
      ['Ecwid', 'Google Sheet'],
    );
  });

  it('is empty, not broken, for a run that reported no detail', () => {
    const detail = buildSyncRunDetail({ sheets: { status: 'done' }, ecwid: null });
    assert.deepEqual(detail.groups, []);
    assert.equal(detail.total, 0);
    assert.equal(detail.hasActionable, false);
  });

  it('gives every row a stable unique key', () => {
    const detail = buildSyncRunDetail({
      sheets: tab({ inserted: [order('A', 'One'), order('A', 'Duplicate order id')] }),
    });
    const keys = detail.groups.flatMap((group) => group.rows.map((row) => row.key));
    assert.equal(new Set(keys).size, keys.length, 'duplicate order ids must not collide');
  });
});
