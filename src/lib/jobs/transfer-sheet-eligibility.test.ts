import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateTransferSheetRowEligibility,
  filterEligibleTransferSheetRows,
  SKIPPED_ROW_SAMPLE_CAP,
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

  it('skips ECWID-RS / repair-service spellings as the same Ecwid API channel', () => {
    assert.equal(evaluateTransferSheetRowEligibility(row({ platform: 'ECWID-RS' }), cols), 'ecwid');
    assert.equal(
      evaluateTransferSheetRowEligibility(row({ platform: 'Ecwid Repair Service' }), cols),
      'ecwid',
    );
  });

  it('skips a 4-digit Ecwid order id even when Platform is blank', () => {
    assert.equal(
      evaluateTransferSheetRowEligibility(row({ orderId: '5012', platform: '' }), cols),
      'ecwid',
    );
  });

  it('reports an Ecwid row with a blank item number as ecwid, not noItemNumber', () => {
    // Attribution, not eligibility — the row is skipped either way. But an
    // Ecwid row arrives through the Ecwid API, so filing it under
    // "missing Item Number" invents a data-entry problem the operator cannot
    // fix by editing the sheet. On the live 2026-07-29 tab this misfiled 5 of
    // 23 reported "missing Item Number" rows.
    assert.equal(
      evaluateTransferSheetRowEligibility(row({ platform: 'ECWID', itemNumber: '' }), cols),
      'ecwid',
    );
  });

  it('still reports a NON-Ecwid blank item number as noItemNumber', () => {
    // Guards the other direction: moving the Ecwid check earlier must not
    // swallow the genuine eBay/Amazon data-entry gap this counter exists for.
    assert.equal(
      evaluateTransferSheetRowEligibility(row({ platform: 'eBay', itemNumber: '' }), cols),
      'noItemNumber',
    );
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
      skippedBlankRow: 0,
      skippedFbaShipment: 0,
      skippedNoOrderId: 1,
      skippedNoTracking: 1,
      skippedNoItemNumber: 1,
      skippedEcwid: 1,
    });
  });

  it('classifies an FBA inbound shipment row instead of importing it', () => {
    // One inbound shipment split across boxes: same id, different tracking. As
    // orders these would be fake sales, and sharing one order number they would
    // collapse onto a single row under the account+source+order_id unique key.
    const { eligible, skips, skippedRows } = filterEligibleTransferSheetRows(
      [
        row({ orderId: 'FBA19KD6XX28', itemNumber: '', tracking: '1Z23A1E90334389330' }),
        row({ orderId: 'FBA19KD6XX28', itemNumber: '', tracking: '1Z23A1E90303488148' }),
        row({ orderId: '114-4650197-9281815' }),
      ],
      cols,
    );

    assert.equal(skips.skippedFbaShipment, 2);
    // They must NOT inflate the missing-Item-Number work queue.
    assert.equal(skips.skippedNoItemNumber, 0);
    assert.equal(eligible.length, 1);
    assert.deepEqual(
      skippedRows.map((r) => r.reason),
      ['fbaShipment', 'fbaShipment'],
    );
  });

  it('does not mistake a real order number or prose for an FBA shipment id', () => {
    // Anchored + shaped: a marketplace order id, and a title mentioning FBA,
    // must both stay ordinary rows.
    assert.equal(
      evaluateTransferSheetRowEligibility(row({ orderId: '114-4650197-9281815' }), cols),
      'ok',
    );
    assert.equal(evaluateTransferSheetRowEligibility(row({ orderId: 'FBA' }), cols), 'ok');
    assert.equal(
      evaluateTransferSheetRowEligibility(row({ orderId: 'Sent to FBA warehouse' }), cols),
      'ok',
    );
  });

  it('counts an all-empty row as padding, not a missing order id', () => {
    const { skips, skippedRows } = filterEligibleTransferSheetRows([[], ['', '  ', '']], cols);

    assert.equal(skips.skippedBlankRow, 2);
    assert.equal(skips.skippedNoOrderId, 0);
    // Counted, never listed — padding in an operator's fix-list is pure noise.
    assert.equal(skippedRows.length, 0);
  });

  it('captures each skipped row with its sheet row number and reason', () => {
    const withTitle = { ...cols, itemTitle: 4 };
    const build = (parts: Parameters<typeof row>[0], title: string) => {
      const out = row(parts);
      out[4] = title;
      return out;
    };

    const { skippedRows } = filterEligibleTransferSheetRows(
      [
        build({ itemNumber: '', platform: 'eBay' }, 'Bose Wave Radio'),
        build({ orderId: 'KEEP' }, 'Imported fine'),
        build({ tracking: '', platform: 'Amazon' }, 'Missing tracking'),
      ],
      withTitle,
    );

    assert.equal(skippedRows.length, 2);
    // Row numbers are 1-based sheet coordinates: rows[0] is sheet row 2 because
    // row 1 is the header. An operator uses this to jump straight to the cell.
    assert.deepEqual(
      skippedRows.map((r) => [r.sheetRow, r.reason, r.platform, r.productTitle]),
      [
        [2, 'noItemNumber', 'eBay', 'Bose Wave Radio'],
        [4, 'noTracking', 'Amazon', 'Missing tracking'],
      ],
    );
  });

  it('bounds the captured rows without distorting the counts', () => {
    const many = Array.from({ length: SKIPPED_ROW_SAMPLE_CAP + 25 }, () => row({ itemNumber: '' }));
    const { skips, skippedRows, noItemNumberRows } = filterEligibleTransferSheetRows(many, cols);

    assert.equal(skippedRows.length, SKIPPED_ROW_SAMPLE_CAP);
    // The COUNT stays exact — only the listed sample is capped.
    assert.equal(skips.skippedNoItemNumber, SKIPPED_ROW_SAMPLE_CAP + 25);
    // Durable Review queue is uncapped — every noItemNumber row enqueues.
    assert.equal(noItemNumberRows.length, skips.skippedNoItemNumber);
    assert.ok(noItemNumberRows.every((r) => r.reason === 'noItemNumber'));
  });
});
