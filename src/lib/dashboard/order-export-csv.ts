/**
 * Outbound selection → CSV. Pure string building, no DOM — the bulk bar owns
 * the Blob download, this module owns what the file says.
 *
 * The export mirrors what the operator can SEE on the lane (the Pending grid's
 * columns plus the two attention flags the KPI strip counts), so a spreadsheet
 * pulled off a selection reconciles against the surface it came from. It is a
 * read of the rows already in hand — never a second query, never a second
 * definition of "what a pending order is".
 */

import { getCurrentPSTDateKey } from '@/utils/date';
import { getOrderPlatformLabel } from '@/utils/order-platform';

/**
 * The union of fields the export reads. Every one is optional: the dashboard
 * selection scope carries `ShippedOrder` on pre-pack lanes and `PackerRecord`
 * on post-pack ones, and a column absent from a row is honest absence (empty
 * cell), not a reason to fail the export.
 */
export interface ExportableOrderRow {
  id?: number | string | null;
  order_id?: string | null;
  product_title?: string | null;
  sku?: string | null;
  condition?: string | null;
  quantity?: string | number | null;
  ship_by_date?: string | null;
  deadline_at?: string | null;
  shipping_tracking_number?: string | null;
  tracking_number?: string | null;
  serial_number?: string | null;
  account_source?: string | null;
  is_urgent?: boolean | null;
  is_out_of_stock?: boolean | null;
}

export const ORDER_EXPORT_COLUMNS = [
  'order_id',
  'product_title',
  'sku',
  'condition',
  'qty',
  'ship_by',
  'tracking',
  'serial',
  'platform',
  'is_urgent',
  'is_out_of_stock',
  'record_id',
] as const;

/** RFC-4180 quoting — a comma, quote, or newline in a product title is normal. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function flag(value: boolean | null | undefined): string {
  return value ? 'true' : 'false';
}

export function buildOrderExportRow(row: ExportableOrderRow): string[] {
  const orderId = String(row.order_id ?? '').trim();
  return [
    orderId,
    row.product_title ?? '',
    row.sku ?? '',
    row.condition ?? '',
    row.quantity ?? '',
    // The grid's `sla` track reads ship_by_date with deadline_at as the fallback.
    row.ship_by_date ?? row.deadline_at ?? '',
    row.shipping_tracking_number ?? row.tracking_number ?? '',
    row.serial_number ?? '',
    // Capability/runtime label from the SoT — never a hardcoded vendor sentence.
    orderId || row.account_source ? getOrderPlatformLabel(orderId, row.account_source) : '',
    flag(row.is_urgent),
    flag(row.is_out_of_stock),
    row.id == null ? '' : String(row.id),
  ].map((cell) => (typeof cell === 'string' ? cell : String(cell)));
}

/** Header + one line per row, `\n`-joined. Empty selection → header only. */
export function buildOrderExportCsv(rows: readonly ExportableOrderRow[]): string {
  return [ORDER_EXPORT_COLUMNS as readonly string[], ...rows.map(buildOrderExportRow)]
    .map((line) => line.map(csvCell).join(','))
    .join('\n');
}

/**
 * `<lane>-orders-YYYY-MM-DD.csv` on the WAREHOUSE civil day — the day the floor
 * is working, not the host's timezone and not UTC (which is already tomorrow
 * for a late-afternoon PST export).
 */
export function orderExportFilename(lane: string, dateKey: string = getCurrentPSTDateKey()): string {
  return `${lane}-orders-${dateKey}.csv`;
}
