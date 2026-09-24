import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItemKey,
  normalizeSkuKey,
  parcelDimsKeysFor,
  resolveParcelWithSource,
  type ParcelValues,
} from './parcel-dims';

const EMPTY: ParcelValues = { weightOz: null, lengthIn: null, widthIn: null, heightIn: null };

test('resolveParcelWithSource: the order’s own parcel wins, whole', () => {
  const r = resolveParcelWithSource(
    { weightOz: 12, lengthIn: null, widthIn: null, heightIn: null },
    { sku_parcel_key: '03796', sku_parcel_weight_oz: '20', sku_parcel_length_in: '10' },
  );
  assert.deepEqual(r, { weightOz: 12, lengthIn: null, widthIn: null, heightIn: null, source: 'order', sourceKey: null });
});

test('resolveParcelWithSource: empty order falls back to the SKU row (pg numerics as text)', () => {
  const r = resolveParcelWithSource(EMPTY, {
    sku_parcel_key: '03796',
    sku_parcel_weight_oz: '20.5',
    sku_parcel_length_in: '10',
    sku_parcel_width_in: '8',
    sku_parcel_height_in: '4',
    item_parcel_key: 'B0CXYZ',
    item_parcel_weight_oz: '99',
  });
  assert.deepEqual(r, { weightOz: 20.5, lengthIn: 10, widthIn: 8, heightIn: 4, source: 'sku', sourceKey: '03796' });
});

test('resolveParcelWithSource: no SKU memory → item number', () => {
  const r = resolveParcelWithSource(EMPTY, { item_parcel_key: 'B0CXYZ', item_parcel_weight_oz: 16 });
  assert.equal(r.source, 'item_number');
  assert.equal(r.sourceKey, 'B0CXYZ');
  assert.equal(r.weightOz, 16);
});

test('resolveParcelWithSource: nothing anywhere → source null', () => {
  assert.deepEqual(resolveParcelWithSource(EMPTY, {}), { ...EMPTY, source: null, sourceKey: null });
});

test('normalizeSkuKey / normalizeItemKey', () => {
  assert.equal(normalizeSkuKey('  ab-12 '), 'AB-12');
  assert.equal(normalizeSkuKey('   '), null);
  assert.equal(normalizeItemKey(' 000123-abc '), '123ABC');
  assert.equal(normalizeItemKey('000'), null);
});

test('parcelDimsKeysFor: one row per present key', () => {
  assert.deepEqual(parcelDimsKeysFor({ sku: '03796', itemNumber: '0B0C-XYZ' }), [
    { kind: 'sku', value: '03796' },
    { kind: 'item_number', value: 'B0CXYZ' },
  ]);
  assert.deepEqual(parcelDimsKeysFor({ sku: null, itemNumber: '' }), []);
});
