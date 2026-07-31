/**
 * Pure eligibility rules for Google Sheets → orders transfer rows.
 * Keeps import gates testable without Google auth or DB.
 */

export type TransferSheetEligibilityCols = {
  orderNumber: number;
  tracking: number;
  itemNumber: number;
  platform: number;
  /** Optional — only used to label a skipped row for the operator. */
  itemTitle?: number;
};

export type TransferSheetSkipReason =
  | 'blankRow'
  | 'fbaShipment'
  | 'noOrderId'
  | 'noTracking'
  | 'noItemNumber'
  | 'ecwid';

export type TransferSheetSkipCounts = {
  skippedBlankRow: number;
  skippedFbaShipment: number;
  skippedNoOrderId: number;
  skippedNoTracking: number;
  skippedNoItemNumber: number;
  skippedEcwid: number;
};

export function emptyTransferSheetSkipCounts(): TransferSheetSkipCounts {
  return {
    skippedBlankRow: 0,
    skippedFbaShipment: 0,
    skippedNoOrderId: 0,
    skippedNoTracking: 0,
    skippedNoItemNumber: 0,
    skippedEcwid: 0,
  };
}

/**
 * An Amazon INBOUND FBA shipment id (`FBA19KD6XX28`), not a customer order.
 *
 * These land in the orders sheet as one row per box — the 2026-07-29 tab had
 * `FBA19KD6XX28` four times with four different UPS tracking numbers. Importing
 * them would mint four sales that never happened and, sharing one "order
 * number", they would collapse onto a single orders row under the
 * account+source+order_id unique key.
 *
 * Marketplace order numbers never collide with this shape: Amazon is
 * `3-7-7` digits, eBay `NN-NNNNN-NNNNN`, Ecwid plain digits. Anchored so a
 * title or note merely containing "fba" cannot trip it.
 */
const FBA_SHIPMENT_ID = /^FBA[0-9A-Z]{6,}$/i;

function isFbaShipmentOrderId(orderId: string): boolean {
  return FBA_SHIPMENT_ID.test(orderId.trim());
}

/** One skipped sheet row, described well enough for an operator to go fix it. */
export type TransferSheetSkippedRow = {
  /** 1-based spreadsheet row number, so the operator can jump straight to it. */
  sheetRow: number;
  reason: TransferSheetSkipReason;
  orderId: string;
  platform: string;
  productTitle: string;
  tracking: string;
};

/**
 * Cap on captured rows. A skip list is a work queue, not an export — and the
 * whole payload crosses HTTP into a dialog. Counts stay exact regardless; only
 * the row samples are bounded.
 */
export const SKIPPED_ROW_SAMPLE_CAP = 200;

function cell(row: unknown[], index: number): string {
  if (index < 0) return '';
  return String(row[index] ?? '').trim();
}

/** True when every cell in the row is empty/whitespace — spreadsheet padding. */
export function isBlankSheetRow(row: unknown[]): boolean {
  return !row.some((value) => String(value ?? '').trim() !== '');
}

/**
 * Evaluate one sheet data row (not the header).
 * Gate on **raw** Item Number — catalog title-match must not resurrect blank cells.
 */
export function evaluateTransferSheetRowEligibility(
  row: unknown[],
  colIndices: TransferSheetEligibilityCols,
): TransferSheetSkipReason | 'ok' {
  // A row with nothing in it at all is spreadsheet padding, not a broken order.
  // Both are skipped, but only one is worth an operator's attention: the live
  // 2026-07-29 tab reported 8 "no order id" rows of which 4 were literally
  // empty, so a queue built from that counter would have sent someone hunting
  // for orders that were never typed.
  if (isBlankSheetRow(row)) return 'blankRow';

  // Before every other gate: an inbound FBA shipment is not an order no matter
  // which of its other cells are filled, so classifying it here keeps it out of
  // the missing-Item-Number work queue an operator is expected to clear.
  if (isFbaShipmentOrderId(cell(row, colIndices.orderNumber))) return 'fbaShipment';

  if (!cell(row, colIndices.orderNumber)) return 'noOrderId';

  // Require tracking — blank-tracking rows used to land as AWAITING_LABEL
  // on Shipping · Labels for "print later". Labels work needs a real shipment.
  if (!cell(row, colIndices.tracking)) return 'noTracking';

  // Ecwid BEFORE the item-number gate. These rows are skipped either way — they
  // arrive through the Ecwid API instead — but when the item-number check ran
  // first, an Ecwid row with a blank Item Number was reported as an
  // item-number problem. On the 2026-07-29 tab that misfiled 5 of the 23
  // "missing Item Number" rows, overstating a data-entry gap the operator
  // cannot act on. Ordering changes attribution only, never which rows import.
  if (cell(row, colIndices.platform).toLowerCase() === 'ecwid') return 'ecwid';

  // Require listing identity so orders can join sku_platform_ids / search / pairing.
  if (!cell(row, colIndices.itemNumber)) return 'noItemNumber';

  return 'ok';
}

export function filterEligibleTransferSheetRows(
  rows: unknown[][],
  colIndices: TransferSheetEligibilityCols,
  /** 1-based sheet row of `rows[0]` — 2 when the caller passed `slice(1)`
   *  past a header. Only affects the row numbers shown to the operator. */
  firstSheetRow = 2,
): {
  eligible: unknown[][];
  skips: TransferSheetSkipCounts;
  /** Dialog sample — capped at SKIPPED_ROW_SAMPLE_CAP. */
  skippedRows: TransferSheetSkippedRow[];
  /**
   * Uncapped `noItemNumber` rows for the durable Review · Missing item number
   * queue. Must not share the dialog sample cap — otherwise rows past 200
   * never enqueue and the operator never sees them.
   */
  noItemNumberRows: TransferSheetSkippedRow[];
} {
  const skips = emptyTransferSheetSkipCounts();
  const eligible: unknown[][] = [];
  const skippedRows: TransferSheetSkippedRow[] = [];
  const noItemNumberRows: TransferSheetSkippedRow[] = [];

  rows.forEach((row, index) => {
    const reason = evaluateTransferSheetRowEligibility(row, colIndices);
    if (reason === 'ok') {
      eligible.push(row);
      return;
    }

    if (reason === 'blankRow') skips.skippedBlankRow += 1;
    else if (reason === 'fbaShipment') skips.skippedFbaShipment += 1;
    else if (reason === 'noOrderId') skips.skippedNoOrderId += 1;
    else if (reason === 'noTracking') skips.skippedNoTracking += 1;
    else if (reason === 'noItemNumber') skips.skippedNoItemNumber += 1;
    else skips.skippedEcwid += 1;

    // Padding carries nothing to show and would pad the operator's queue with
    // empty lines — count it, never list it.
    if (reason === 'blankRow') return;

    const entry: TransferSheetSkippedRow = {
      sheetRow: firstSheetRow + index,
      reason,
      orderId: cell(row, colIndices.orderNumber),
      platform: cell(row, colIndices.platform),
      productTitle: cell(row, colIndices.itemTitle ?? -1),
      tracking: cell(row, colIndices.tracking),
    };

    // Durable Review queue: every noItemNumber row, uncapped.
    if (reason === 'noItemNumber') {
      noItemNumberRows.push(entry);
    }

    if (skippedRows.length >= SKIPPED_ROW_SAMPLE_CAP) return;
    skippedRows.push(entry);
  });

  return { eligible, skips, skippedRows, noItemNumberRows };
}
