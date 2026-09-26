/** Grid / station-log → TSV copy formatters. */
import type { TechRecord } from '@/hooks/useTechLogs';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import type { CatalogListRow } from '@/components/products/catalog/types';

/** Tab-join, normalizing nullish/whitespace cells to '' so columns stay aligned. */
function tsv(cells: (string | number | null | undefined)[]): string {
  return cells.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t');
}

export const TECH_COPY_HEADER = ['Date', 'Order', 'SKU', 'Serial', 'Tracking', 'Qty', 'Condition', 'Title'];
export function formatTechCopyRow(r: TechRecord): string {
  return tsv([
    r.created_at,
    r.order_id,
    r.sku,
    r.serial_number,
    r.shipping_tracking_number,
    r.quantity ?? '1',
    r.condition,
    r.product_title,
  ]);
}

export const PACKER_COPY_HEADER = ['Date', 'Order', 'SKU', 'Scan', 'Tracking', 'Qty', 'Condition', 'Title'];
export function formatPackerCopyRow(r: PackerRecord): string {
  return tsv([
    r.created_at,
    r.order_id,
    r.sku,
    r.scan_ref,
    r.shipping_tracking_number,
    r.quantity ?? '1',
    r.condition,
    r.product_title,
  ]);
}

export const BINS_COPY_HEADER = [
  'Barcode',
  'Room',
  'Zone',
  'Row',
  'Col',
  'Qty',
  'SKU count',
  'Capacity',
  'Fill %',
  'Last counted',
];
export function formatBinsCopyRow(r: BinsOverviewRow): string {
  return tsv([
    r.barcode,
    r.room,
    r.zone_letter,
    r.row_label,
    r.col_label,
    r.total_qty,
    r.sku_count,
    r.capacity,
    r.fill_pct != null ? (r.fill_pct * 100).toFixed(1) : '',
    r.last_counted,
  ]);
}

export const CATALOG_COPY_HEADER = [
  'SKU',
  'Title',
  'Category',
  'Lifecycle',
  'Active',
  'Platforms',
  'Manuals',
  'Orders',
  'Provider item',
];
export function formatCatalogCopyRow(r: CatalogListRow): string {
  return tsv([
    r.sku,
    r.display_title || r.product_title,
    r.category,
    r.lifecycle_status,
    r.is_active ? 'yes' : 'no',
    r.platform_count,
    r.manual_count,
    r.order_count,
    r.provider_item_id,
  ]);
}

/** Prepend a header row to a set of TSV lines (full clipboard block). */
export function toTsvBlock(header: string[], lines: string[]): string {
  return [header.join('\t'), ...lines].join('\n');
}
