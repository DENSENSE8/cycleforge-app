import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cartonLineTitle,
  cartonStage,
  cartonTitle,
  cartonUnboxBlock,
  cartonUnboxRow,
  type CartonHubData,
  type CartonHubLine,
} from './carton-hub';

function line(overrides: Partial<CartonHubLine> = {}): CartonHubLine {
  return {
    id: 1,
    sku: 'SKU-1',
    item_name: 'Listing text',
    quantity_expected: 1,
    quantity_received: 0,
    workflow_status: 'EXPECTED',
    ...overrides,
  };
}

function carton(lines: CartonHubLine[], overrides: Partial<CartonHubData['receiving']> = {}): CartonHubData {
  return {
    receiving: {
      id: 42,
      tracking: null,
      carrier: null,
      source: 'zoho_po',
      source_platform: null,
      intake_type: null,
      is_return: false,
      return_platform: null,
      return_reason: null,
      target_channel: null,
      qa_status: null,
      condition_grade: null,
      zoho_purchaseorder_id: 'po-1',
      zoho_purchaseorder_number: 'PO-00012',
      received_at: null,
      unboxed_at: null,
      created_at: null,
      ...overrides,
    },
    purchase_orders: [{ zoho_purchaseorder_id: 'po-1', zoho_purchaseorder_number: 'PO-00012', line_count: lines.length }],
    lines,
    totals: { expected: lines.length, received: 0, lines: lines.length, lines_complete: 0 },
    events: [],
  };
}

test('a line title obeys the SKU identity law: the catalog title is authoritative', () => {
  assert.equal(cartonLineTitle(line({ zoho_item_title: 'Bose Wave Radio', catalog_product_title: 'Marketplace title' })), 'Marketplace title');
  assert.equal(cartonLineTitle(line({ item_name: null, sku: null })), 'Line L-1');
});

test('the carton stage is its slowest line', () => {
  assert.equal(cartonStage([line({ workflow_status: 'DONE' }), line({ workflow_status: 'UNBOXED' })]), 'UNBOXED');
  assert.equal(cartonStage([line({ workflow_status: null }), line({ workflow_status: 'PASSED' })]), 'EXPECTED');
  assert.equal(cartonStage([]), 'EXPECTED');
});

test('the card title names the one item, else the PO, else the item count', () => {
  assert.equal(cartonTitle(carton([line({ zoho_item_title: 'Bose Wave Radio' })])), 'Bose Wave Radio');
  assert.equal(cartonTitle(carton([line({ id: 1 }), line({ id: 2, item_name: 'Other' })])), 'PO PO-00012');
  const noPo = carton([line({ id: 1 }), line({ id: 2, item_name: 'Other' })], { zoho_purchaseorder_number: null });
  noPo.purchase_orders = [];
  assert.equal(cartonTitle(noPo), '2 items in this carton');
});

test('Unbox is refused only for what the read already shows', () => {
  assert.match(cartonUnboxBlock(carton([])) ?? '', /No lines/);
  assert.match(cartonUnboxBlock(carton([line({ workflow_status: 'UNBOXED' }), line({ workflow_status: 'DONE' })])) ?? '', /already unboxed/);
  assert.equal(cartonUnboxBlock(carton([line({ workflow_status: 'UNBOXED' }), line({ workflow_status: 'MATCHED' })])), null);
});

test('the receive lane reads the carton source, not a line guess', () => {
  const row = cartonUnboxRow(carton([line({ receiving_type: 'PO' })], { source: 'unmatched', intake_type: 'RETURN' }));
  assert.deepEqual(row, {
    receiving_id: 42,
    receiving_source: 'unmatched',
    zoho_purchaseorder_id: 'po-1',
    intake_type: null,
    receiving_type: 'PO',
    carton_intake_type: 'RETURN',
  });
});
