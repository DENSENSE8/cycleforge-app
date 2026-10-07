import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupCanonicalOrderLines,
  parseSaleAmount,
  unitPriceFromLineTotal,
  type CanonicalOrderLine,
} from './canonical-order';

function line(overrides: Partial<CanonicalOrderLine> = {}): CanonicalOrderLine {
  return {
    externalOrderId: 'ORD-1',
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
    unitPrice: null,
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

describe('groupCanonicalOrderLines', () => {
  it('folds multiple lines of one order into a single order', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', sku: 'FIRST' }),
      line({ externalOrderId: 'A', sku: 'LAST' }),
    ]);
    assert.equal(grouped.length, 1);
    // `orders` is one row per line today, so the pipeline collapses onto the
    // LAST line — pinning it so a future order_line_items migration is a
    // deliberate change, not an accident.
    assert.equal(grouped[0].sku, 'LAST');
    assert.equal(grouped[0].lineCount, 2);
  });

  it('a folded multi-line order has no single unit price; a one-line order keeps its own', () => {
    const [folded, single] = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', unitPrice: '5.00' }),
      line({ externalOrderId: 'A', unitPrice: '7.00' }),
      line({ externalOrderId: 'B', unitPrice: '9.00' }),
    ]);
    assert.equal(folded.unitPrice, null);
    assert.equal(single.unitPrice, '9.00');
  });

  it('unitPriceFromLineTotal: total ÷ whole-number quantity, else null', () => {
    assert.equal(unitPriceFromLineTotal('19.99', '3'), '6.66');
    assert.equal(unitPriceFromLineTotal(78, '2'), '39.00');
    assert.equal(unitPriceFromLineTotal('10', ''), null);
    assert.equal(unitPriceFromLineTotal('10', '1.5'), null);
    assert.equal(unitPriceFromLineTotal('10', '0'), null);
    assert.equal(unitPriceFromLineTotal(null, '1'), null);
  });

  it('unions trackings across every line, de-duplicated, first-seen order', () => {
    const grouped = groupCanonicalOrderLines([
      line({ externalOrderId: 'A', trackings: ['1Z-AAA'] }),
      line({ externalOrderId: 'A', trackings: ['1Z-BBB', '1Z-AAA'] }),
    ]);
    // trackings[0] becomes the PRIMARY shipment, so order matters.
    assert.deepEqual(grouped[0].trackings, ['1Z-AAA', '1Z-BBB']);
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
