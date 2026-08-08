import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  filterLinesByPoGroup,
  getReceivingPoGroupTitle,
  getReceivingPoIdentityParts,
  isReceivingPoGroupTitleRow,
  receivingAdaptiveRailTitle,
  receivingPoGroupKey,
  receivingProductTitle,
  receivingRailRowTitle,
  receivingWorkspaceLineTitle,
  stampPoRailTitleContext,
} from './po-group-title';

const identity = (raw: string) => raw;

function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 10,
    tracking_number: '1Z999',
    carrier: 'UPS',
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: 'Widget',
    sku: 'WDG',
    quantity_received: 1,
    quantity_expected: 1,
    qa_status: 'PENDING',
    workflow_status: 'DONE',
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
    receiving_source: 'zoho_po',
    ...overrides,
  };
}

test('getReceivingPoGroupTitle — Zoho PO 63598685', () => {
  const r = row({
    zoho_purchaseorder_number: '63598685',
    zoho_purchaseorder_id: '63598685',
    item_name: '(2) Bose Companion 2 Series II Multimedia Speakers',
  });
  assert.equal(getReceivingPoGroupTitle(r, identity), 'PO 63598685');
});

test('getReceivingPoGroupTitle — platform prefix when source_platform set', () => {
  const r = row({
    zoho_purchaseorder_number: '63598685',
    source_platform: 'amazon',
  });
  assert.equal(getReceivingPoGroupTitle(r, (p) => (p === 'amazon' ? 'Amazon' : p)), 'Amazon · PO 63598685');
});

test('isReceivingPoGroupTitleRow — unfound stub is excluded', () => {
  const r = row({
    receiving_source: 'unmatched',
    item_name: 'Unfound PO',
    zoho_purchaseorder_number: null,
  });
  assert.equal(isReceivingPoGroupTitleRow(r), false);
});

test('receivingRailRowTitle — po-group mode keeps unfound product label', () => {
  const r = row({
    receiving_source: 'unmatched',
    item_name: 'Unfound PO',
  });
  assert.equal(receivingRailRowTitle(r, 'po-group', identity), 'Unfound order');
});

test('receivingRailRowTitle — marketplace order without Zoho PO', () => {
  const r = row({
    receiving_source: 'ebay',
    inbound_source_type: 'ebay',
    source_order_id: '12-34567-89012',
    platform_account_label: 'USAV-Buyer',
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: 'Vintage receiver',
  });
  assert.equal(
    receivingRailRowTitle(r, 'po-group', (p) => (p === 'ebay' ? 'eBay' : p)),
    'eBay · USAV-Buyer · Order 12-34567-89012',
  );
});

test('getReceivingPoIdentityParts — eBay-only row uses source_order_id as Order', () => {
  const parts = getReceivingPoIdentityParts(
    row({
      inbound_source_type: 'ebay',
      source_order_id: '05-14843-41472',
      platform_account_label: 'Buyer-A',
      zoho_purchaseorder_id: null,
      zoho_purchaseorder_number: null,
    }),
    (p) => (p === 'ebay' ? 'eBay' : p),
  );
  assert.equal(parts.poValue, '05-14843-41472');
  assert.equal(parts.idPrefix, 'Order');
  assert.equal(parts.platformLabel, 'eBay');
  assert.equal(parts.accountLabel, 'Buyer-A');
});

test('getReceivingPoIdentityParts — Zoho PO wins over eBay source_order_id', () => {
  const parts = getReceivingPoIdentityParts(
    row({
      inbound_source_type: 'ebay',
      source_order_id: '05-14843-41472',
      zoho_purchaseorder_id: 'zoho-1',
      zoho_purchaseorder_number: 'PO-99',
    }),
    identity,
  );
  assert.equal(parts.poValue, 'PO-99');
  assert.equal(parts.idPrefix, 'PO');
});

test('getReceivingPoIdentityParts — Ecwid repair pairing shows Order # (not PO)', () => {
  const parts = getReceivingPoIdentityParts(
    row({
      source_platform: 'ecwid',
      zoho_purchaseorder_number: '554433',
      zoho_purchaseorder_id: null,
      inbound_source_type: null,
    }),
    (p) => (p === 'ecwid' ? 'ECWID-RS' : p),
  );
  assert.equal(parts.poValue, '554433');
  assert.equal(parts.idPrefix, 'Order');
  assert.equal(parts.platformLabel, 'ECWID-RS');
});

test('receivingRailRowTitle — line mode keeps product name', () => {
  const r = row({
    zoho_purchaseorder_number: '63598685',
    item_name: '(2) Bose Companion 2 Series II Multimedia Speakers',
  });
  assert.equal(
    receivingRailRowTitle(r, 'line', identity),
    '(2) Bose Companion 2 Series II Multimedia Speakers',
  );
});

test('receivingAdaptiveRailTitle — single SKU shows product title', () => {
  const r = row({
    zoho_purchaseorder_number: '63598685',
    item_name: 'Single product',
    rail_title_context: { line_count: 1, distinct_sku_count: 1 },
  });
  assert.equal(receivingAdaptiveRailTitle(r, identity), 'Single product');
});

test('receivingAdaptiveRailTitle — multi distinct SKU shows PO summary', () => {
  const r = row({
    zoho_purchaseorder_number: '63598685',
    source_platform: 'goodwill',
    item_name: 'First product',
    rail_title_context: { line_count: 3, distinct_sku_count: 3 },
  });
  assert.equal(
    receivingAdaptiveRailTitle(r, (p) => (p === 'goodwill' ? 'Goodwill' : p)),
    'Goodwill · PO 63598685',
  );
});

test('receivingAdaptiveRailTitle — multi line same SKU shows product title', () => {
  const r = row({
    zoho_purchaseorder_number: '63598685',
    item_name: 'Same widget',
    sku: 'WDG-1',
    rail_title_context: { line_count: 2, distinct_sku_count: 1 },
  });
  assert.equal(receivingAdaptiveRailTitle(r, identity), 'Same widget');
});

test('receivingAdaptiveRailTitle — eBay single order shows product title', () => {
  const [stamped] = stampPoRailTitleContext([
    row({
      id: 42,
      inbound_source_type: 'ebay',
      source_order_id: '05-14843-41472',
      item_name: 'Vintage amp',
      sku: 'AMP-1',
      zoho_purchaseorder_id: null,
      zoho_purchaseorder_number: null,
    }),
  ]);
  assert.equal(receivingAdaptiveRailTitle(stamped, (p) => (p === 'ebay' ? 'eBay' : p)), 'Vintage amp');
});

test('filterLinesByPoGroup — same PO number keeps siblings on mixed carton', () => {
  const a = row({
    id: 1,
    receiving_id: 100,
    zoho_purchaseorder_number: 'PO-111',
    zoho_purchaseorder_id: 'zpo-111',
  });
  const b = row({
    id: 2,
    receiving_id: 100,
    zoho_purchaseorder_number: 'PO-111',
    zoho_purchaseorder_id: 'zpo-111',
  });
  const c = row({
    id: 3,
    receiving_id: 100,
    zoho_purchaseorder_number: 'PO-222',
    zoho_purchaseorder_id: 'zpo-222',
  });
  const filtered = filterLinesByPoGroup([a, b, c], a);
  assert.deepEqual(
    filtered.map((r) => r.id),
    [1, 2],
  );
});

test('filterLinesByPoGroup — PO id only matches when numbers absent', () => {
  const a = row({
    id: 1,
    receiving_id: 100,
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: 'zpo-aaa',
  });
  const b = row({
    id: 2,
    receiving_id: 100,
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: 'zpo-aaa',
  });
  const c = row({
    id: 3,
    receiving_id: 100,
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: 'zpo-bbb',
  });
  assert.equal(receivingPoGroupKey(a), 'po:zpo-aaa');
  assert.deepEqual(
    filterLinesByPoGroup([a, b, c], a).map((r) => r.id),
    [1, 2],
  );
});

test('filterLinesByPoGroup — unmatched stub isolates by line id', () => {
  const stub = row({
    id: 9,
    receiving_id: 50,
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: null,
    item_name: 'Unfound PO',
    receiving_source: 'unmatched',
  });
  const other = row({
    id: 10,
    receiving_id: 50,
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: null,
    item_name: 'Other stub',
    receiving_source: 'unmatched',
  });
  assert.equal(receivingPoGroupKey(stub), 'line:9');
  assert.deepEqual(
    filterLinesByPoGroup([stub, other], stub).map((r) => r.id),
    [9],
  );
});

test('receivingWorkspaceLineTitle — uses product SoT when present', () => {
  const r = row({
    id: 8696,
    catalog_product_title: null,
    zoho_item_title: null,
    item_name: 'Bose TV Speaker Soundbar',
    sku: '00138-BK',
    zoho_purchaseorder_number: '63931700',
  });
  assert.equal(receivingWorkspaceLineTitle(r), 'Bose TV Speaker Soundbar');
  assert.equal(receivingProductTitle(r), 'Bose TV Speaker Soundbar');
});

test('receivingWorkspaceLineTitle — thin PO placeholder never paints Line #', () => {
  const r = row({
    id: 8696,
    catalog_product_title: null,
    zoho_item_title: null,
    item_name: null,
    sku: null,
    zoho_item_id: null,
    zoho_purchaseorder_number: '63931700',
    source_platform: 'goodwill',
  });
  assert.equal(receivingProductTitle(r), 'Line #8696');
  assert.equal(
    receivingWorkspaceLineTitle(r, (p) => (p === 'goodwill' ? 'Goodwill' : p)),
    'Goodwill · PO 63931700',
  );
});

test('receivingWorkspaceLineTitle — unmatched without product still Line #', () => {
  const r = row({
    id: 42,
    receiving_source: 'unmatched',
    item_name: null,
    sku: null,
    zoho_item_id: null,
    zoho_purchaseorder_number: null,
  });
  assert.equal(receivingWorkspaceLineTitle(r), 'Line #42');
});

test('PO 63931700 / line 8696 — thin multi-SKU open never flashes Line #', () => {
  // Mirrors the dogfood Unboxed open: adaptive rail shows Goodwill · PO 63931700
  // while a carton-deduped placeholder can lack item_name until siblings hydrate.
  const thinPlaceholder = row({
    id: 8696,
    receiving_id: 14222,
    catalog_product_title: null,
    zoho_item_title: null,
    item_name: null,
    sku: null,
    zoho_item_id: null,
    zoho_purchaseorder_number: '63931700',
    source_platform: 'goodwill',
    rail_title_context: { line_count: 2, distinct_sku_count: 2 },
  });
  assert.equal(
    receivingWorkspaceLineTitle(thinPlaceholder, (p) =>
      p === 'goodwill' ? 'Goodwill' : p,
    ),
    'Goodwill · PO 63931700',
  );
  const hydrated = row({
    id: 8696,
    receiving_id: 14222,
    item_name: 'Bose TV Speaker Soundbar Model No. 431974 - Tested',
    sku: '00138-BK',
    zoho_purchaseorder_number: '63931700',
    source_platform: 'goodwill',
  });
  assert.equal(
    receivingWorkspaceLineTitle(hydrated),
    'Bose TV Speaker Soundbar Model No. 431974 - Tested',
  );
});
