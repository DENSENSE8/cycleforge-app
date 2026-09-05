import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupCanonicalOrderLines,
  parseSaleAmount,
  resolveExternalLineId,
  type CanonicalOrderLine,
} from './canonical-order';

function line(overrides: Partial<CanonicalOrderLine> = {}): CanonicalOrderLine {
  return {
    externalOrderId: 'ORD-1',
    externalLineId: '',
    itemNumber: '',
    productTitle: '',
    sku: '',
    condition: '',
    quantity: '1',
    notes: '',
    customerName: '',
    accountSource: '',
    status: null,
    trackings: [],
    shipByDate: null,
    orderDate: null,
    saleAmount: null,
    currency: null,
    ...overrides,
  };
}

describe('parseSaleAmount', () => {
  it('strips currency symbols and thousands separators', () => {
    assert.equal(parseSaleAmount('$1,299.00'), '1299');
    assert.equal(parseSaleAmount('1299'), '1299');
    assert.equal(parseSaleAmount(' 45.50 '), '45.5');
  });

  it('returns null for an absent price rather than zero', () => {
    // An unpriced line is UNKNOWN. Coercing it to 0 would let the writer
    // overwrite a real sale amount with zero on the next sync.
    assert.equal(parseSaleAmount(''), null);
    assert.equal(parseSaleAmount(null), null);
    assert.equal(parseSaleAmount(undefined), null);
    assert.equal(parseSaleAmount('n/a'), null);
  });

  it('keeps a negative amount (refund / adjustment)', () => {
    assert.equal(parseSaleAmount('-25.00'), '-25');
  });
});

describe('resolveExternalLineId', () => {
  it('prefers the marketplace line id when the adapter carried one', () => {
    assert.equal(
      resolveExternalLineId(line({ externalLineId: 'LI-9', itemNumber: 'ITEM', sku: 'SKU' })),
      'LI-9',
    );
  });

  it('falls back through listing facts so a sheet of distinct products survives', () => {
    assert.equal(resolveExternalLineId(line({ itemNumber: 'ITEM-1' })), 'ITEM-1');
    assert.equal(resolveExternalLineId(line({ sku: 'SKU-1' })), 'SKU-1');
    assert.equal(resolveExternalLineId(line({ productTitle: 'Bose CineMate II' })), 'Bose CineMate II');
    assert.equal(resolveExternalLineId(line()), '');
  });
});

describe('groupCanonicalOrderLines', () => {
  it('keeps distinct products on one order as sibling lines', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', sku: 'FIRST' }),
      line({ externalOrderId: 'A', sku: 'LAST' }),
    ]);
    assert.equal(grouped.length, 2);
    assert.deepEqual(grouped.map((o) => o.sku), ['FIRST', 'LAST']);
    assert.equal(grouped[0].lineCount, 1);
    assert.equal(grouped[1].externalLineId, 'LAST');
  });

  it('still folds two source rows of the SAME line identity (last wins scalars)', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', externalLineId: 'LI-1', sku: 'FIRST', quantity: '1' }),
      line({ externalOrderId: 'A', externalLineId: 'LI-1', sku: 'LAST', quantity: '2' }),
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].sku, 'LAST');
    assert.equal(grouped[0].quantity, '2');
    assert.equal(grouped[0].lineCount, 2);
  });

  it('unions trackings only within the same line, first-seen order', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', externalLineId: 'LI-1', trackings: ['1Z-AAA'] }),
      line({ externalOrderId: 'A', externalLineId: 'LI-1', trackings: ['1Z-BBB', '1Z-AAA'] }),
    ]);
    // trackings[0] becomes the PRIMARY shipment, so order matters.
    assert.deepEqual(grouped[0].trackings, ['1Z-AAA', '1Z-BBB']);
  });

  it('does not copy one sibling\'s tracking onto an unshipped sibling', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', sku: 'SHIPPED', trackings: ['1Z-AAA'] }),
      line({ externalOrderId: 'A', sku: 'OPEN', trackings: [] }),
    ]);
    assert.deepEqual(
      grouped.map((o) => ({ sku: o.sku, trackings: o.trackings })),
      [
        { sku: 'SHIPPED', trackings: ['1Z-AAA'] },
        { sku: 'OPEN', trackings: [] },
      ],
    );
  });

  it('copies an order-level customer name onto siblings that did not carry one', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', sku: 'A', customerName: 'Jane Doe' }),
      line({ externalOrderId: 'A', sku: 'B', customerName: '' }),
    ]);
    assert.deepEqual(grouped.map((o) => o.customerName), ['Jane Doe', 'Jane Doe']);
  });

  it('drops lines with a blank order id as unjoinable', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: '' }),
      line({ externalOrderId: '   ' }),
      line({ externalOrderId: 'A' }),
    ]);
    assert.deepEqual(grouped.map((o) => o.externalOrderId), ['A']);
  });

  it('trims the order id and groups ids that differ only by whitespace', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A' }),
      line({ externalOrderId: ' A ' }),
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].externalOrderId, 'A');
  });

  it('preserves first-appearance order across different orders', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'B' }),
      line({ externalOrderId: 'A' }),
      line({ externalOrderId: 'B' }),
    ]);
    assert.deepEqual(grouped.map((o) => o.externalOrderId), ['B', 'A']);
  });

  it('returns an empty array for no lines', () => {
    assert.deepEqual(groupCanonicalOrderLines([]), []);
  });
});
