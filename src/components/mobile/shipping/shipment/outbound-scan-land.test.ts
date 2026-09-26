import { test } from 'node:test';
import { strictEqual } from 'node:assert';

import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { outboundScanHref } from './outbound-scan-land';

function record(patch: Partial<ShipmentRecord>): ShipmentRecord {
  return {
    shipmentId: 52848,
    tracking: '1Z23A1E90383534572',
    carrier: 'UPS',
    trackingUrl: null,
    status: { category: null, label: null, description: null, latestEventAt: null, isDelivered: false, hasException: false },
    pack: null,
    shipOut: null,
    carrierMilestones: {
      labelCreatedAt: null,
      acceptedAt: null,
      inTransitAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      exceptionAt: null,
    },
    sync: { lastCheckedAt: null, lastErrorCode: null, lastErrorMessage: null },
    box: null,
    items: [],
    siblings: [],
    exception: null,
    photos: [],
    actions: [],
    ...patch,
  };
}

const line = {
  orderRowId: 7109,
  orderRef: 'FBA19JY9D8PV',
  channel: 'fba',
  sku: null,
  title: 'Speaker',
  photoUrl: null,
  quantity: 1,
  condition: null,
  orderStatus: null,
  serials: [],
};

test('a tracking with no outbound evidence is not claimed — the scan still intakes', () => {
  strictEqual(outboundScanHref(record({}), '/m/scan'), null);
});

test('an unmatched pack scan lands on the package hub with an X back to the scan', () => {
  const exception = { id: 3371, reason: 'not_found', status: 'open', notes: null, sourceStation: null, staffName: null, createdAt: null };
  strictEqual(outboundScanHref(record({ exception }), '/m/scan'), '/m/shipping/shipments/52848?back=%2Fm%2Fscan');
});

test('a scanned-out box lands on its package even when it carries order lines', () => {
  const shipOut = { at: '2026-08-28T23:00:00Z', staffId: 1, staffName: 'Michael', backfilled: true };
  strictEqual(
    outboundScanHref(record({ shipOut, items: [line] }), '/m/scan'),
    '/m/shipping/shipments/52848?back=%2Fm%2Fscan',
  );
});

test('a label with open order work (not packed, not shipped) lands on the order hub by pk', () => {
  strictEqual(outboundScanHref(record({ items: [line] }), '/m/scan'), '/m/orders/7109?by=id&back=%2Fm%2Fscan');
});
