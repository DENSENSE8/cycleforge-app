import test from 'node:test';
import assert from 'node:assert/strict';
import type { LocationStockTableRow } from './location-stock-row';
import { parseStockDrillScope, STOCK_DRILL_OTHER, stockDrillAisles, stockDrillLocations } from './stock-drill';
import { summarizeStockLocations } from './stock-location-summary';

function row(overrides: Partial<LocationStockTableRow>): LocationStockTableRow {
  return {
    location_id: 1,
    location_name: 'C-02-03-1-01',
    location_barcode: 'C0203101',
    room: 'Zone 3 - Parts',
    aisle: 2,
    bay: 3,
    level: 1,
    position: 1,
    sku: 'SKU-A',
    stock_id: 1,
    home_location: null,
    product_title: 'Brake lever',
    image_url: null,
    cover_photo_url: null,
    is_provisional: false,
    source: 'bin',
    qty: 1,
    min_qty: null,
    last_moved: null,
    last_counted: null,
    ...overrides,
  };
}

const offGrid = { aisle: null, bay: null, level: null, position: null } as const;

test('Other lists each resolved off-grid place once and never an unresolved placement', () => {
  const summaries = summarizeStockLocations([
    row({}),
    row({ location_id: 2, location_name: 'Rack 1 Shelf 2', location_barcode: 'RK1-2', ...offGrid }),
    row({ location_id: 2, location_name: 'Rack 1 Shelf 2', location_barcode: 'RK1-2', sku: 'SKU-B', ...offGrid }),
    // Free-written unit placement: no locations row, nothing to walk to.
    row({ location_id: null, location_name: 'back corner', location_barcode: null, source: 'unit', ...offGrid }),
  ]);

  const { aisles, other } = stockDrillAisles(summaries);
  assert.deepEqual(aisles.map((aisle) => aisle.key), [2]);
  assert.equal(other, 1);

  const scope = parseStockDrillScope({ room: 'Zone 3 - Parts', aisle: STOCK_DRILL_OTHER });
  assert.deepEqual(stockDrillLocations(summaries, scope).map((summary) => summary.face), ['Rack 1 Shelf 2']);
});
