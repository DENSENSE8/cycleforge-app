import test from 'node:test';
import assert from 'node:assert/strict';
import { labelPurchaseBody } from './label-purchase-response';
import type { PurchasedLabel } from './order-label-purchase';

const label: PurchasedLabel = {
  purchaseId: 31,
  labelId: 'se-4242',
  trackingNumber: '9400100000000000000001',
  carrierCode: 'stamps_com',
  serviceCode: 'usps_ground_advantage',
  cost: 5.42,
  currency: 'USD',
  labelUrl: 'https://api.shipstation.com/v2/downloads/se-4242.pdf',
};

test('a fresh buy answers the label, its Labels-view row and no idempotent flag', () => {
  const body = labelPurchaseBody({
    label,
    finished: { shipmentId: 77, labelDocumentId: 88, labelIngestionId: 91, warning: null },
    purpose: 'outbound',
    idempotent: false,
  });
  assert.equal('idempotent' in body, false);
  assert.equal(body.labelIngestionId, 91);
  assert.equal(body.labelDocumentId, 88);
  assert.equal(body.shipmentId, 77);
  assert.equal(body.purchaseId, 31);
  assert.equal(body.tracking, label.trackingNumber);
});

test('a replay is flagged idempotent and carries a missing Labels-view row as null with its warning', () => {
  const body = labelPurchaseBody({
    label,
    finished: { shipmentId: null, labelDocumentId: null, labelIngestionId: null, warning: 'storing failed' },
    purpose: 'replacement',
    idempotent: true,
  });
  assert.equal(body.idempotent, true);
  assert.equal(body.labelIngestionId, null);
  assert.equal(body.warning, 'storing failed');
  assert.equal(body.purpose, 'replacement');
});
