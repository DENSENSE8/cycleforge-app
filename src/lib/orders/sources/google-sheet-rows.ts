/** Google Sheet row → `CanonicalOrderLine` adapter (pure). */
import {
  cleanText,
  parseSaleAmount,
  resolveSpreadsheetShipByDate,
  type CanonicalOrderLine,
} from '@/lib/orders/canonical-order';

/** A raw sheet row: positional cells straight from the Sheets API. */
export type SheetRow = unknown[];

type SheetField =
  | 'shipByDate'
  | 'orderDate'
  | 'orderNumber'
  | 'itemNumber'
  | 'itemTitle'
  | 'quantity'
  | 'usavSku'
  | 'condition'
  | 'tracking'
  | 'note'
  | 'platform'
  | 'salePrice'
  | 'currency';

export type SheetColumnIndices = Record<SheetField, number>;

/**
 * The legacy fixed layout, used when there is no header row to bind against.
 * `-1` means "this field has no column" — an absent column is not an error.
 */
export const FIXED_COL_INDICES_DEFAULT: SheetColumnIndices = {
  shipByDate: 0,
  /**
   * When the order was PLACED — a distinct fact from `shipByDate` (when it is
   * due). Absent from the legacy fixed layout; the sheet may bind it by header.
   */
  orderDate: -1,
  orderNumber: 1,
  itemNumber: 2,
  itemTitle: 3,
  quantity: 4,
  usavSku: 5,
  condition: 6,
  tracking: 7,
  note: 8,
  platform: 9,
  salePrice: -1,
  currency: -1,
};

/** Row-1 titles that bind each field (case-insensitive, exact). */
const SHEET_HEADER_CANDIDATES: Record<SheetField, readonly string[]> = {
  shipByDate: ['Ship by date', 'Ship Date', 'Due Date'],
  orderDate: ['Order date', 'Order Date', 'Sale date', 'Sale Date', 'Date sold'],
  orderNumber: ['Order Number', 'Order - Number', 'Order #', 'Order ID'],
  itemNumber: ['Item Number', 'Item ID', 'Listing ID'],
  itemTitle: ['Item title', 'Item Title', 'Product Title', 'Product', 'Title', 'Description'],
  quantity: ['Quantity', 'Qty'],
  usavSku: ['USAV SKU', 'SKU', 'Internal SKU'],
  condition: ['Condition'],
  tracking: ['Tracking', 'Tracking Number', 'Tracking #', 'Shipment - Tracking Number'],
  note: ['Note', 'Notes'],
  platform: ['Platform', 'Account Source', 'Channel'],
  salePrice: ['Sale Price', 'Price', 'Amount', 'Order Total', 'Item Total', 'Sale Amount'],
  currency: ['Currency', 'Currency Code'],
};

/** Fields a sheet MUST title in row 1 to be read at all. */
const REQUIRED_SHEET_FIELDS: readonly SheetField[] = ['orderNumber', 'tracking'];

/**
 * Bind row-1 headers to fields; an untitled optional field stays -1 (reads '').
 * `missing` names each required field with the titles that would bind it.
 */
export function bindSheetColumns(headerRow: readonly unknown[]): {
  colIndices: SheetColumnIndices;
  missing: Array<{ field: SheetField; expectedLabels: readonly string[] }>;
} {
  const headers = headerRow.map((h) => cleanText(h).toLowerCase());
  const colIndices = Object.fromEntries(
    (Object.keys(SHEET_HEADER_CANDIDATES) as SheetField[]).map((field) => {
      const wanted = SHEET_HEADER_CANDIDATES[field].map((c) => c.toLowerCase());
      return [field, headers.findIndex((h) => wanted.includes(h))];
    }),
  ) as SheetColumnIndices;
  const missing = REQUIRED_SHEET_FIELDS.filter((f) => colIndices[f] < 0).map((field) => ({
    field,
    expectedLabels: SHEET_HEADER_CANDIDATES[field],
  }));
  return { colIndices, missing };
}

/** Read a bound cell; an unbound column (-1) reads as ''. */
function cell(row: SheetRow, index: number): string {
  return index >= 0 ? cleanText(row[index]) : '';
}

/**
 * The order's PLACEMENT instant. Unlike the ship-by this is a real moment in
 * time when the source carries one, so it is NOT rounded to a warehouse day.
 */
function resolveSheetOrderDate(rawOrderDate: unknown): Date | null {
  const raw = cleanText(rawOrderDate);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Map stored sheet rows to canonical lines. Does no eligibility gating — it
 * only translates shape.
 */
export function mapSheetRowsToCanonicalLines(
  rows: SheetRow[],
  colIndices: SheetColumnIndices,
): CanonicalOrderLine[] {
  const hasCurrencyColumn = colIndices.currency >= 0;

  return rows.map((row) => {
    const tracking = cell(row, colIndices.tracking);
    return {
      externalOrderId: cell(row, colIndices.orderNumber),
      itemNumber: cell(row, colIndices.itemNumber),
      productTitle: cell(row, colIndices.itemTitle),
      sku: cell(row, colIndices.usavSku),
      condition: cell(row, colIndices.condition),
      // A blank quantity cell means one unit, not zero.
      quantity: cell(row, colIndices.quantity) || '1',
      notes: cell(row, colIndices.note),
      // The sheet layout has no customer column, so there is no buyer name to
      // resolve. Its `note` cell stays a note — it is an operator remark, not
      // an identity smuggled into free text.
      customerName: '',
      accountSource: cell(row, colIndices.platform),
      // A sheet carries no lifecycle opinion — the writer inserts 'unassigned'.
      status: null,
      trackings: tracking ? [tracking] : [],
      shipByDate: resolveSpreadsheetShipByDate(row[colIndices.shipByDate]),
      orderDate: resolveSheetOrderDate(row[colIndices.orderDate]),
      saleAmount: parseSaleAmount(row[colIndices.salePrice] ?? ''),
      // Null when the sheet has no Currency column at all, so the writer
      // defaults on insert and leaves an existing order's currency alone.
      currency: hasCurrencyColumn ? cell(row, colIndices.currency) || 'USD' : null,
    };
  });
}
