/**
 * The upload check (client + server safe): every cell of an uploaded file
 * beside the value that landed in the database, column by column (operator
 * 2026-10-06, "ensure that all the data is uploaded to the database tables
 * correctly").
 *
 * The batch runner keeps the file row by row (`inbound_import_row`: raw cells,
 * the order / line it landed as); `readInboundImportCheck` (server,
 * `import-check-read.ts`) reads each landed row's saved values back through the
 * field registry's `target.column` (`po-columns.ts`) and `compareImportCell`
 * here decides equal / different per cell after one normalization per field
 * kind: dates → YYYY-MM-DD, money → cents, tracking → canonical, condition →
 * grade code, return reasons compared raw and shown decoded.
 */

import { extractCanonicalTracking } from '@/lib/tracking-format';
import { conditionGradeFromListing } from '@/lib/conditions';
import { readReturnReason } from './return-reason-codes';
import { parsePoDate, parsePoMoneyCents, PO_COLUMNS, type PoField, type PoPresetId } from './po-columns';

export type ImportRowStatus = 'landed' | 'unchanged' | 'held' | 'failed';

export interface InboundImportBatchSummary {
  id: number;
  createdAt: string;
  fileName: string | null;
  preset: PoPresetId | null;
  presetLabel: string;
  label: string | null;
  status: string;
  /** Data rows in the file. */
  rows: number;
  /** Orders the rows grouped into (landable). */
  orders: number;
  landed: number;
  failed: number;
  createdBy: { id: number; name: string } | null;
}

/** equal → plain; different → marked; not_saved → muted; blank → both sides empty. */
export type ImportCellState = 'equal' | 'different' | 'not_saved' | 'blank';

export interface ImportCheckCell {
  header: string;
  field: PoField | null;
  /** The cell exactly as uploaded. */
  file: string;
  /** The saved value, normalized for display; null when nothing was read back. */
  saved: string | null;
  /** Return reason words (`readReturnReason`) for a return-reason cell. */
  decoded: string | null;
  state: ImportCellState;
}

export interface ImportCheckColumn {
  header: string;
  field: PoField | null;
  label: string | null;
  /** The DB column the field lands in (`PO_COLUMNS[field].target.column`). */
  column: string | null;
}

export interface ImportCheckRow {
  /** 1-based data row in the file. */
  rowNumber: number;
  status: ImportRowStatus;
  problem: string | null;
  /** The full order number — lists paint its last 8. */
  orderNumber: string | null;
  inboundOrderId: number | null;
  receivingLineId: number | null;
  cells: ImportCheckCell[];
}

export interface InboundImportCheckCounts {
  rows: number;
  landed: number;
  unchanged: number;
  held: number;
  failed: number;
  cellsMatching: number;
  cellsDiffering: number;
}

export interface InboundImportCheck {
  batch: InboundImportBatchSummary & { headers: string[]; columnMap: Partial<Record<PoField, string>> };
  columns: ImportCheckColumn[];
  rows: ImportCheckRow[];
  counts: InboundImportCheckCounts;
}

/** How a field's file text and saved text are brought to one shape before comparing. */
type CompareKind = 'text' | 'date' | 'money' | 'tracking' | 'integer' | 'condition' | 'list' | 'upper';

const COMPARE_KIND: Partial<Record<PoField, CompareKind>> = {
  order_date: 'date',
  expected_date: 'date',
  return_request_date: 'date',
  unit_cost: 'money',
  line_total: 'money',
  shipping: 'money',
  tracking: 'tracking',
  quantity: 'integer',
  condition: 'condition',
  listing_serials: 'list',
  order_type: 'upper',
  platform: 'upper',
  priority: 'upper',
  carrier: 'upper',
};

function splitList(raw: string): string[] {
  return raw
    .split(/[,;|\n]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

/** One comparable form of a value for the field; null = blank. */
export function normalizeImportValue(field: PoField, raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  switch (COMPARE_KIND[field] ?? 'text') {
    case 'date':
      return parsePoDate(value) ?? value;
    case 'money': {
      const cents = parsePoMoneyCents(value);
      return cents == null ? value : String(cents);
    }
    case 'tracking':
      return extractCanonicalTracking(value) || value.toUpperCase();
    case 'integer':
      return /^\d+(\.0+)?$/.test(value) ? String(Number(value)) : value;
    case 'condition':
      return conditionGradeFromListing(value) ?? value.toUpperCase();
    case 'list':
      return splitList(value).join(',');
    case 'upper':
      return value.toUpperCase();
    default:
      return value.replace(/\s+/g, ' ');
  }
}

/**
 * One file cell against its saved value. `saved` is what the read-back found
 * for the field (null = nothing landed / the row did not land). A column bound
 * to no field is never saved.
 */
export function compareImportCell(
  header: string,
  field: PoField | null,
  file: string,
  saved: string | null,
  landed: boolean,
): ImportCheckCell {
  const decoded = field === 'return_reason' ? (readReturnReason(saved ?? file)?.label ?? null) : null;
  if (field == null || !landed) {
    return { header, field, file, saved: field == null ? null : saved, decoded, state: file.trim() ? 'not_saved' : 'blank' };
  }
  const a = normalizeImportValue(field, file);
  const b = normalizeImportValue(field, saved);
  if (a == null && b == null) return { header, field, file, saved, decoded, state: 'blank' };
  // A blank file cell the writer filled from a default (vendor, tier) is not a mismatch of the upload.
  if (a == null) return { header, field, file, saved, decoded, state: 'blank' };
  return { header, field, file, saved, decoded, state: a === b ? 'equal' : 'different' };
}

/** The columns of the check, in file order, each naming its field and DB column. */
export function importCheckColumns(headers: readonly string[], columnMap: Partial<Record<PoField, string>>): ImportCheckColumn[] {
  const fieldOf = new Map<string, PoField>();
  for (const [field, header] of Object.entries(columnMap) as Array<[PoField, string | undefined]>) {
    if (header) fieldOf.set(header, field);
  }
  return headers.map((header) => {
    const field = fieldOf.get(header) ?? null;
    return {
      header,
      field,
      label: field ? PO_COLUMNS[field].label : null,
      column: field ? PO_COLUMNS[field].target.column : null,
    };
  });
}

export function importCheckCounts(rows: readonly ImportCheckRow[]): InboundImportCheckCounts {
  const counts: InboundImportCheckCounts = { rows: rows.length, landed: 0, unchanged: 0, held: 0, failed: 0, cellsMatching: 0, cellsDiffering: 0 };
  for (const row of rows) {
    counts[row.status] += 1;
    for (const cell of row.cells) {
      if (cell.state === 'equal') counts.cellsMatching += 1;
      else if (cell.state === 'different') counts.cellsDiffering += 1;
    }
  }
  return counts;
}
