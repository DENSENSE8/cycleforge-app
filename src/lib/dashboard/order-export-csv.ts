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

import { conditionLabel } from '@/lib/conditions';
import { formatDateTimePST, getCurrentPSTDateKey, parseDateKey } from '@/utils/date';
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
  packed_at?: string | null;
  packed_by_name?: string | null;
  packer_name?: string | null;
  shipment_id?: number | string | null;
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

/** Staff-facing Packed CSV — no internal record / shipment ids. */
export const PACKED_EXPORT_COLUMNS = [
  'Date range',
  'Packed at',
  'Packed by',
  'Order',
  'Product',
  'SKU',
  'Condition',
  'Qty',
  'Ship by',
  'Tracking',
  'Serial',
  'Platform',
] as const;

export interface PackedExportWindow {
  dateFrom?: string | null;
  dateTo?: string | null;
}

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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Civil YYYY-MM-DD → `MM/DD/YY` for staff spreadsheets. */
export function formatExportCivilDate(dateKey: string | null | undefined): string {
  const key = String(dateKey || '').trim();
  if (!key) return '';
  const parts = parseDateKey(key);
  if (!parts) return key;
  return `${pad2(parts.m)}/${pad2(parts.d)}/${String(parts.y).slice(-2)}`;
}

/**
 * Warehouse instant → `MM/DD/YY HH:mm` 24-hour. Empty when the stamp is absent.
 * Seconds and four-digit years are dropped so the cell matches a packing slip.
 */
export function formatExportDateTime24h(input: string | Date | null | undefined): string {
  const full = formatDateTimePST(input, { hour12: false });
  if (!full || full === '—') return '';
  const match = full.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?/,
  );
  if (!match) return full;
  const year = match[3].length === 4 ? match[3].slice(-2) : match[3];
  return `${pad2(Number(match[1]))}/${pad2(Number(match[2]))}/${year} ${pad2(Number(match[4]))}:${match[5]}`;
}

function formatExportShipBy(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatExportCivilDate(value);
  return formatExportDateTime24h(value);
}

function formatExportCondition(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  return conditionLabel(value, 'full');
}

export function packedExportRangeLabel(window: PackedExportWindow = {}): string {
  const from = formatExportCivilDate(window.dateFrom);
  const to = formatExportCivilDate(window.dateTo ?? window.dateFrom);
  if (!from && !to) return 'All dates';
  if (from && to && from === to) return from;
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

export function buildPackedOrderExportRow(
  row: ExportableOrderRow,
  window: PackedExportWindow = {},
): string[] {
  const orderId = String(row.order_id ?? '').trim();
  return [
    packedExportRangeLabel(window),
    formatExportDateTime24h(row.packed_at),
    row.packed_by_name || row.packer_name || '',
    orderId,
    row.product_title ?? '',
    row.sku ?? '',
    formatExportCondition(row.condition),
    row.quantity == null ? '' : String(row.quantity),
    formatExportShipBy(row.ship_by_date ?? row.deadline_at),
    row.shipping_tracking_number ?? row.tracking_number ?? '',
    row.serial_number ?? '',
    orderId || row.account_source ? getOrderPlatformLabel(orderId, row.account_source) : '',
  ];
}

/** Packed lane CSV — operator columns, warehouse 24h stamps, selected window. */
export function buildPackedOrderExportCsv(
  rows: readonly ExportableOrderRow[],
  window: PackedExportWindow = {},
): string {
  return [
    PACKED_EXPORT_COLUMNS as readonly string[],
    ...rows.map((row) => buildPackedOrderExportRow(row, window)),
  ]
    .map((line) => line.map(csvCell).join(','))
    .join('\n');
}

function civilFileToken(dateKey: string): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  return `${pad2(parts.m)}-${pad2(parts.d)}-${String(parts.y).slice(-2)}`;
}

/**
 * Packed download name carries the selected window (`MM-DD-YY`), not the
 * export instant — so two exports of the same filter overwrite each other.
 */
export function packedOrderExportFilename(window: PackedExportWindow = {}): string {
  const from = String(window.dateFrom || '').trim();
  const to = String(window.dateTo || window.dateFrom || '').trim();
  if (!from && !to) return 'packed-orders-all-dates.csv';
  const start = civilFileToken(from || to);
  const end = civilFileToken(to || from);
  if (start === end) return `packed-orders-${start}.csv`;
  return `packed-orders-${start}-to-${end}.csv`;
}

/**
 * `<lane>-orders-YYYY-MM-DD.csv` on the WAREHOUSE civil day — the day the floor
 * is working, not the host's timezone and not UTC (which is already tomorrow
 * for a late-afternoon PST export).
 */
export function orderExportFilename(lane: string, dateKey: string = getCurrentPSTDateKey()): string {
  return `${lane}-orders-${dateKey}.csv`;
}
