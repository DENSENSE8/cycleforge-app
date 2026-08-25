import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCounterDraft } from '@/components/counter/counter-intake-steps';
import { buildKioskSalesIntakeBody } from './kiosk-intake-payload';

test('buildKioskSalesIntakeBody — retail-only, no pay', () => {
  const draft = emptyCounterDraft();
  draft.phone = '5551234567';
  draft.retailLines = [
    {
      variationId: 'v1',
      sku: 'SKU',
      productTitle: 'Tips',
      quantity: 2,
      unitAmountCents: 500,
    },
  ];
  const body = buildKioskSalesIntakeBody(draft, { takePayment: false });
  assert.equal(body.service, 'sales');
  assert.equal(body.takePayment, false);
  // Was `serviceLine: null`; the wire carries a LIST of devices now (SQ6).
  assert.deepEqual(body.serviceLines, []);
  assert.deepEqual(body.ticketWork, { mode: 'none' });
  assert.equal(body.staffId, undefined);
});

test('buildKioskSalesIntakeBody — service + signature + step-up', () => {
  const draft = emptyCounterDraft();
  draft.phone = '5551234567';
  draft.signatureDataUrl = 'data:image/png;base64,abc';
  draft.service = {
    productModel: 'QC35',
    serialNumber: 'SN1',
    price: '129.00',
    productType: 'Headphones',
    sourceSku: 'QC35-RS',
    repairReasons: [],
    repairNotes: '',
  };
  const body = buildKioskSalesIntakeBody(draft, {
    takePayment: true,
    staffId: 9,
    pin: '123456',
  });
  assert.equal(body.takePayment, true);
  assert.equal(body.staffId, 9);
  assert.equal(body.pin, '123456');
  assert.deepEqual(body.ticketWork, { mode: 'create' });
  const serviceLines = body.serviceLines as Array<{
    productModel: string;
    price: string;
    signatureDataUrl: string;
  }>;
  assert.equal(serviceLines.length, 1, 'the draft form is single-device by construction');
  assert.equal(serviceLines[0].productModel, 'QC35');
  assert.equal(serviceLines[0].price, '129.00');
  assert.equal(serviceLines[0].signatureDataUrl, 'data:image/png;base64,abc');
});

test('buildKioskSalesIntakeBody — blank service model is omitted', () => {
  const draft = emptyCounterDraft();
  draft.phone = '5551234567';
  draft.service = {
    productModel: '  ',
    serialNumber: '',
    price: '',
  };
  const body = buildKioskSalesIntakeBody(draft, { takePayment: false });
  // Was `serviceLine: null`; the wire carries a LIST of devices now (SQ6).
  assert.deepEqual(body.serviceLines, []);
});
