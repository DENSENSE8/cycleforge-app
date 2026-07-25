import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateTransferSheetRowEligibility,
  filterEligibleTransferSheetRows,
  type TransferSheetEligibilityCols,
} from './transfer-sheet-eligibility';

const cols: TransferSheetEligibilityCols = {
  orderNumber: 0,
  itemNumber: 1,
  tracking: 2,
  platform: 3,
};

function row(parts: {
  orderId?: string;
  itemNumber?: string;
  tracking?: string;
  platform?: string;
}): unknown[] {
  const out: unknown[] = [];
  out[cols.orderNumber] = parts.orderId ?? 'ORD-1';
  out[cols.itemNumber] = parts.itemNumber ?? '123456789012';
  out[cols.tracking] = parts.tracking ?? '1Z999AA10123456784';
  out[cols.platform] = parts.platform ?? 'ebay';
  return out;
}

describe('evaluateTransferSheetRowEligibility', () => {
  it('keeps a row with order id, tracking, and raw item number', () => {
    assert.equal(evaluateTransferSheetRowEligibility(row({}), cols), 'ok');
  });

  it('skips blank order id', () => {
    assert.equal(evaluateTransferSheetRowEligibility(row({ orderId: '  ' }), cols), 'noOrderId');
  });

  it('skips blank tracking', () => {
    assert.equal(evaluateTransferSheetRowEligibility(row({ tracking: '' }), cols), 'noTracking');
  });

  it('skips blank raw item number (catalog backfill must not count)', () => {
    assert.equal(evaluateTransferSheetRowEligibility(row({ itemNumber: '' }), cols), 'noItemNumber');
    assert.equal(evaluateTransferSheetRowEligibility(row({ itemNumber: '   ' }), cols), 'noItemNumber');
  });

  it('treats missing item-number column index as blank', () => {
    const missingCol: TransferSheetEligibilityCols = { ...cols, itemNumber: -1 };
    assert.equal(evaluateTransferSheetRowEligibility(row({}), missingCol), 'noItemNumber');
  });

  it('skips Ecwid sheet rows', () => {
    assert.equal(evaluateTransferSheetRowEligibility(row({ platform: 'Ecwid' }), cols), 'ecwid');
  });
});

describe('filterEligibleTransferSheetRows', () => {
  it('counts each skip reason and keeps eligible rows', () => {
    const { eligible, skips } = filterEligibleTransferSheetRows(
      [
        row({ orderId: '' }),
        row({ tracking: '' }),
        row({ itemNumber: '' }),
        row({ platform: 'ecwid' }),
        row({ orderId: 'KEEP', itemNumber: 'ASIN1', tracking: 'TRACK1' }),
      ],
      cols,
    );

    assert.equal(eligible.length, 1);
    assert.equal(String(eligible[0][cols.orderNumber]), 'KEEP');
    assert.deepEqual(skips, {
      skippedNoOrderId: 1,
      skippedNoTracking: 1,
      skippedNoItemNumber: 1,
      skippedEcwid: 1,
    });
  });
});
