import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPackingReportDbRow, resolvePackTierSource } from './packing-report-shared';

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
    packer_name: 'Koh',
    sku: 'SKU-1',
    product_title: 'Wave Radio',
    pack_tier: 'MEDIUM',
    raw_pack_tier: 'MEDIUM',
    estimated_minutes: 14,
    tracking_type: null,
    tracking_or_scan_ref: '1Z',
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
});

test('mapPackingReportDbRow marks COALESCE small as default when raw tier null', () => {
  const row = mapPackingReportDbRow({
    packed_at: '2026-08-03T12:00:00.000Z',
    packer_name: null,
    sku: null,
    product_title: null,
    pack_tier: 'SMALL',
    raw_pack_tier: null,
    estimated_minutes: 5,
    tracking_type: null,
    tracking_or_scan_ref: null,
    item_number: null,
    sku_catalog_id: null,
    tier_source: null,
    packer_log_id: null,
    sal_id: 1,
  });
  assert.equal(row.tierSource, 'default');
  assert.equal(row.skuCatalogId, null);
  assert.equal(row.packerLogId, null);
});
