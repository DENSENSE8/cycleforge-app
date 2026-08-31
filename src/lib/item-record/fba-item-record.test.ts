import assert from 'node:assert/strict';
import test from 'node:test';

import { fbaItemToItemRecords } from '@/lib/item-record/fba-item-record';
import type { FbaBoardItem } from '@/lib/fba/types';

function item(overrides: Partial<FbaBoardItem> = {}): FbaBoardItem {
  return {
    item_id: 501,
    fnsku: 'X001ABC',
    expected_qty: 12,
    actual_qty: 7,
    item_status: 'STAGING',
    display_title: 'Bose Wave Radio IV',
    asin: 'B01ABC',
    sku: '01798',
    item_notes: null,
    shipment_id: 75,
    shipment_ref: 'FBA-08/28/26',
    amazon_shipment_id: null,
    due_date: null,
    shipment_status: 'OPEN',
    destination_fc: null,
    tracking_numbers: [],
    condition: 'NEW',
    ...overrides,
  };
}

test('an FBA line reports real counted vs expected', () => {
  // The one adapter with a genuine progress pair — the shared row was built
  // around exactly this face.
  assert.deepEqual(fbaItemToItemRecords(item())[0].quantity, { counted: 7, expected: 12 });
});

test('zero staged is a real count, not a missing one', () => {
  assert.deepEqual(fbaItemToItemRecords(item({ actual_qty: 0 }))[0].quantity, {
    counted: 0,
    expected: 12,
  });
});

test('the merchant sku leads, and the fnsku is the fallback the label carries', () => {
  assert.equal(fbaItemToItemRecords(item())[0].sku, '01798');
  assert.equal(fbaItemToItemRecords(item({ sku: null }))[0].sku, 'X001ABC');
});

test('an FBA line is a fungible quantity, never serialized', () => {
  assert.deepEqual(fbaItemToItemRecords(item())[0].serials, []);
});

test('title falls back through fnsku then sku then id', () => {
  assert.equal(fbaItemToItemRecords(item({ display_title: '' }))[0].title, 'X001ABC');
  assert.equal(
    fbaItemToItemRecords(item({ display_title: '', fnsku: '' }))[0].title,
    '01798',
  );
  assert.equal(
    fbaItemToItemRecords(item({ display_title: '', fnsku: '', sku: null }))[0].title,
    'Item 501',
  );
});
