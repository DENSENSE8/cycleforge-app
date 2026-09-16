/**
 * Google Sheet → `CanonicalOrderLine` adapter (pure).
 *
 * This is the ONLY place a sheet column index is allowed to exist. It binds
 * row-1 headers to fields, then reads each row by the bound index exactly once
 * and emits named canonical fields. Nothing downstream sees `colIndices`.
 *
 * Kept free of IO (no Sheets client, no DB) so header binding and row mapping
 * are unit testable — the fetch lives in the transfer-orders job.
 */
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

interface HeaderBinding {
  field: SheetField;
  candidates: string[];
}

/** Row-1 headers that MUST be present (minimal small-business import). */
const REQUIRED_SHEET_HEADER_BINDINGS: HeaderBinding[] = [
  { field: 'orderNumber', candidates: ['Order Number', 'Order - Number', 'Order #', 'Order ID'] },
  { field: 'itemNumber', candidates: ['Item Number', 'Item ID', 'Listing ID'] },
  {
    field: 'itemTitle',
    candidates: ['Item title', 'Item Title', 'Product Title', 'Product', 'Title', 'Description'],
  },
];

/** Optional columns — a missing header leaves the index at -1, not a failure. */
const OPTIONAL_SHEET_HEADER_BINDINGS: HeaderBinding[] = [
  { field: 'shipByDate', candidates: ['Ship by date', 'Ship Date', 'Due Date'] },
  { field: 'orderDate', candidates: ['Order date', 'Order Date', 'Sale date', 'Sale Date', 'Date sold'] },
  { field: 'quantity', candidates: ['Quantity', 'Qty'] },
  { field: 'usavSku', candidates: ['USAV SKU', 'SKU', 'Internal SKU'] },
  { field: 'condition', candidates: ['Condition'] },
  { field: 'tracking', candidates: ['Tracking', 'Shipment - Tracking Number'] },
  { field: 'note', candidates: ['Note', 'Notes'] },
  { field: 'platform', candidates: ['Platform', 'Account Source', 'Channel'] },
  { field: 'salePrice', candidates: ['Sale Price', 'Price', 'Amount', 'Order Total', 'Item Total', 'Sale Amount'] },
  { field: 'currency', candidates: ['Currency', 'Currency Code'] },
];

function findHeaderIndex(headers: unknown[], candidates: string[]): number {
  return headers.findIndex((header) => {
    const normalized = cleanText(header).toLowerCase();
    return candidates.some((candidate) => normalized === candidate.trim().toLowerCase());
  });
}

interface SheetColumnBinding {
  colIndices: SheetColumnIndices;
  /** Required fields with no matching header — the caller turns these into a 400. */
  missing: HeaderBinding[];
}

/** Bind row-1 headers to fields. Unmatched fields stay at -1. */
export function bindSheetColumns(headerRow: unknown[]): SheetColumnBinding {
  const colIndices: SheetColumnIndices = { ...FIXED_COL_INDICES_DEFAULT };
  for (const { field, candidates } of [
    ...REQUIRED_SHEET_HEADER_BINDINGS,
    ...OPTIONAL_SHEET_HEADER_BINDINGS,
  ]) {
    colIndices[field] = findHeaderIndex(headerRow, candidates);
  }
  const missing = REQUIRED_SHEET_HEADER_BINDINGS.filter((b) => colIndices[b.field] === -1);
  return { colIndices, missing };
}

/** An optional sheet column that row 1 never bound, and what would bind it. */
export interface UnboundSheetColumn {
  field: SheetField;
  /** Header titles that would have matched, for the operator-facing message. */
  expectedLabels: string[];
}

/**
 * Optional fields that found NO header in row 1, with the titles that would
 * have matched.
 *
 * WHY THIS IS EXPORTED AT ALL: a missing OPTIONAL column is silent by design
 * (index stays -1, `cell()` reads ''), and for `note` or `condition` that is
 * genuinely fine. For `salePrice` it is not: it is why 4467 orders imported
 * with 6 prices between them. The header match is exact equality on the
 * lowercased title, so `Sale Price` binds but `Item Price`, `Sold Price` or
 * `Sale Price (USD)` do not — and nothing told anyone. The caller reports
 * these so the operator sees "your sheet has no price column" instead of
 * discovering it months later in a revenue report.
 */
export function unboundOptionalColumns(
  colIndices: SheetColumnIndices,
): UnboundSheetColumn[] {
  return OPTIONAL_SHEET_HEADER_BINDINGS.filter((b) => colIndices[b.field] === -1).map((b) => ({
    field: b.field,
    expectedLabels: b.candidates,
  }));
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
 * Map eligible sheet rows to canonical lines.
 *
 * Expects rows already filtered by `filterEligibleTransferSheetRows` — this
 * function does no eligibility gating, it only translates shape.
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
