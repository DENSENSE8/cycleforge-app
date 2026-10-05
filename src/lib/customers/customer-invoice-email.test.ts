import assert from 'node:assert/strict';
import test from 'node:test';
import { customerInvoiceEmail } from './customer-invoice-email';

test('customer invoice email carries public order facts and escapes customer data', () => {
  const email = customerInvoiceEmail({
    customerName: 'A & B <buyer>',
    order: {
      orderRef: 'WEB-100',
      primaryOrderId: 41,
      placedAt: '2026-10-04T12:00:00.000Z',
      status: 'fulfilled',
      platform: 'online',
      totalAmount: 42.5,
      currency: 'USD',
      items: [{ id: 1, title: 'Headphones <Black>', sku: 'HP&1', itemNumber: null, condition: 'new', quantity: 2, amount: 42.5, currency: 'USD' }],
    },
  });

  assert.equal(email.subject, 'Invoice for order WEB-100');
  assert.match(email.text, /2 × Headphones <Black> · SKU HP&1/);
  assert.match(email.text, /Total: \$42\.50/);
  assert.doesNotMatch(email.html, /A & B <buyer>/);
  assert.match(email.html, /A &amp; B &lt;buyer&gt;/);
  assert.doesNotMatch(email.html, /Headphones <Black>/);
  assert.match(email.html, /Headphones &lt;Black&gt;/);
  assert.doesNotMatch(email.html, /Customer id|primaryOrderId|41/);
});
