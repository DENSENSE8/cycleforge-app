import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TechRecord } from '@/hooks/useTechLogs';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import {
  formatTechCopyRow,
  formatPackerCopyRow,
  formatBinsCopyRow,
  formatCatalogCopyRow,
  toTsvBlock,
  TECH_COPY_HEADER,
  PACKER_COPY_HEADER,
  BINS_COPY_HEADER,
  CATALOG_COPY_HEADER,
} from './format-station-copy-row';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import type { CatalogListRow } from '@/components/products/catalog/types';

test('formatTechCopyRow emits tab-separated, whitespace-normalized cells', () => {
  const rec = {
    id: 1,
    created_at: '2026-07-01T18:00:00Z',
    order_id: 'ORD-1',
    sku: 'SKU-1',
    serial_number: 'SN-1',
    shipping_tracking_number: '9400\t100',
    quantity: '2',
    condition: 'USED',
    product_title: 'Bose\nQC45',
    tested_by: 7,
  } as unknown as TechRecord;
  const line = formatTechCopyRow(rec);
  const cells = line.split('\t');
  assert.equal(cells.length, TECH_COPY_HEADER.length);
  assert.equal(cells[1], 'ORD-1');
  assert.equal(cells[3], 'SN-1');
  // Embedded tab/newline collapsed to a space so columns stay aligned.
  assert.equal(cells[4], '9400 100');
  assert.equal(cells[7], 'Bose QC45');
});

test('formatPackerCopyRow uses scan_ref column + safe defaults', () => {
  const rec = {
    id: 2,
    created_at: '2026-07-02T18:00:00Z',
    order_id: null,
    sku: 'SKU-2',
    scan_ref: 'X00ABC',
    shipping_tracking_number: '',
    quantity: undefined,
    condition: 'NEW',
    product_title: 'Sony',
    packed_by: 9,
    packer_photos_url: [],
  } as unknown as PackerRecord;
  const cells = formatPackerCopyRow(rec).split('\t');
  assert.equal(cells.length, PACKER_COPY_HEADER.length);
  assert.equal(cells[1], ''); // null order_id → ''
  assert.equal(cells[3], 'X00ABC');
  assert.equal(cells[5], '1'); // undefined qty → '1'
});

test('toTsvBlock prepends the header row', () => {
  const block = toTsvBlock(['A', 'B'], ['1\t2', '3\t4']);
  assert.equal(block, 'A\tB\n1\t2\n3\t4');
});

test('formatBinsCopyRow matches BINS_COPY_HEADER width', () => {
  const row = {
    id: 1,
    barcode: 'BIN-1',
    room: 'A',
    zone_letter: 'B',
    row_label: '1',
    col_label: '2',
    total_qty: 3,
    sku_count: 1,
    capacity: 10,
    fill_pct: 0.3,
    last_counted: '2026-08-01',
  } as unknown as BinsOverviewRow;
  assert.equal(formatBinsCopyRow(row).split('\t').length, BINS_COPY_HEADER.length);
});

test('formatCatalogCopyRow matches CATALOG_COPY_HEADER width', () => {
  const row = {
    id: 9,
    sku: 'SKU-9',
    product_title: 'Widget',
    display_title: 'Widget',
    category: 'Audio',
    lifecycle_status: 'active',
    is_active: true,
    platform_count: 2,
    manual_count: 0,
    order_count: 4,
    provider_item_id: 'Z-1',
  } as unknown as CatalogListRow;
  assert.equal(formatCatalogCopyRow(row).split('\t').length, CATALOG_COPY_HEADER.length);
});
