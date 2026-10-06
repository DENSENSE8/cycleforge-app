import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LocationBindContent, LocationHandlingUnit } from '@/components/mobile/scan/location-bind-types';
import { locationPath } from '@/lib/nav/route-tree';
import {
  locationScanLanding,
  readLocationScanLanding,
  withLocationScanLanding,
  withoutLocationScanOpen,
} from './location-scan-landing';

const row = (sku: string, qty: number, isProvisional = false): LocationBindContent => ({
  sku,
  qty,
  isProvisional,
  productTitle: null,
  photoIds: [],
});

const tote: LocationHandlingUnit = {
  id: 9,
  code: 'LPN-9',
  status: 'OPEN',
  totalUnits: 3,
  testedUnits: 0,
  holdUnits: 0,
  pairedOrderId: null,
  createdAt: '2026-10-05T00:00:00.000Z',
};

test('nothing loose lands on the record, even with a tote parked there', () => {
  assert.deepEqual(locationScanLanding({ contents: [], handlingUnits: [] }), { kind: 'record' });
  assert.deepEqual(locationScanLanding({ contents: [], handlingUnits: [tote] }), { kind: 'record' });
});

test('one loose SKU and no tote opens that SKU on adjust', () => {
  assert.deepEqual(locationScanLanding({ contents: [row('ABC-1', 4)], handlingUnits: [] }), { kind: 'adjust', sku: 'ABC-1' });
});

test('an on-hold placeholder at zero is an item like any other', () => {
  assert.deepEqual(locationScanLanding({ contents: [row('TMP-7', 0, true)], handlingUnits: [] }), { kind: 'adjust', sku: 'TMP-7' });
  assert.deepEqual(
    locationScanLanding({ contents: [row('ABC-1', 2), row('TMP-7', 0, true)], handlingUnits: [] }),
    { kind: 'select' },
  );
});

test('one loose SKU beside a tote asks first, so the tote is not skipped', () => {
  assert.deepEqual(locationScanLanding({ contents: [row('ABC-1', 4)], handlingUnits: [tote] }), { kind: 'select' });
});

test('two loose SKUs ask which item first', () => {
  assert.deepEqual(locationScanLanding({ contents: [row('ABC-1', 4), row('XYZ-2', 1)], handlingUnits: [] }), { kind: 'select' });
});

test('the landing round-trips through the hub href and keeps its back and proof', () => {
  const hub = `${locationPath('A0202800')}?back=%2Fm%2Fscan&verified=tok`;
  const adjust = withLocationScanLanding(hub, { kind: 'adjust', sku: 'TMP 1/2' });
  const params = new URL(adjust, 'https://x.local').searchParams;
  assert.equal(params.get('back'), '/m/scan');
  assert.equal(params.get('verified'), 'tok');
  assert.deepEqual(readLocationScanLanding(params), { sku: 'TMP 1/2', adjust: true, pick: false });

  const select = new URL(withLocationScanLanding(hub, { kind: 'select' }), 'https://x.local').searchParams;
  assert.deepEqual(readLocationScanLanding(select), { sku: null, adjust: false, pick: true });

  assert.equal(withLocationScanLanding(hub, { kind: 'record' }), hub);
});

test('once used, the sheet-opening params leave the URL; back, proof and pick stay', () => {
  const used = withoutLocationScanOpen(`${locationPath('A0202800')}?back=%2Fm%2Fscan&verified=tok&sku=ABC-1&stage=adjust&pick=1`);
  const params = new URL(used, 'https://x.local').searchParams;
  assert.equal(params.get('sku'), null);
  assert.equal(params.get('stage'), null);
  assert.equal(params.get('verified'), 'tok');
  assert.equal(params.get('back'), '/m/scan');
  assert.equal(params.get('pick'), '1');
});
