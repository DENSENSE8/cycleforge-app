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

  it('leaves saleAmount and currency unset so a sync never rewrites them', () => {
    const lines = mapEcwidOrdersToCanonicalLines([
      { orderNumber: '1', items: [{ sku: 'S', price: 42 }] },
    ]);
    assert.equal(lines[0].saleAmount, null);
    assert.equal(lines[0].currency, null);
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
