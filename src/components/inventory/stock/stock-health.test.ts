import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { stockHealth } from './StockLedger';

function row(qty: number, isProvisional = false): LocationStockTableRow {
  return { qty, is_provisional: isProvisional, sku: isProvisional ? 'TMP-1' : 'SKU-1' } as LocationStockTableRow;
}

test('positive on-hold stock appears in both physical stock and exception views', () => {
  assert.deepEqual(stockHealth(row(3, true)), ['in-stock', 'on-hold']);
});

test('zero on-hold stock remains an exception only', () => {
  assert.deepEqual(stockHealth(row(0, true)), ['on-hold']);
});
