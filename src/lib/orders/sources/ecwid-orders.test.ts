import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapEcwidOrdersToCanonicalLines } from './ecwid-orders';

describe('mapEcwidOrdersToCanonicalLines', () => {
  it('maps one line per item with the sku in both identifier slots', () => {
    const lines = mapEcwidOrdersToCanonicalLines([
      {
        orderNumber: '1001',
        createDate: '2026-07-20T18:30:00.000Z',
        items: [
          { sku: 'SKU-A', name: 'Widget A', quantity: 2 },
          { sku: 'SKU-B', name: 'Widget B' },
        ],
      },
    ]);

    assert.equal(lines.length, 2);
    assert.equal(lines[0].externalOrderId, '1001');
    assert.equal(lines[0].sku, 'SKU-A');
    // Ecwid has ONE identifier; the writer probes both keys for catalog match.
    assert.equal(lines[0].itemNumber, 'SKU-A');
    assert.equal(lines[0].productTitle, 'Widget A');
    assert.equal(lines[0].quantity, '2');
    assert.equal(lines[0].accountSource, 'ecwid');
    // A blank quantity is one unit, not zero.
    assert.equal(lines[1].quantity, '1');
  });

  it('never sets a ship-by date', () => {
    // Ecwid has no ship-by concept. It once received the order's own placement
    // date, which made every Ecwid order due at checkout — overdue before it
    // was even ingested. An unknown ship-by is null.
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', createDate: '2026-07-20T18:30:00.000Z', items: [{ sku: 'S' }] },
    ]);
    assert.equal(lines[0].shipByDate, null);
    assert.equal(lines[0].orderDate?.toISOString(), '2026-07-20T18:30:00.000Z');
  });

  it("prefers the item's own line total over unit price × quantity", () => {
    // Ecwid applies per-line coupon and volume discounts, so where a payload
    // carries a line total it already reflects them and 4 × 50 does not.
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', items: [{ sku: 'S', price: 50, quantity: 4, total: 180 }] },
    ]);
    assert.equal(lines[0].saleAmount, '180.00');
  });

  it('multiplies the per-unit price by the quantity', () => {
    // `item.price` is PER UNIT. Emitting it raw booked a fraction of the real
    // revenue on every multi-unit line.
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', items: [{ sku: 'S', price: 18.88, quantity: 2 }] },
    ]);
    // Exact cents: 18.88 * 2 in floating point is 37.759999999999998.
    assert.equal(lines[0].saleAmount, '37.76');
  });

  it("rounds away the float dust Ecwid itself serializes", () => {
    // A live $36.88 line arrives from the API as 36.879999999999995. Writing
    // that through leans on numeric(12,2) to round it silently and makes every
    // report of the number unreadable.
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', items: [{ sku: 'S', price: 36.879999999999995 }] },
    ]);
    assert.equal(lines[0].saleAmount, '36.88');
  });

  it('treats an absent or unparseable price as unknown, never as zero', () => {
    // A zero is a claim the order was free, and the writer treats a non-null
    // saleAmount as authoritative — it would overwrite an operator's corrected
    // number on the next sync with no source value left to restore it from.
    const missing = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', items: [{ sku: 'S', quantity: 3 }] },
    ]);
    assert.equal(missing[0].saleAmount, null);

    const junk = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '2', items: [{ sku: 'S', price: 'n/a', quantity: 2 }] },
    ]);
    assert.equal(junk[0].saleAmount, null);
  });

  it('never books the order total as line revenue', () => {
    // Order-level `total` carries tax and shipping; a line's sale amount is
    // merchandise only.
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', total: 74.15, items: [{ sku: 'S', price: 28, quantity: 2 }] },
    ]);
    assert.equal(lines[0].saleAmount, '56.00');
  });

  it('still skips a priced repair-service line', () => {
    const lines = mapEcwidOrdersToCanonicalLines([
      {
        orderNumber: '1',
        items: [
          { sku: 'UPS-25', price: 25 },
          { sku: '00004-RS', price: 125 },
        ],
      },
    ]);
    assert.deepEqual(
      lines.map((line) => line.sku),
      ['UPS-25'],
    );
  });

  it('carries an order currency through, and stays null when absent', () => {
    const [withCurrency] = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', currency: 'cad', items: [{ sku: 'S', price: 10 }] },
    ]);
    assert.equal(withCurrency.currency, 'CAD');

    // Null, not 'USD': the writer defaults on insert but must not rewrite an
    // existing order's currency from a source that never knew it.
    const [withoutCurrency] = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '2', items: [{ sku: 'S', price: 10 }] },
    ]);
    assert.equal(withoutCurrency.currency, null);
  });

  it('falls back through the order-id and tracking shapes Ecwid has used', () => {
    const byId = mapEcwidOrdersToCanonicalLines([{ id: '2002', items: [{ sku: 'S' }] }]);
    assert.equal(byId[0].externalOrderId, '2002');

    const nested = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '3', shippingInfo: { trackingNumber: '1Z-NESTED' }, items: [{ sku: 'S' }] },
    ]);
    assert.deepEqual(nested[0].trackings, ['1Z-NESTED']);

    const flat = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '4', shippingTrackingNumber: '1Z-FLAT', items: [{ sku: 'S' }] },
    ]);
    assert.deepEqual(flat[0].trackings, ['1Z-FLAT']);
  });

  it('skips repair-service SKUs, which are a charge and not a resold unit', () => {
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', items: [{ sku: 'REPAIR-RS' }, { sku: 'real-rs' }, { sku: 'KEEP' }] },
    ]);
    assert.deepEqual(lines.map((l) => l.sku), ['KEEP']);
  });

  it('still emits one line for an order with no items', () => {
    const lines = mapEcwidOrdersToCanonicalLines([{ orderNumber: '1', items: [] }]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].sku, '');
    assert.equal(lines[0].quantity, '1');
  });

  it('drops orders with no usable id, and survives null entries', () => {
    const lines = mapEcwidOrdersToCanonicalLines([
      { items: [{ sku: 'S' }] },
      null,
      { orderNumber: '  ', items: [{ sku: 'S' }] },
      { orderNumber: '9', items: [{ sku: 'S' }] },
    ]);
    assert.deepEqual(lines.map((l) => l.externalOrderId), ['9']);
  });

  it('carries the buyer note from either comment field', () => {
    const customer = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', customerComments: 'leave at door', items: [{ sku: 'S' }] },
    ]);
    assert.equal(customer[0].notes, 'leave at door');

    const order = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '2', orderComments: 'gift wrap', items: [{ sku: 'S' }] },
    ]);
    assert.equal(order[0].notes, 'gift wrap');
  });

  it('treats an unparseable placement date as unknown, not now', () => {
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', createDate: 'not-a-date', items: [{ sku: 'S' }] },
    ]);
    assert.equal(lines[0].orderDate, null);
  });
});
