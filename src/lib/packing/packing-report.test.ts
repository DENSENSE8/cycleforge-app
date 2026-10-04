import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapPackingReportDbRow,
  packingPerformanceSnapshot,
  packingReportMatchesQuery,
  resolvePackTierSource,
} from './packing-report-shared';

test('resolvePackTierSource prefers explicit enrichment sources', () => {
  assert.equal(resolvePackTierSource('profile', 'LARGE'), 'profile');
  assert.equal(resolvePackTierSource('clean', 'MEDIUM'), 'clean');
  assert.equal(resolvePackTierSource('rules', 'SMALL'), 'rules');
});

test('resolvePackTierSource treats null tier as default', () => {
  assert.equal(resolvePackTierSource(null, null), 'default');
  assert.equal(resolvePackTierSource('', ''), 'default');
});

test('resolvePackTierSource falls back to rules when tier present without source', () => {
  assert.equal(resolvePackTierSource(null, 'MEDIUM'), 'rules');
});

test('mapPackingReportDbRow includes item number, catalog id, and packer log', () => {
  const row = mapPackingReportDbRow({
    packed_at: '2026-08-03T12:00:00.000Z',
    pack_duration_seconds: 92,
    next_pack_seconds: 215,
    packer_name: 'Koh',
    sku: 'SKU-1',
    product_title: 'Wave Radio',
    pack_tier: 'MEDIUM',
    raw_pack_tier: 'MEDIUM',
    estimated_minutes: 14,
    tracking_type: null,
    tracking_or_scan_ref: '1Z',
    quantity: '2',
    image_url: 'https://example.test/product.jpg',
    item_number: 'ITEM-99',
    sku_catalog_id: 42,
    tier_source: 'profile',
    packer_log_id: 7,
    sal_id: 100,
  });
  assert.equal(row.itemNumber, 'ITEM-99');
  assert.equal(row.skuCatalogId, 42);
  assert.equal(row.tierSource, 'profile');
  assert.equal(row.packerLogId, 7);
  assert.equal(row.salId, 100);
  assert.equal(row.packTier, 'MEDIUM');
  assert.equal(row.packDurationSeconds, 92);
  assert.equal(row.nextPackSeconds, 215);
  assert.equal(row.quantity, 2);
  assert.equal(row.imageUrl, 'https://example.test/product.jpg');
  assert.equal(packingReportMatchesQuery(row, 'koh amazon'), false);
  assert.equal(packingReportMatchesQuery(row, 'Koh ITEM-99'), true);
  assert.equal(packingReportMatchesQuery({ ...row, platform: 'Amazon', orderNumber: '114-123' }, 'amazon 114-123'), true);
  assert.equal(packingReportMatchesQuery(row, '1Z Wave'), true);
});

test('mapPackingReportDbRow marks COALESCE small as default when raw tier null', () => {
  const row = mapPackingReportDbRow({
    packed_at: '2026-08-03T12:00:00.000Z',
    pack_duration_seconds: null,
    next_pack_seconds: null,
    packer_name: null,
    sku: null,
    product_title: null,
    pack_tier: 'SMALL',
    raw_pack_tier: null,
    estimated_minutes: 5,
    tracking_type: null,
    tracking_or_scan_ref: null,
    quantity: null,
    image_url: null,
    item_number: null,
    sku_catalog_id: null,
    tier_source: null,
    packer_log_id: null,
    sal_id: 1,
  });
  assert.equal(row.tierSource, 'default');
  assert.equal(row.skuCatalogId, null);
  assert.equal(row.packerLogId, null);
  assert.equal(row.quantity, 1);
});

test('packingPerformanceSnapshot keeps standards separate from observed time', () => {
  const base = mapPackingReportDbRow({
    packed_at: '2026-08-03T12:00:00.000Z',
    pack_duration_seconds: 90,
    next_pack_seconds: 180,
    packer_name: 'Koh',
    sku: 'SKU-1',
    product_title: 'Wave Radio',
    pack_tier: 'SMALL',
    raw_pack_tier: 'SMALL',
    estimated_minutes: 5,
    tracking_type: null,
    tracking_or_scan_ref: null,
    quantity: 2,
    image_url: null,
    item_number: null,
    sku_catalog_id: 42,
    tier_source: 'profile',
    packer_log_id: 7,
    sal_id: 100,
  });
  const snapshot = packingPerformanceSnapshot([
    base,
    { ...base, salId: 101, quantity: 1, estimatedMinutes: 10, packDurationSeconds: 150, nextPackSeconds: null },
    { ...base, salId: 102, quantity: 3, packDurationSeconds: null, nextPackSeconds: 240 },
  ]);
  assert.deepEqual(snapshot, {
    units: 6,
    standardMinutes: 20,
    medianPackSeconds: 120,
    medianNextPackSeconds: 210,
    measuredPackCount: 2,
    measurementCoverage: 2 / 3,
  });
});
