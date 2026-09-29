import assert from 'node:assert/strict';
import test from 'node:test';
import { labelBuyBodySchema, labelBuyProductsQuerySchema, labelBuyRatesBodySchema, toLabelBuyProduct } from './contracts';

const SHIP_TO = {
  name: 'Ada Buyer',
  addressLine1: '1 Main St',
  cityLocality: 'Portland',
  stateProvince: 'OR',
  postalCode: '97201',
  countryCode: 'us',
};
const PARCEL = { weight: { value: 12, unit: 'ounce' }, dimensions: { length: 10, width: 8, height: 4, unit: 'inch' } };
const BUY = {
  purpose: 'outbound',
  shipTo: SHIP_TO,
  parcel: PARCEL,
  clientEventId: '6f1c1b3e-6a55-4c1e-9a1e-2d5f7c0b9a11',
  rateId: 'se-rate-1',
  carrierId: 'se-carrier-1',
  serviceCode: 'usps_priority_mail',
};

test('buy body: the reference is optional — blank or absent is none, text is trimmed, >64 refused', () => {
  assert.equal(labelBuyBodySchema.parse(BUY).reference, null);
  assert.equal(labelBuyBodySchema.parse({ ...BUY, reference: '   ' }).reference, null);
  assert.equal(labelBuyBodySchema.parse({ ...BUY, reference: null }).reference, null);
  assert.equal(labelBuyBodySchema.parse({ ...BUY, reference: '  RMA-7781 ' }).reference, 'RMA-7781');
  assert.equal(labelBuyBodySchema.safeParse({ ...BUY, reference: 'x'.repeat(65) }).success, false);
  assert.equal(labelBuyBodySchema.parse({ ...BUY, reference: ` ${'x'.repeat(64)} ` }).reference?.length, 64);
});

test('buy body: a product needs a catalog id or a SKU; rememberParcel defaults off', () => {
  const parsed = labelBuyBodySchema.parse(BUY);
  assert.equal(parsed.product, null);
  assert.equal(parsed.rememberParcel, false);
  assert.equal(labelBuyBodySchema.parse({ ...BUY, product: { skuCatalogId: null, sku: '  ' } }).product, null);
  assert.deepEqual(labelBuyBodySchema.parse({ ...BUY, product: { skuCatalogId: 631, sku: null } }).product, { skuCatalogId: 631, sku: null });
  assert.deepEqual(labelBuyBodySchema.parse({ ...BUY, product: { sku: ' 00192-P-1 ' } }).product, { skuCatalogId: null, sku: '00192-P-1' });
  assert.equal(labelBuyBodySchema.safeParse({ ...BUY, product: { skuCatalogId: 0 } }).success, false);
});

test('buy body: an idempotency key and the chosen rate are required; the client never sends a tenant', () => {
  for (const key of ['clientEventId', 'rateId', 'carrierId', 'serviceCode'] as const) {
    const { [key]: _omitted, ...rest } = BUY;
    assert.equal(labelBuyBodySchema.safeParse(rest).success, false, key);
  }
  assert.equal(labelBuyBodySchema.safeParse({ ...BUY, clientEventId: 'short' }).success, false);
  assert.equal(labelBuyBodySchema.safeParse({ ...BUY, organizationId: '00000000-0000-4000-8000-000000000002' }).success, false);
  assert.equal(labelBuyRatesBodySchema.safeParse({ purpose: 'outbound', shipTo: SHIP_TO, parcel: PARCEL, staffId: 3 }).success, false);
});

test('rates body: outbound, return and replacement rate; a weightless parcel does not', () => {
  for (const purpose of ['outbound', 'return', 'replacement']) {
    assert.equal(labelBuyRatesBodySchema.safeParse({ purpose, shipTo: SHIP_TO, parcel: PARCEL }).success, true, purpose);
  }
  assert.equal(labelBuyRatesBodySchema.safeParse({ purpose: 'gift', shipTo: SHIP_TO, parcel: PARCEL }).success, false);
  assert.equal(
    labelBuyRatesBodySchema.safeParse({ purpose: 'outbound', shipTo: SHIP_TO, parcel: { weight: { value: 0, unit: 'ounce' } } }).success,
    false,
  );
});

test('products query: at least 2 characters after trimming', () => {
  assert.equal(labelBuyProductsQuerySchema.safeParse({ q: ' a ' }).success, false);
  assert.equal(labelBuyProductsQuerySchema.parse({ q: ' ab ' }).q, 'ab');
  assert.equal(labelBuyProductsQuerySchema.safeParse({}).success, false);
});

const ROW = { id: '631', sku: '00192-P-1', title: 'Bose SoundLink' };

test('products mapping: the SKU record answers whole, before the item-number record', () => {
  const product = toLabelBuyProduct({
    ...ROW,
    sku_parcel_weight_oz: '16',
    item_parcel_weight_oz: '40',
    item_parcel_length_in: '12',
  });
  assert.deepEqual(product, {
    skuCatalogId: 631,
    sku: '00192-P-1',
    title: 'Bose SoundLink',
    parcel: { weightOz: 16, lengthIn: null, widthIn: null, heightIn: null },
    parcelSource: 'sku',
  });
});

test('products mapping: the item-number record answers when the SKU has none; nothing remembered is null', () => {
  const byItem = toLabelBuyProduct({ ...ROW, sku_parcel_weight_oz: '0', item_parcel_weight_oz: '40', item_parcel_height_in: 3.5 });
  assert.deepEqual(byItem.parcel, { weightOz: 40, lengthIn: null, widthIn: null, heightIn: 3.5 });
  assert.equal(byItem.parcelSource, 'item_number');

  const none = toLabelBuyProduct(ROW);
  assert.equal(none.parcel, null);
  assert.equal(none.parcelSource, null);
});

test('products mapping: a blank title falls back to the SKU, then the catalog id', () => {
  assert.equal(toLabelBuyProduct({ ...ROW, title: '  ' }).title, '00192-P-1');
  assert.equal(toLabelBuyProduct({ id: 7, sku: ' ', title: '' }).title, 'Product #7');
  assert.equal(toLabelBuyProduct({ id: 7, sku: ' ', title: '' }).sku, null);
});
