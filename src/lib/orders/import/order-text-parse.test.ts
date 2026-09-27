import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrderText } from './order-text-parse';

test('a typed phone-order note → customer, ship-to, priced lines, tracking', () => {
  const order = parseOrderText(
    [
      'Order #: 70011234',
      'Customer: Jane Doe',
      'Phone: (555) 201-8844',
      'jane@example.com',
      'Ship to:',
      '123 Main St',
      'Apt 4',
      'Springfield, IL 62704',
      '2 x Bose Wave remote @ $39.00',
      'black bose 151 bracket x1 - $25 each',
      'Ship by Friday',
      'Tracking: 1Z999AA10123456784',
    ].join('\n'),
  );
  assert.ok(order);
  assert.equal(order.orderNumber, '70011234');
  assert.equal(order.customerName, 'Jane Doe');
  assert.equal(order.customerEmail, 'jane@example.com');
  assert.deepEqual(order.shipTo, { address1: '123 Main St', address2: 'Apt 4', city: 'Springfield', state: 'IL', postalCode: '62704', country: 'US' });
  assert.deepEqual(
    order.lines.map((l) => [l.title, l.quantity, l.unitPrice]),
    [['Bose Wave remote', 2, 39], ['black bose 151 bracket', 1, 25]],
  );
  assert.equal(order.shipBy, 'Friday');
  assert.equal(order.trackingNumber, '1Z999AA10123456784');
});

test('labelled product blocks become one line each; prose with no order facts is nothing', () => {
  const order = parseOrderText('Item: Bose remote\nSKU: 00366-P-1\nQty: 3\nPrice: $12.50\nItem: Bracket\nSKU: 00192-P-1-BK');
  assert.deepEqual(
    order?.lines.map((l) => [l.title, l.sku, l.quantity, l.unitPrice]),
    [['Bose remote', '00366-P-1', 3, 12.5], ['Bracket', '00192-P-1-BK', null, null]],
  );
  assert.equal(parseOrderText('thanks, talk soon'), null);
});
