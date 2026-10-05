import test from 'node:test';
import assert from 'node:assert/strict';
import type { LocationStockTableRow } from './location-stock-row';
import { stockLocationMatches, summarizeStockLocations } from './stock-location-summary';

function row(overrides: Partial<LocationStockTableRow> = {}): LocationStockTableRow {
  return {
    location_id: 7,
    location_name: 'C-01-02-1-03',
    location_barcode: 'C0102103',
    room: 'Parts',
    aisle: 1,
    bay: 2,
    level: 1,
    position: 3,
    sku: 'SKU-A',
    stock_id: 44,
    home_location: null,
    product_title: 'Brake lever',
    image_url: null,
    cover_photo_url: null,
    is_provisional: false,
    source: 'bin',
    qty: 2,
    last_moved: '2026-09-30T10:00:00.000Z',
    last_counted: null,
    ...overrides,
  };
}

test('summaries produce one dense row per physical location and retain all source rows', () => {
  const result = summarizeStockLocations([
    row(),
    row({ sku: 'SKU-B', product_title: 'Rotor', qty: 3, source: 'unit', last_moved: '2026-09-30T11:00:00.000Z' }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.quantity, 5);
  assert.equal(result[0]?.skuCount, 2);
  assert.equal(result[0]?.rows.length, 2);
  assert.equal(result[0]?.lastTouched, '2026-09-30T11:00:00.000Z');
});

test('unlocated exceptions stay visible but cannot masquerade as scannable locations', () => {
  const [summary] = summarizeStockLocations([
    row({ location_id: null, location_name: null, location_barcode: null, source: 'exception', is_provisional: true }),
  ]);

  assert.equal(summary?.face, 'Unlocated');
  assert.equal(summary?.routeCode, null);
  assert.equal(summary?.hasException, true);
  assert.equal(summary?.hasOnHold, true);
});

test('contextual search finds faces without punctuation, SKU and title', () => {
  const [summary] = summarizeStockLocations([row()]);
  assert.ok(summary);
  assert.equal(stockLocationMatches(summary, 'C0102103'), true);
  assert.equal(stockLocationMatches(summary, 'sku-a'), true);
  assert.equal(stockLocationMatches(summary, 'brake'), true);
  assert.equal(stockLocationMatches(summary, 'unrelated'), false);
});

test('zero-count placeholders are cleanup, not active stock', () => {
  const [summary] = summarizeStockLocations([
    row({ sku: 'TMP-EMPTY', qty: 0, source: 'exception', is_provisional: true }),
  ]);

  assert.equal(summary?.quantity, 0);
  assert.equal(summary?.skuCount, 0);
  assert.equal(summary?.empty, true);
  assert.equal(summary?.hasOnHold, false);
  assert.equal(summary?.hasCleanup, true);
});

test('a scannable code decides the coordinates when legacy labels disagree', () => {
  // Barcode says aisle 03, bay 10 (even → right side); stale labels say aisle 1, bay 1.
  const [summary] = summarizeStockLocations([
    row({ location_name: 'C-03-10-3-05', location_barcode: 'C0310305', aisle: 1, bay: 1, level: 1, position: 1 }),
  ]);

  assert.deepEqual(
    [summary?.aisle, summary?.bay, summary?.level, summary?.position],
    [3, 10, 3, 5],
  );
});

test('a place without a scannable code keeps its labelled coordinates', () => {
  const [summary] = summarizeStockLocations([row({ location_barcode: 'STORAGE-B', aisle: null, bay: 4, level: 2, position: 1 })]);

  assert.equal(summary?.aisle, null);
  assert.equal(summary?.bay, null);
  assert.equal(summary?.level, null);
});
