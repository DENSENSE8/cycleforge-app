/**
 * Provisional SKUs — the on-hold placeholder product, and the arithmetic of
 * merging one into a real SKU.
 *
 * Pure: no I/O, no clock, no React. The database work that uses these lives in
 * `src/lib/neon/provisional-sku-queries.ts`; this module owns the decisions so
 * they can be tested without a Postgres.
 *
 * ## The SKU string is derived, not allocated
 *
 * A provisional's key is `TMP-<normalised barcode>`. Deriving it from the
 * barcode rather than handing out a sequence number buys the property the
 * whole feature depends on: scanning the SAME physical box twice resolves to
 * the SAME provisional, so two operators working opposite ends of a rack
 * cannot end up with half the count each under rival placeholder ids.
 *
 * The `TMP-` prefix is load-bearing in a second way — any report that renders
 * a raw SKU string shows it as obviously not a real product, which is the
 * cheapest possible guard against someone treating it as sellable.
 */

/** Prefix every provisional SKU carries. Visible, on purpose. */
export const PROVISIONAL_SKU_PREFIX = 'TMP-';

/** Ledger reason recorded when a merge re-keys history onto the real SKU. */
export const PROVISIONAL_MERGE_REASON = 'PROVISIONAL_MERGE';

/**
 * Normalise a scanned barcode into the form the provisional key is built from.
 *
 * Upper-cased and stripped of everything but alphanumerics: a UPC read off a
 * label may arrive with spaces or hyphens depending on the symbology and the
 * gun's suffix settings, and `0 12345 67890 5` must not mint a second
 * placeholder beside `012345678905`.
 */
export function normalizeProvisionalBarcode(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * The provisional SKU for a barcode, or null when the barcode is unusable.
 *
 * Null rather than a throw because the caller is a floor surface: an empty or
 * junk read is an ordinary event there, not an exception.
 */
export function provisionalSkuForBarcode(rawBarcode: string): string | null {
  const normalized = normalizeProvisionalBarcode(rawBarcode);
  if (!normalized) return null;
  return `${PROVISIONAL_SKU_PREFIX}${normalized}`;
}

/** True when a SKU string is a floor-minted placeholder. */
export function isProvisionalSku(sku: string | null | undefined): boolean {
  return typeof sku === 'string' && sku.trim().toUpperCase().startsWith(PROVISIONAL_SKU_PREFIX);
}

export interface ProvisionalBinRow {
  locationId: number;
  qty: number;
}

export interface MergePlan {
  /** Locations where the target already has a row — quantities add. */
  folds: Array<{ locationId: number; provisionalQty: number; targetQty: number; mergedQty: number }>;
  /** Locations where only the provisional has a row — the row is re-keyed. */
  rekeys: Array<{ locationId: number; qty: number }>;
  /** Total units the merge moves onto the target SKU. */
  qtyMoved: number;
  /** How many bin_contents rows the merge touches. */
  binRowsMoved: number;
}

/**
 * Decide, per location, whether merging is an ADD or a RE-KEY.
 *
 * Both cases exist in the same merge and they are different writes: where the
 * real SKU is already stocked in the same bin the two quantities must sum onto
 * one row (`bin_contents` is UNIQUE(location_id, sku), so two rows cannot
 * coexist); where it is not, the provisional's row simply changes its `sku`
 * and keeps its `min_qty` / `max_qty` / `last_counted`.
 *
 * Getting this wrong in the obvious direction — re-keying everything — makes
 * the merge fail on the unique index for exactly the bins that matter most,
 * the ones already holding the real product.
 *
 * Zero-quantity provisional rows are dropped rather than moved: they carry no
 * count and folding them would create empty rows under the target SKU.
 */
export function planProvisionalMerge(
  provisionalRows: readonly ProvisionalBinRow[],
  targetRows: readonly ProvisionalBinRow[],
): MergePlan {
  const targetByLocation = new Map(targetRows.map((row) => [row.locationId, row.qty]));
  const plan: MergePlan = { folds: [], rekeys: [], qtyMoved: 0, binRowsMoved: 0 };

  for (const row of provisionalRows) {
    if (row.qty <= 0) continue;
    plan.qtyMoved += row.qty;
    plan.binRowsMoved += 1;
    const targetQty = targetByLocation.get(row.locationId);
    if (targetQty == null) {
      plan.rekeys.push({ locationId: row.locationId, qty: row.qty });
    } else {
      plan.folds.push({
        locationId: row.locationId,
        provisionalQty: row.qty,
        targetQty,
        mergedQty: targetQty + row.qty,
      });
    }
  }

  return plan;
}

export type MergeRefusal =
  | { ok: true }
  | { ok: false; reason: 'not-provisional' | 'target-is-provisional' | 'same-sku' | 'missing-sku' };

/**
 * Whether a merge may proceed at all.
 *
 * Merging INTO another provisional is refused rather than chained: the
 * feature's promise is that a placeholder ends at a real catalog SKU, and
 * allowing TMP→TMP builds chains whose reconciliation nobody has specified.
 */
export function checkMergeAllowed(provisionalSku: string, targetSku: string): MergeRefusal {
  const from = provisionalSku.trim();
  const to = targetSku.trim();
  if (!from || !to) return { ok: false, reason: 'missing-sku' };
  if (from === to) return { ok: false, reason: 'same-sku' };
  if (!isProvisionalSku(from)) return { ok: false, reason: 'not-provisional' };
  if (isProvisionalSku(to)) return { ok: false, reason: 'target-is-provisional' };
  return { ok: true };
}
