/**
 * Replacing the SKU a row stands on — the desk's two directions, as a pure
 * precondition.
 *
 * ## One verb, two directions (`TABLE_ENGINE_LAW.verbsBindToFields`)
 *
 * The operator's question is one question — *"this stock is really THAT
 * product"* — and the answer the warehouse needs depends on what the row's
 * current SKU IS, never on which page asked:
 *
 * | the selected rows' SKU | direction | what it writes |
 * |---|---|---|
 * | a floor placeholder (`TMP-…`) | **pair** | `POST /api/sku-catalog/provisional/merge` — the placeholder's bin rows AND its whole ledger history are re-keyed onto the real SKU, warehouse-wide, and the placeholder ceases to exist |
 * | a real catalog SKU | **swap** | `POST /api/locations/[barcode]/swap` per selected bin — take off the old SKU, put on the new one, in that bin only |
 *
 * They are NOT the same write and must not be confused at the desk:
 *
 * - **Pair is SKU-wide and historical.** It is a RENAME of something that was
 *   always one product (`mergeProvisionalSku`), so it touches every bin the
 *   placeholder ever reached — not only the ticked rows — and the ledger rows
 *   written before the real SKU existed end up filed under it. The strip has
 *   to say so before the press; the selection is how the operator NAMED the
 *   placeholder, not the extent of the write.
 * - **Swap is per-bin and quantitative.** Two ledger rows (`SWAP_OUT` /
 *   `SWAP_IN`) in one location. Nothing historical moves, because nothing was
 *   misnamed — the shelf changed.
 *
 * ## Why one SOURCE SKU is required
 *
 * Both writes are keyed by the SKU being replaced. A selection spanning two
 * SKUs would either need two different targets (two verbs) or would fold two
 * distinct products into one — which is a merge nobody asked for and no ledger
 * reason describes. So the verb refuses, and names the count.
 */

import {
  isProvisionalSku,
  PROVISIONAL_SKU_PREFIX,
} from './provisional-sku';
import { planStockBinWrites, type StockBinWriteTarget } from './stock-bin-writes';
import type { LocationStockTableRow } from './location-stock-row';

/** Which write a press would make. */
export type StockSkuReplacementKind = 'pair' | 'swap';

export interface StockSkuReplacementPlan {
  kind: StockSkuReplacementKind | null;
  /** The SKU being replaced — `null` when the selection has no single one. */
  sourceSku: string | null;
  /** Its product name, for the strip's face. */
  sourceTitle: string | null;
  /** Bins a `swap` would write. Empty on the `pair` path, which is SKU-wide. */
  targets: readonly StockBinWriteTarget[];
  /** Rows of the source SKU in the selection — the "N rows" face. */
  rowCount: number;
  /** `null` ⇒ the verb is live. Anything else disables it and IS the reason. */
  blocked: string | null;
}

/** The face the strip prints for the source. */
export function stockReplacementSourceFace(plan: StockSkuReplacementPlan): string {
  if (!plan.sourceSku) return '';
  const title = (plan.sourceTitle ?? '').trim();
  return title && title !== plan.sourceSku ? `${title} · ${plan.sourceSku}` : plan.sourceSku;
}

/**
 * What a press would do to this selection.
 *
 * `blocked` is a sentence rather than a code because it is printed verbatim:
 * the operator asked for a verb and is owed the reason it is not available,
 * in the same place the verb would have been.
 */
export function planStockSkuReplacement(
  rows: readonly LocationStockTableRow[],
): StockSkuReplacementPlan {
  const empty: StockSkuReplacementPlan = {
    kind: null,
    sourceSku: null,
    sourceTitle: null,
    targets: [],
    rowCount: 0,
    blocked: 'Select a row first',
  };
  if (rows.length === 0) return empty;

  const skus = [...new Set(rows.map((row) => row.sku.trim()))];
  if (skus.length > 1) {
    return {
      ...empty,
      rowCount: rows.length,
      blocked: `Replacing a SKU works on one SKU at a time — ${skus.length} are selected`,
    };
  }

  const sourceSku = skus[0];
  const sourceTitle = rows.find((row) => (row.product_title ?? '').trim())?.product_title ?? null;
  const base = { sourceSku, sourceTitle, rowCount: rows.length };

  if (isProvisionalSku(sourceSku)) {
    /*
     * `mergeProvisionalSku` re-keys `bin_contents` and `sku_stock_ledger`. It
     * does NOT re-key `serial_units`, and it deletes the placeholder's catalog
     * row at the end — which a serialized unit still pointing at that SKU
     * would refuse (`fk` RESTRICT), i.e. the operator would meet a constraint
     * name instead of a sentence. Say the sentence here.
     */
    const unitRow = rows.find((row) => row.source === 'unit');
    if (unitRow) {
      return {
        ...base,
        kind: null,
        targets: [],
        blocked: `${sourceSku} has serialized units standing at a location — pair it from the unit desk, which can re-key them`,
      };
    }
    return { ...base, kind: 'pair', targets: [], blocked: null };
  }

  const { targets, note } = planStockBinWrites(rows);
  if (targets.length === 0) {
    return { ...base, kind: null, targets: [], blocked: note ?? 'Nothing to write here' };
  }
  return { ...base, kind: 'swap', targets, blocked: null };
}

/** The verb's label — what the press DOES from the state the rows are in. */
export function stockReplacementLabel(kind: StockSkuReplacementKind | null): string {
  return kind === 'pair' ? 'Pair to real SKU' : 'Replace SKU';
}

/**
 * Can this TARGET receive the replacement?
 *
 * Both endpoints refuse the same three things server-side
 * (`checkMergeAllowed`, and the swap route's `oldSku !== newSku`); repeating
 * them here is what keeps the commit button honest instead of letting the
 * operator press and read a 409.
 */
export function stockReplacementTargetRefusal(
  sourceSku: string,
  targetSku: string,
): string | null {
  const target = targetSku.trim();
  if (!target) return null;
  if (target.toUpperCase() === sourceSku.trim().toUpperCase()) {
    return 'That is the same SKU';
  }
  if (isProvisionalSku(target)) {
    return `A ${PROVISIONAL_SKU_PREFIX}… placeholder cannot be the target — pick the real product`;
  }
  return null;
}
