/**
 * "Received" rail meter = inventory-confirmed qty. Unboxed (pending confirm)
 * must read 0/expected with an empty bar — not floor quantity_received.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  floorQtyFractionTip,
  inventoryReceivedDisplayQty,
  isRailQtyInventoryComplete,
  RAIL_QTY,
} from './quantity';

function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 10,
    tracking_number: '1Z999',
    carrier: 'UPS',
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: 'PO-1',
    zoho_purchaseorder_number: 'PO-1',
    item_name: 'Widget',
    sku: 'WDG',
    quantity_received: 0,
    quantity_expected: 1,
    qa_status: 'PENDING',
    workflow_status: 'MATCHED',
    disposition_code: 'HOLD',
    condition_grade: 'BRAND_NEW',
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    receiving_source: 'po',
    ...overrides,
  };
}

test('UNBOXED with floor qty 1 still displays Received 0/1', () => {
  const r = row({ workflow_status: 'UNBOXED', quantity_received: 1, quantity_expected: 1 });
  assert.equal(isRailQtyInventoryComplete(r), false);
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 0, total: 1 });
  assert.deepEqual(RAIL_QTY.received.getPreviewQty(r), { current: 0, total: 1 });
});

test('DONE displays actual quantity_received', () => {
  const r = row({ workflow_status: 'DONE', quantity_received: 1, quantity_expected: 1 });
  assert.equal(isRailQtyInventoryComplete(r), true);
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 1, total: 1 });
});

test('DONE with Zoho still issued displays 1/1 — local receive is the rail face', () => {
  const r = row({
    workflow_status: 'DONE',
    zoho_status: 'issued',
    zoho_purchaseorder_id: 'PO-1',
    quantity_received: 1,
    quantity_expected: 1,
  });
  assert.equal(isRailQtyInventoryComplete(r), true);
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 1, total: 1 });
});

test('Zoho-received-like displays actual qty even if workflow lags on UNBOXED', () => {
  const r = row({
    workflow_status: 'UNBOXED',
    quantity_received: 1,
    quantity_expected: 1,
    zoho_status: 'received',
  });
  assert.equal(isRailQtyInventoryComplete(r), true);
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 1, total: 1 });
});

test('unfound carton unboxed locally displays received qty', () => {
  const r = row({
    receiving_source: 'unmatched',
    workflow_status: 'ARRIVED',
    quantity_received: 1,
    quantity_expected: 1,
    unboxed_at: '2026-01-02T00:00:00Z',
    zoho_purchaseorder_id: null,
  });
  assert.equal(isRailQtyInventoryComplete(r), true);
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 1, total: 1 });
});

test('scanned strategy is unchanged (door-scan fill, not inventory gate)', () => {
  const r = row({ workflow_status: 'MATCHED', quantity_received: 0, quantity_expected: 2 });
  assert.deepEqual(RAIL_QTY.scanned.getPreviewQty(r), { current: 2, total: 2 });
});

test('floorQtyFractionTip uses counted, never received', () => {
  assert.equal(floorQtyFractionTip(1, 1), '1 of 1 counted');
  assert.match(floorQtyFractionTip(2, null), /2 counted/);
  assert.doesNotMatch(floorQtyFractionTip(1, 1), /received/i);
});
