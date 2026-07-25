/**
 * Pure eligibility rules for Google Sheets → orders transfer rows.
 * Keeps import gates testable without Google auth or DB.
 */

export type TransferSheetEligibilityCols = {
  orderNumber: number;
  tracking: number;
  itemNumber: number;
  platform: number;
};

type TransferSheetSkipReason =
  | 'noOrderId'
  | 'noTracking'
  | 'noItemNumber'
  | 'ecwid';

export type TransferSheetSkipCounts = {
  skippedNoOrderId: number;
  skippedNoTracking: number;
  skippedNoItemNumber: number;
  skippedEcwid: number;
};

export function emptyTransferSheetSkipCounts(): TransferSheetSkipCounts {
  return {
    skippedNoOrderId: 0,
    skippedNoTracking: 0,
    skippedNoItemNumber: 0,
    skippedEcwid: 0,
  };
}

function cell(row: unknown[], index: number): string {
  if (index < 0) return '';
  return String(row[index] ?? '').trim();
}

/**
 * Evaluate one sheet data row (not the header).
 * Gate on **raw** Item Number — catalog title-match must not resurrect blank cells.
 */
export function evaluateTransferSheetRowEligibility(
  row: unknown[],
  colIndices: TransferSheetEligibilityCols,
): TransferSheetSkipReason | 'ok' {
  if (!cell(row, colIndices.orderNumber)) return 'noOrderId';

  // Require tracking — blank-tracking rows used to land as AWAITING_LABEL
  // on Shipping · Labels for "print later". Labels work needs a real shipment.
  if (!cell(row, colIndices.tracking)) return 'noTracking';

  // Require listing identity so orders can join sku_platform_ids / search / pairing.
  if (!cell(row, colIndices.itemNumber)) return 'noItemNumber';

  // Ecwid orders are fetched from the Ecwid API — skip them in the sheet path.
  if (cell(row, colIndices.platform).toLowerCase() === 'ecwid') return 'ecwid';

  return 'ok';
}

export function filterEligibleTransferSheetRows(
  rows: unknown[][],
  colIndices: TransferSheetEligibilityCols,
): { eligible: unknown[][]; skips: TransferSheetSkipCounts } {
  const skips = emptyTransferSheetSkipCounts();
  const eligible: unknown[][] = [];

  for (const row of rows) {
    const reason = evaluateTransferSheetRowEligibility(row, colIndices);
    if (reason === 'ok') {
      eligible.push(row);
      continue;
    }
    if (reason === 'noOrderId') skips.skippedNoOrderId += 1;
    else if (reason === 'noTracking') skips.skippedNoTracking += 1;
    else if (reason === 'noItemNumber') skips.skippedNoItemNumber += 1;
    else skips.skippedEcwid += 1;
  }

  return { eligible, skips };
}
