import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseDeadStockRow,
  parseSkuVelocityRow,
  utilizationToBinRow,
} from './report-rows';

describe('utilizationToBinRow', () => {
  it('maps fill_ratio onto fill_pct and in_bin onto total_qty', () => {
    const row = utilizationToBinRow({
      bin_id: 9,
      bin_name: 'A-12',
      barcode: 'BIN-A12',
      room: 'Main',
      row_label: 'A',
      col_label: '12',
      capacity: 40,
      in_bin: 10,
      fill_ratio: 0.25,
      sku_count: 3,
    });
    assert.equal(row.id, 9);
    assert.equal(row.barcode, 'BIN-A12');
    assert.equal(row.name, 'A-12');
    assert.equal(row.total_qty, 10);
    assert.equal(row.fill_pct, 25);
    assert.equal(row.sku_count, 3);
    assert.equal(row.is_empty, false);
    assert.equal(row.is_over_capacity, false);
  });
});

describe('parseSkuVelocityRow', () => {
  it('coerces movement facts', () => {
    const row = parseSkuVelocityRow({
      sku: 'X',
      product_title: 'Thing',
      velocity_tier: 'A',
      out_qty: 50,
      in_qty: 2,
      current_stock: 1,
    });
    assert.equal(row.sku, 'X');
    assert.equal(row.velocity_tier, 'A');
    assert.equal(row.out_qty, 50);
  });
});

describe('parseDeadStockRow', () => {
  it('coerces dormancy facts', () => {
    const row = parseDeadStockRow({
      sku: 'X',
      product_title: null,
      stock: 4,
      days_dormant: 91,
    });
    assert.equal(row.sku, 'X');
    assert.equal(row.product_title, null);
    assert.equal(row.days_dormant, 91);
  });
});
