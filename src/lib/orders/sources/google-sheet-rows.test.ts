import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIXED_COL_INDICES_DEFAULT,
  bindSheetColumns,
  mapSheetRowsToCanonicalLines,
  resolveSheetShipByDate,
} from './google-sheet-rows';

describe('bindSheetColumns', () => {
  it('binds required and optional headers case-insensitively', () => {
    const { colIndices, missing } = bindSheetColumns([
      'Ship by date',
      'Order Number',
      'ITEM NUMBER',
      'Item title',
      'Qty',
    ]);
    assert.deepEqual(missing, []);
    assert.equal(colIndices.shipByDate, 0);
    assert.equal(colIndices.orderNumber, 1);
    assert.equal(colIndices.itemNumber, 2);
    assert.equal(colIndices.itemTitle, 3);
    assert.equal(colIndices.quantity, 4);
  });

  it('leaves an absent optional column at -1 without failing', () => {
    const { colIndices, missing } = bindSheetColumns(['Order Number', 'Item Number', 'Title']);
    assert.deepEqual(missing, []);
    assert.equal(colIndices.currency, -1);
    assert.equal(colIndices.salePrice, -1);
    assert.equal(colIndices.tracking, -1);
  });

  it('reports the missing REQUIRED headers so the caller can 400', () => {
    const { missing } = bindSheetColumns(['Ship by date', 'Tracking']);
    assert.deepEqual(missing.map((b) => b.field).sort(), ['itemNumber', 'itemTitle', 'orderNumber']);
  });
});

describe('resolveSheetShipByDate', () => {
  it('resolves a date-only cell to the END of that warehouse day', () => {
    // `new Date('2026-07-15')` is UTC midnight = 5pm the PREVIOUS day in the
    // warehouse zone, which landed every date-only ship-by a day early. And a
    // ship-by is a deadline, so the order is on time until the day CLOSES.
    const resolved = resolveSheetShipByDate('2026-07-15');
    assert.ok(resolved);
    assert.equal(resolved.toISOString(), '2026-07-16T06:59:59.999Z');
  });

  it('accepts the M/D/YYYY shape the sheet also produces', () => {
    assert.equal(
      resolveSheetShipByDate('7/15/2026')?.toISOString(),
      resolveSheetShipByDate('2026-07-15')?.toISOString(),
    );
  });

  it('returns null for a blank cell rather than defaulting to today', () => {
    // A blank cell once fell back to the import date, so an order was born at
    // its own deadline and read as overdue the next morning — 61% of the live
    // Pending queue carried a deadline equal to its creation date.
    assert.equal(resolveSheetShipByDate(''), null);
    assert.equal(resolveSheetShipByDate(null), null);
    assert.equal(resolveSheetShipByDate(undefined), null);
  });

  it('returns null for an unparseable cell', () => {
    assert.equal(resolveSheetShipByDate('whenever'), null);
  });
});

describe('mapSheetRowsToCanonicalLines', () => {
  const cols = FIXED_COL_INDICES_DEFAULT;

  it('maps a fixed-layout row onto named fields', () => {
    const [line] = mapSheetRowsToCanonicalLines(
      [['2026-07-15', 'ORD-9', 'ITEM-1', 'A Widget', '3', 'SKU-9', 'Used', '1Z-XYZ', 'note', 'ebay']],
      cols,
    );
    assert.equal(line.externalOrderId, 'ORD-9');
    assert.equal(line.itemNumber, 'ITEM-1');
    assert.equal(line.productTitle, 'A Widget');
    assert.equal(line.quantity, '3');
    assert.equal(line.sku, 'SKU-9');
    assert.equal(line.condition, 'Used');
    assert.deepEqual(line.trackings, ['1Z-XYZ']);
    assert.equal(line.notes, 'note');
    assert.equal(line.accountSource, 'ebay');
    assert.equal(line.shipByDate?.toISOString(), '2026-07-16T06:59:59.999Z');
  });

  it('defaults a blank quantity to one unit', () => {
    const [line] = mapSheetRowsToCanonicalLines([['', 'ORD-1', 'I', 'T', '', '', '', '', '', '']], cols);
    assert.equal(line.quantity, '1');
  });

  it('emits no tracking entry for a blank tracking cell', () => {
    const [line] = mapSheetRowsToCanonicalLines([['', 'ORD-1', 'I', 'T', '1', '', '', '  ', '', '']], cols);
    assert.deepEqual(line.trackings, []);
  });

  it('leaves currency null when the sheet has NO currency column', () => {
    // Load-bearing: the writer must not rewrite an existing order's currency
    // from a source that never knew it. A sheet without the column would
    // otherwise stamp every non-USD order back to USD on each sync.
    const [line] = mapSheetRowsToCanonicalLines([['', 'ORD-1', 'I', 'T', '1', '', '', '', '', '']], cols);
    assert.equal(line.currency, null);
  });

  it('defaults a bound-but-blank currency cell to USD', () => {
    const bound = { ...cols, currency: 10 };
    const [line] = mapSheetRowsToCanonicalLines([['', 'ORD-1', 'I', 'T', '1', '', '', '', '', '', '']], bound);
    assert.equal(line.currency, 'USD');
  });

  it('parses a bound sale price and ignores an unbound one', () => {
    const bound = { ...cols, salePrice: 10 };
    const [priced] = mapSheetRowsToCanonicalLines(
      [['', 'ORD-1', 'I', 'T', '1', '', '', '', '', '', '$1,250.00']],
      bound,
    );
    assert.equal(priced.saleAmount, '1250');

    const [unpriced] = mapSheetRowsToCanonicalLines([['', 'ORD-1', 'I', 'T', '1', '', '', '', '', '']], cols);
    assert.equal(unpriced.saleAmount, null);
  });

  it('reads a short row without throwing (missing trailing cells are blank)', () => {
    const [line] = mapSheetRowsToCanonicalLines([['', 'ORD-1']], cols);
    assert.equal(line.externalOrderId, 'ORD-1');
    assert.equal(line.productTitle, '');
    assert.equal(line.accountSource, '');
  });
});
