/**
 * Google Sheets sync → the To-ship **inline triage board**.
 *
 * The sync job (`google-sheets-transfer-orders` → `ingestCanonicalOrders`)
 * already reads the sheet and writes `orders`, and it already auto-cages the
 * unpaired rows (`autoCageNewOrders`). What it did NOT do was show an operator
 * the rows it just took: the result lived in `OrderSyncDialog`'s stacked lists,
 * which is a receipt, not a work surface.
 *
 * This module lands those rows on the staging LedgerGrid instead, as one row
 * per sheet record with a decision on it. Everything here is pure except
 * {@link landSheetTriageRows}, whose only effect is the session staging store —
 * no fetch, no DB, no job rewrite.
 *
 * ## Why the sheet gets a decision and Ecwid / eBay / Zoho do not
 *
 * An API connector is an authority: what it says the order is, the order is.
 * A Google Sheet is a person typing. So every synced sheet row is a triage
 * decision — **approve** (accept this row into the intake record) or **reject**
 * (do not accept it; the cage keeps it out of the live To-ship working set) —
 * and approve is reversible, because a person can be re-read.
 *
 * Approve is deliberately NOT release. G1–G3 (`evaluateReleaseGates`) still
 * decide when a caged order joins the live queue; accepting a sheet row only
 * says the operator vouches for what the sheet said.
 */

import type { TransferOrderDetail, TransferOrderDetails } from '@/lib/orders-sync/types';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import {
  getTableImportDraft,
  insertTableImportRows,
  loadTableImportDraft,
} from '@/lib/tables/import/staging-store';
import type { TableImportRowDecision } from '@/lib/tables/import/types';

/**
 * The board's source marker. `TableImportDraft.origin` carries it, and it is
 * what switches the shared staging host from "confirm this parse" to "triage
 * these rows".
 */
export const SHEET_TRIAGE_ORIGIN = 'google_sheets' as const;

/**
 * Column headers the sheet records stage under.
 *
 * These are the LABELS of `CSV_ORDER_CANONICAL_FIELDS`, chosen so
 * `ORDER_IMPORT_DESCRIPTOR.autoMap` binds every one of them without a mapping
 * hand-off — the sheet lane and the CSV lane read the same operator-authored
 * order list, so they must not need two vocabularies. `Platform` is present and
 * blank on purpose: a sheet row whose order id does not name its own channel
 * (`inferMarketplaceFromOrderId`) is exactly the row a human must look at, and
 * dropping the header would hide that from the mapping panel.
 */
export const SHEET_TRIAGE_HEADERS: readonly string[] = [
  'Order number',
  'Item title',
  'SKU',
  'Item number',
  'Tracking number',
  'Platform',
];

/**
 * Account sources that mean "this row is still the sheet's".
 *
 * An `updated` detail is a sheet row that matched an EXISTING order. When that
 * order came from an API connector it is already authoritative live work, and
 * putting it on a triage board would ask an operator to approve a row they do
 * not own. When it came from a sheet (or from nothing recorded at all) the row
 * is still a human's claim, so it stays triageable.
 */
const SHEET_ACCOUNT_SOURCES: readonly string[] = [
  'google-sheets-transfer-orders',
  'google_sheets',
  'google sheets',
  'googlesheets',
  'sheets',
  'sheet',
  'manual',
  'csv',
];

/** True when an `updated` sheet row is still the sheet's to triage. */
export function isCagedSheetUpdate(detail: TransferOrderDetail): boolean {
  const source = detail.existingAccountSource;
  if (source === null || source === undefined || source.trim() === '') return true;
  return SHEET_ACCOUNT_SOURCES.includes(source.trim().toLowerCase());
}

/**
 * The rows a sheet sync puts on the board: everything it inserted, plus the
 * rows it updated that are still sheet-owned.
 *
 * De-duplicated on order id, insert wins — a run that both inserts and reports
 * an update for one order id must not paint two rows an operator would have to
 * approve twice.
 */
export function sheetTriageRowsFromDetails(
  details: TransferOrderDetails | null | undefined,
): TransferOrderDetail[] {
  if (!details) return [];
  const rows: TransferOrderDetail[] = [];
  const seen = new Set<string>();
  const take = (detail: TransferOrderDetail) => {
    const id = detail.orderId.trim();
    // A blank order id is not identity — keep the row (the board is where a
    // missing order number gets fixed) but never fold two blanks together.
    if (id !== '') {
      if (seen.has(id)) return;
      seen.add(id);
    }
    rows.push(detail);
  };
  for (const detail of details.inserted ?? []) take(detail);
  for (const detail of details.updated ?? []) {
    if (isCagedSheetUpdate(detail)) take(detail);
  }
  return rows;
}

/** Sheet details → staging records in the canonical import vocabulary. */
export function sheetTriageRecords(
  rows: readonly TransferOrderDetail[],
): Record<string, string>[] {
  return rows.map((detail) => ({
    'Order number': detail.orderId,
    'Item title': detail.productTitle,
    SKU: detail.sku,
    'Item number': detail.itemNumber,
    'Tracking number': detail.tracking,
    Platform: '',
  }));
}

/**
 * Where an arriving batch splices into a board that already has rows.
 *
 * The MIDDLE of the body, not the end. An import that appends lands below the
 * fold on any board long enough to scroll, so the operator's evidence that the
 * sync did anything is off-screen; arriving between the rows already there puts
 * the new work where the eyes are and makes the existing rows visibly move
 * apart (the `layout` half of the enter animation).
 */
export function sheetTriageInsertIndex(existingRowCount: number): number {
  return Math.floor(Math.max(0, existingRowCount) / 2);
}

/**
 * The approve / reject state machine.
 *
 * Approve on an already-approved row UNAPPROVES it (back to undecided) — the
 * manual-sheet requirement, and the reason this returns `null` rather than
 * always a decision. Reject behaves the same way, so a mis-click on either
 * square is undone by the same square rather than by hunting for an undo.
 */
export function nextSheetTriageDecision(
  current: TableImportRowDecision | undefined,
  action: 'approve' | 'reject',
): TableImportRowDecision | null {
  const target: TableImportRowDecision = action === 'approve' ? 'approved' : 'rejected';
  return current === target ? null : target;
}

export type SheetTriageLanding =
  | { ok: true; landed: number; insertedAt: number; created: boolean }
  | { ok: false; reason: 'no-rows' | 'file-draft-open' };

/**
 * Put a completed sheet sync's rows on the To-ship staging board.
 *
 * Three cases, and the third is the one that matters:
 *   - no draft open → create the board from these rows;
 *   - a sheet board open → splice into its middle (a re-sync adds to the pile
 *     the operator is working, it does not replace it);
 *   - a FILE draft open → refuse. An operator mid-CSV-triage would otherwise
 *     have their session silently overwritten by a background sync.
 */
export function landSheetTriageRows(
  details: TransferOrderDetails | null | undefined,
  sourceName: string,
): SheetTriageLanding {
  const rows = sheetTriageRowsFromDetails(details);
  if (rows.length === 0) return { ok: false, reason: 'no-rows' };
  const records = sheetTriageRecords(rows);

  const open = getTableImportDraft(ORDER_IMPORT_DESCRIPTOR.surfaceId);
  if (open && open.origin !== SHEET_TRIAGE_ORIGIN) {
    return { ok: false, reason: 'file-draft-open' };
  }

  if (!open) {
    const loaded = loadTableImportDraft(ORDER_IMPORT_DESCRIPTOR, {
      fileName: sourceName,
      headers: [...SHEET_TRIAGE_HEADERS],
      rows: records,
      origin: SHEET_TRIAGE_ORIGIN,
    });
    if (!loaded.ok) return { ok: false, reason: 'no-rows' };
    return { ok: true, landed: records.length, insertedAt: 0, created: true };
  }

  const insertedAt = sheetTriageInsertIndex(open.rows.length);
  insertTableImportRows(ORDER_IMPORT_DESCRIPTOR.surfaceId, records, insertedAt);
  return { ok: true, landed: records.length, insertedAt, created: false };
}
