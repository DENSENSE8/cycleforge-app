import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { stockHealth } from './StockLedger';

function row(qty: number, isProvisional = false, minQty: number | null = null): LocationStockTableRow {
  return { qty, min_qty: minQty, is_provisional: isProvisional, sku: isProvisional ? 'TMP-1' : 'SKU-1', source: 'bin' } as LocationStockTableRow;
}

test('positive on-hold stock appears in both physical stock and exception views', () => {
  assert.deepEqual(stockHealth(row(3, true)), ['in-stock', 'on-hold']);
});

test('zero on-hold stock appears in both out-of-stock and exception views', () => {
  assert.deepEqual(stockHealth(row(0, true)), ['out-of-stock', 'on-hold']);
});

test('zero catalog stock appears only in the out-of-stock view', () => {
  assert.deepEqual(stockHealth(row(0)), ['out-of-stock']);
});

test('empty locations are capacity, not out-of-stock items', () => {
  assert.deepEqual(stockHealth({ ...row(0), source: 'empty', sku: '' }), []);
});

test('stock at or below its reorder threshold appears in Low stock', () => {
  assert.deepEqual(stockHealth(row(2, false, 2)), ['in-stock', 'low-stock']);
  assert.deepEqual(stockHealth(row(0, false, 1)), ['out-of-stock', 'low-stock']);
});
