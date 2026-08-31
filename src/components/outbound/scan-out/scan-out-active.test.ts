import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultToScanOutPane } from '@/components/outbound/scan-out/scan-out-active';

test('resultToScanOutPane maps API carton fields onto the focus pane', () => {
  const pane = resultToScanOutPane(
    {
      shipmentId: 42,
      tracking: '1Z999AA10123456784',
      orderRowId: 7,
      orderId: '67673063',
      productTitle: 'Bose SoundDock',
      sku: 'BOSE-SD',
      itemNumber: '123',
      condition: 'USED',
      quantity: 2,
      accountSource: 'ebay',
    },
    'ok',
    '1Z999AA10123456784',
  );
  assert.equal(pane.shipmentId, 42);
  assert.equal(pane.orderRowId, 7);
  assert.equal(pane.orderId, '67673063');
  assert.equal(pane.qty, 2);
  assert.equal(pane.status, 'ok');
  assert.equal(pane.scanDriven, true);
  assert.equal(pane.tracking, '1Z999AA10123456784');
});

test('resultToScanOutPane falls back to the raw scan when tracking is empty', () => {
  const pane = resultToScanOutPane({}, 'pending', 'TRACK-RAW');
  assert.equal(pane.tracking, 'TRACK-RAW');
  assert.equal(pane.productTitle, 'TRACK-RAW');
  assert.equal(pane.qty, 1);
  assert.equal(pane.status, 'pending');
});
