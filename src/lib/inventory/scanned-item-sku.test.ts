import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveScannedItemSku } from './scanned-item-sku';

type FetchStub = typeof globalThis.fetch;

const realFetch = globalThis.fetch;
let calls: URL[] = [];
/** SKUs the stubbed route answers with, keyed by `${kind}:${value}`. */
let served = new Map<string, string[]>();

beforeEach(() => {
  calls = [];
  served = new Map();
  const stub: FetchStub = async (input) => {
    const url = new URL(String(input), 'http://lane.test');
    calls.push(url);
    const key = `${url.searchParams.get('kind')}:${url.searchParams.get('value')}`;
    return Response.json({ success: true, skus: served.get(key) ?? [] });
  };
  globalThis.fetch = stub;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const AT_LOCATION = ['BOSE-QC35-BLK', 'sony-wh1000xm4'];

test('a SKU read matches the location rows locally — exact, then case-blind — with no request', async () => {
  assert.equal(await resolveScannedItemSku('  BOSE-QC35-BLK ', AT_LOCATION), 'BOSE-QC35-BLK');
  assert.equal(await resolveScannedItemSku('SONY-WH1000XM4', AT_LOCATION), 'sony-wh1000xm4');
  assert.equal(calls.length, 0);
});

test('location labels, carrier tracking and order numbers return null without a request', async () => {
  for (const raw of [
    'A-01-01-1',
    'A0101101',
    'RK12-3',
    '1Z999AA10123456784',
    '9400111899223397846185',
    'TBA123456789012',
    '111-1234567-1234567',
    '12-34567-89012',
    'R-42',
  ]) {
    assert.equal(await resolveScannedItemSku(raw, AT_LOCATION), null, raw);
  }
  assert.equal(calls.length, 0);
});

test('a 12-digit UPC-A is looked up as a product barcode, not routed as FedEx tracking', async () => {
  served.set('barcode:036000291452', ['BOSE-QC35-BLK']);
  assert.equal(await resolveScannedItemSku('036000291452', AT_LOCATION), 'BOSE-QC35-BLK');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/api/sku-catalog/scanned-item');
});

test('an FNSKU maps through the lookup onto the location row, case-blind', async () => {
  served.set('fnsku:X001ABCDEF', ['SONY-WH1000XM4']);
  assert.equal(await resolveScannedItemSku('x001abcdef', AT_LOCATION), 'sony-wh1000xm4');
});

test('a house unit label is looked up by its handle', async () => {
  served.set('unit:SN-778', ['BOSE-QC35-BLK']);
  assert.equal(await resolveScannedItemSku('U-SN-778', AT_LOCATION), 'BOSE-QC35-BLK');
});

test('a barcode whose SKU is not at this location → null', async () => {
  served.set('barcode:036000291452', ['APPLE-AIRPODS-2']);
  assert.equal(await resolveScannedItemSku('036000291452', AT_LOCATION), null);
  assert.equal(calls.length, 1);
});

test('a failed lookup reads as "not here", never a throw', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('network down');
  }) as FetchStub;
  assert.equal(await resolveScannedItemSku('036000291452', AT_LOCATION), null);

  globalThis.fetch = (async () => new Response('nope', { status: 500 })) as FetchStub;
  assert.equal(await resolveScannedItemSku('X001ABCDEF', AT_LOCATION), null);
});
