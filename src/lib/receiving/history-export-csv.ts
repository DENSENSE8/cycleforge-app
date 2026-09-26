/** Unbox History view → CSV. */

import { getCurrentPSTDateKey } from '@/utils/date';

/** The fields the export reads. */
interface ExportableReceivingRow {
  id?: number | string | null;
  receiving_id?: number | null;
  zoho_purchaseorder_number?: string | null;
  tracking_number?: string | null;
  zoho_item_title?: string | null;
  catalog_product_title?: string | null;
  item_name?: string | null;
  sku?: string | null;
  condition_grade?: string | null;
  quantity_received?: number | string | null;
  quantity_expected?: number | string | null;
  workflow_status?: string | null;
  staging_location_label?: string | null;
  source_platform?: string | null;
  received_at?: string | null;
  unboxed_at?: string | null;
}

export const RECEIVING_HISTORY_EXPORT_COLUMNS = [
  'po',
  'tracking',
  'product',
  'sku',
  'condition',
  'qty_received',
  'qty_expected',
  'status',
  'location',
  'platform',
  'scanned_at',
  'unboxed_at',
  'record_id',
] as const;

/** RFC-4180 quoting — a comma, quote, or newline in a product title is normal. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Title precedence matches the grid / inspector: Zoho item → catalog → line name. */
function productTitle(row: ExportableReceivingRow): string {
  return (row.zoho_item_title || row.catalog_product_title || row.item_name || '').trim();
}

export function buildReceivingHistoryExportRow(row: ExportableReceivingRow): string[] {
  return [
    row.zoho_purchaseorder_number ?? '',
    row.tracking_number ?? '',
    productTitle(row),
    row.sku ?? '',
    row.condition_grade ?? '',
    row.quantity_received ?? '',
    row.quantity_expected ?? '',
    row.workflow_status ?? '',
    row.staging_location_label ?? '',
    row.source_platform ?? '',
    row.received_at ?? '',
    row.unboxed_at ?? '',
    row.id == null ? '' : String(row.id),
  ].map((cell) => (typeof cell === 'string' ? cell : String(cell)));
}

/** Header + one line per row, `\n`-joined. Empty view → header only. */
export function buildReceivingHistoryExportCsv(
  rows: readonly ExportableReceivingRow[],
): string {
  return [
    RECEIVING_HISTORY_EXPORT_COLUMNS as readonly string[],
    ...rows.map(buildReceivingHistoryExportRow),
  ]
    .map((line) => line.map(csvCell).join(','))
    .join('\n');
}

/**
 * `unbox-history-YYYY-MM-DD.csv` on the WAREHOUSE civil day — the day the floor
 * is working, not the host timezone and not UTC.
 */
export function receivingHistoryExportFilename(
  dateKey: string = getCurrentPSTDateKey(),
): string {
  return `unbox-history-${dateKey}.csv`;
}
