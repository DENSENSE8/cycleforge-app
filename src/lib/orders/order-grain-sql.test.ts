import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sqlOrderHasPackScan,
  sqlOrderHasShipConfirm,
  sqlOrderHasTechScan,
  sqlOrderSerialsAgg,
  sqlTsnMatchesOrder,
} from './order-grain-sql';

test('sqlOrderHasTechScan prefers TSN.order_id and SAL metadata order_row_id', () => {
  const sql = sqlOrderHasTechScan('o');
  assert.match(sql, /tsn\.order_id = o\.id/);
  assert.match(sql, /order_row_id/);
  assert.match(sql, /TRACKING_SCANNED/);
  // Sole-shipment fallback is gated by sibling exclusion — not naked shipment EXISTS.
  assert.match(sql, /o2\.id <> o\.id/);
});

test('sqlOrderHasPackScan scopes PACK activity to the order', () => {
  const sql = sqlOrderHasPackScan('o');
  assert.match(sql, /PACK_COMPLETED/);
  assert.match(sql, /order_row_id/);
  assert.match(sql, /o2\.id <> o\.id/); // sole-shipment dual-read guard
});

test('sqlOrderHasShipConfirm is shipment-grain dock scan-out', () => {
  const sql = sqlOrderHasShipConfirm('o');
  assert.match(sql, /activity_type = 'SHIP_CONFIRM'/);
  assert.match(sql, /sal_out\.shipment_id = o\.shipment_id/);
  assert.doesNotMatch(sql, /order_row_id/);
});

test('sqlOrderSerialsAgg dual-reads sole-shipment legacy only', () => {
  const sql = sqlOrderSerialsAgg('o');
  assert.match(sql, /tsn\.order_id = o\.id/);
  assert.match(sql, /tsn\.order_id IS NULL/);
  assert.match(sql, /array_agg/);
  assert.match(sql, /o2\.id <> o\.id/);
});

test('sqlTsnMatchesOrder prefers order_id with sole-shipment dual-read', () => {
  const sql = sqlTsnMatchesOrder('o', 'tsn');
  assert.match(sql, /tsn\.order_id = o\.id/);
  assert.match(sql, /tsn\.order_id IS NULL/);
  assert.match(sql, /o2\.id <> o\.id/);
});
