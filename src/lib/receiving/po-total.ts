/** Purchase-order money total for a carton — the presentation-kind SoT for "what did this PO cost". */

/** The two fields a PO total needs — structurally satisfied by `ReceivingLineRow`. */
export interface PoTotalLine {
  unit_price?: string | number | null;
  quantity_expected?: number | null;
}

/**
 * Σ(unit_price × quantity_expected) over `lines`.
 *
 * @returns the total, or `null` when no line carries a usable price (honest
 * absence — the caller renders a dash, not a zero).
 */
export function cartonPoTotal(lines: readonly PoTotalLine[] | null | undefined): number | null {
  if (!lines || lines.length === 0) return null;

  let total = 0;
  let priced = false;

  for (const line of lines) {
    const price = Number(line.unit_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    // A null/0 expected quantity still represents one ordered unit — an
    // unfound or hand-added line carries a price without a mirrored count.
    const qty = Number(line.quantity_expected);
    const units = Number.isFinite(qty) && qty > 0 ? qty : 1;
    total += price * units;
    priced = true;
  }

  return priced ? Math.round(total * 100) / 100 : null;
}
