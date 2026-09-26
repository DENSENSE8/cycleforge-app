/** Internal-handle resolver — canonical carton/line/unit/handling-unit/repair handles (R-/RCV-/H-/L-/U-/REP-) and printed unit-ids always… */

import type { InternalCodeDeps, InternalCodeResolution, ScanInput } from '../types';

export async function resolveInternalCode(
  input: ScanInput,
  deps: InternalCodeDeps,
): Promise<InternalCodeResolution | null> {
  const runCodeResolve = input.mode !== 'order' || deps.looksLikeCode(input.value);
  if (!runCodeResolve) return null;

  const code = await deps.resolveCode(input.value);
  // `box` (an H-#### license plate) carries the same `rows` as `multi`; receiving
  // keeps opening the picked line for it (the box drawer is a testing-only
  // affordance), so treat it exactly like `multi` here.
  if (!code || (code.kind !== 'line' && code.kind !== 'multi' && code.kind !== 'box')) {
    return null;
  }

  const rows = code.kind === 'line' ? [code.row] : code.rows;

  // The line to open: a single line opens itself; a multi prefers its lone OPEN
  // line, else the first open, else the first row.
  const openRows = rows.filter(
    (r) => r.quantity_expected == null || r.quantity_received < (r.quantity_expected ?? 0),
  );
  const pick =
    code.kind === 'line'
      ? code.row
      : openRows.length === 1
        ? openRows[0]
        : openRows[0] ?? rows[0] ?? null;

  // po_ids / receiving_id derived from the resolved rows the same way the
  // local-tracking rung does — for the caller's `onResult` echo.
  const receivingId = rows.find((r) => r.receiving_id != null)?.receiving_id ?? undefined;
  const poIds = [
    ...new Set(
      rows.map((r) => (r.zoho_purchaseorder_id || '').trim()).filter((x) => x.length > 0),
    ),
  ];

  return { kind: 'internal-code', rows, pick, via: code.via ?? null, receivingId, poIds };
}
