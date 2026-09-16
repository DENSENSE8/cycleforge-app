import { tenantQuery, withTenantTransaction } from '../tenancy/db';
import type { OrgId } from '../tenancy/constants';
import {
  checkMergeAllowed,
  isProvisionalSku,
  normalizeProvisionalBarcode,
  planProvisionalMerge,
  provisionalSkuForBarcode,
  PROVISIONAL_MERGE_REASON,
  type ProvisionalBinRow,
} from '../inventory/provisional-sku';

/**
 * Database work for provisional (on-hold placeholder) products.
 *
 * A provisional is a `sku_stock` row and nothing else — deliberately no
 * `sku_catalog` row, which is what keeps it off every channel path by
 * construction. See `src/lib/migrations/2026-09-13b_provisional_skus.sql` for
 * the reasoning.
 */

export interface ProvisionalSku {
  sku: string;
  productTitle: string;
  barcode: string;
  stock: number;
  createdByStaffId: number | null;
}

interface ProvisionalRow {
  sku: string;
  product_title: string | null;
  provisional_barcode: string | null;
  stock: number | string | null;
  provisional_created_by: number | null;
}

function toProvisional(row: ProvisionalRow): ProvisionalSku {
  return {
    sku: row.sku,
    productTitle: row.product_title ?? row.sku,
    barcode: row.provisional_barcode ?? '',
    stock: Number(row.stock) || 0,
    createdByStaffId: row.provisional_created_by ?? null,
  };
}

/**
 * Mint a placeholder for a scanned barcode, or return the one that already
 * exists for it.
 *
 * Idempotent on (org, barcode) by the partial unique index, so a second
 * operator scanning the same box joins the existing placeholder rather than
 * starting a rival one holding half the count. A repeat call may supply a
 * better title; it does NOT overwrite one that is already there, because the
 * first person to name the thing was looking at it and a later caller might
 * only be echoing a default.
 */
export async function createProvisionalSku(
  input: { barcode: string; productTitle: string; staffId?: number | null },
  orgId: OrgId,
): Promise<ProvisionalSku> {
  const sku = provisionalSkuForBarcode(input.barcode);
  if (!sku) throw new Error('Barcode has no usable characters');
  const title = input.productTitle.trim();
  if (!title) throw new Error('A name is required for an on-hold product');

  const barcode = normalizeProvisionalBarcode(input.barcode);

  return withTenantTransaction(orgId, async (db) => {
    // The catalog row FIRST: `bin_contents.sku` has a FK onto
    // `sku_catalog(sku)` (fk_bin_contents_sku, ON DELETE RESTRICT), so without
    // it the placeholder could never be put in a bin — which is the only thing
    // it exists to allow.
    //
    // `is_active = false` is not decoration. Every catalog consumer that
    // already filters on it excludes provisionals without being modified, and
    // that is one of the three guards keeping unsellable stock off the
    // channels (see 2026-09-13c).
    await db.query(
      `INSERT INTO sku_catalog (
         sku, product_title, upc, is_active, organization_id,
         is_provisional, provisional_barcode
       )
       VALUES ($1, $2, $3, false, $4, true, $3)
       ON CONFLICT (organization_id, sku) DO UPDATE
         SET product_title = COALESCE(NULLIF(sku_catalog.product_title, ''), EXCLUDED.product_title),
             updated_at = NOW()`,
      [sku, title, barcode, orgId],
    );

    const result = await db.query<ProvisionalRow>(
      `INSERT INTO sku_stock (
         sku, stock, boxed_stock, product_title, organization_id,
         is_provisional, provisional_barcode, provisional_created_by, provisional_created_at
       )
       VALUES ($1, 0, 0, $2, $3, true, $4, $5, NOW())
       ON CONFLICT (organization_id, sku) DO UPDATE
         SET product_title = COALESCE(NULLIF(sku_stock.product_title, ''), EXCLUDED.product_title),
             updated_at = NOW()
       RETURNING sku, product_title, provisional_barcode, stock, provisional_created_by`,
      [sku, title, orgId, barcode, input.staffId ?? null],
    );

    return toProvisional(result.rows[0]);
  });
}

/** Every unreconciled placeholder in the org, newest first. */
export async function listProvisionalSkus(orgId: OrgId): Promise<ProvisionalSku[]> {
  const result = await tenantQuery<ProvisionalRow>(
    orgId,
    `SELECT sku, product_title, provisional_barcode, stock, provisional_created_by
       FROM sku_stock
      WHERE organization_id = $1 AND is_provisional = true
      ORDER BY provisional_created_at DESC NULLS LAST, sku`,
    [orgId],
  );
  return result.rows.map(toProvisional);
}

export interface MergeResult {
  qtyMoved: number;
  binRowsMoved: number;
  ledgerRowsRekeyed: number;
  /**
   * The highest `sku_stock_ledger.id` the merge re-keyed, or `null` when it
   * re-keyed none — the realtime feed key for the move (see the merge route).
   *
   * It is a REAL ledger row id, and after the merge that row reads the target
   * SKU, so the event it keys is not a fiction. `null` means nothing the books
   * record actually moved, and there is nothing for a subscriber to refetch.
   */
  feedLedgerId: number | null;
}

/**
 * Merge a placeholder into the real SKU: the override.
 *
 * Everything the placeholder accumulated moves onto the target — bin rows and
 * the whole `sku_stock_ledger` history — and the placeholder ceases to exist.
 * Nobody recounts, and the product ends up with ONE unbroken history rather
 * than a count that starts the day somebody fixed the catalog.
 *
 * ## Why the ledger is re-keyed rather than compensated
 *
 * The alternative is a pair of dated offsetting deltas (take N from TMP, put N
 * on the real SKU) plus a lineage map. That keeps every historical row exactly
 * as written — which is the stronger audit posture, and it is a real cost of
 * the choice made here.
 *
 * It was weighed and declined (operator 2026-09-13). Re-keying is a RENAME of
 * something that was always physically one product: the stock on the shelf
 * never moved, only the name we had for it. Compensated deltas describe a
 * transfer that did not physically happen, leave the real product's history
 * starting at the merge, and leave a dead `TMP-…` key in every historical
 * stock report forever — resolvable only by a consumer who knows to consult
 * the map.
 *
 * The honest cost of the path taken: a ledger row written before the real SKU
 * existed ends up filed under it. `provisional_sku_merges` records the rename
 * — what became what, when, by whom, and how many rows moved — so the
 * re-keying is itself auditable rather than silent. That table is the answer
 * to "this history predates the SKU it is filed under".
 *
 * `trg_sku_stock_from_ledger` fires `AFTER INSERT OR UPDATE OR DELETE` and
 * recomputes from a full per-key SUM, so the re-key projects the target's
 * `sku_stock.stock` with no direct stock write. The placeholder's own row
 * sums to zero and is deleted in the same transaction.
 */
export async function mergeProvisionalSku(
  input: { provisionalSku: string; targetSku: string; staffId?: number | null },
  orgId: OrgId,
): Promise<MergeResult> {
  const provisionalSku = input.provisionalSku.trim();
  const targetSku = input.targetSku.trim();
  const allowed = checkMergeAllowed(provisionalSku, targetSku);
  if (!allowed.ok) throw new Error(`Merge refused: ${allowed.reason}`);

  return withTenantTransaction(orgId, async (db) => {
    const placeholder = await db.query<ProvisionalRow>(
      `SELECT sku, product_title, provisional_barcode, stock, provisional_created_by
         FROM sku_stock
        WHERE organization_id = $1 AND sku = $2 AND is_provisional = true
        FOR UPDATE`,
      [orgId, provisionalSku],
    );
    if (placeholder.rows.length === 0) {
      throw new Error(`No on-hold product named ${provisionalSku}`);
    }

    // The target must be a real catalog SKU. Without this check the first
    // bin re-key raises `fk_bin_contents_sku`, which reaches the operator as
    // a Postgres constraint name rather than "that SKU does not exist yet".
    const target = await db.query<{ is_provisional: boolean }>(
      `SELECT is_provisional FROM sku_catalog
        WHERE organization_id = $1 AND sku = $2`,
      [orgId, targetSku],
    );
    if (target.rows.length === 0) {
      throw new Error(`No catalog SKU named ${targetSku}`);
    }
    if (target.rows[0].is_provisional) {
      throw new Error('Merge refused: target-is-provisional');
    }

    const bins = await db.query<{ sku: string; location_id: number; qty: number }>(
      `SELECT sku, location_id, qty
         FROM bin_contents
        WHERE organization_id = $1 AND sku IN ($2, $3)
        FOR UPDATE`,
      [orgId, provisionalSku, targetSku],
    );

    const rowsFor = (sku: string): ProvisionalBinRow[] =>
      bins.rows
        .filter((row) => row.sku === sku)
        .map((row) => ({ locationId: row.location_id, qty: Number(row.qty) || 0 }));

    const plan = planProvisionalMerge(rowsFor(provisionalSku), rowsFor(targetSku));

    // Folds first: the target's row absorbs the placeholder's quantity, then
    // the placeholder's row for that location goes. Doing it in this order
    // means the UNIQUE(location_id, sku) index is never asked to hold two rows
    // for the same pair, even momentarily.
    for (const fold of plan.folds) {
      await db.query(
        `UPDATE bin_contents SET qty = $1, updated_at = NOW()
          WHERE organization_id = $2 AND location_id = $3 AND sku = $4`,
        [fold.mergedQty, orgId, fold.locationId, targetSku],
      );
      await db.query(
        `DELETE FROM bin_contents
          WHERE organization_id = $1 AND location_id = $2 AND sku = $3`,
        [orgId, fold.locationId, provisionalSku],
      );
    }

    // Re-keys keep the row — and with it min_qty, max_qty and last_counted,
    // which are facts about the BIN's relationship to the physical product and
    // survive the product being correctly named.
    for (const rekey of plan.rekeys) {
      await db.query(
        `UPDATE bin_contents SET sku = $1, updated_at = NOW()
          WHERE organization_id = $2 AND location_id = $3 AND sku = $4`,
        [targetSku, orgId, rekey.locationId, provisionalSku],
      );
    }

    // Any zero-qty placeholder rows the plan skipped are still rows; drop them
    // so the placeholder leaves nothing behind.
    await db.query(
      `DELETE FROM bin_contents WHERE organization_id = $1 AND sku = $2`,
      [orgId, provisionalSku],
    );

    const ledger = await db.query<{ id: number }>(
      `UPDATE sku_stock_ledger
          SET sku = $1
        WHERE organization_id = $2 AND sku = $3
        RETURNING id`,
      [targetSku, orgId, provisionalSku],
    );
    const ledgerRowsRekeyed = ledger.rowCount ?? 0;
    const feedLedgerId = ledger.rows.reduce<number | null>(
      (max, row) => (max == null || row.id > max ? row.id : max),
      null,
    );

    await db.query(
      `INSERT INTO provisional_sku_merges (
         organization_id, provisional_sku, provisional_barcode, provisional_title,
         target_sku, qty_moved, bin_rows_moved, ledger_rows_rekeyed, merged_by_staff_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, provisional_sku) DO NOTHING`,
      [
        orgId,
        provisionalSku,
        placeholder.rows[0].provisional_barcode,
        placeholder.rows[0].product_title,
        targetSku,
        plan.qtyMoved,
        plan.binRowsMoved,
        ledgerRowsRekeyed,
        input.staffId ?? null,
      ],
    );

    await db.query(
      `DELETE FROM sku_stock
        WHERE organization_id = $1 AND sku = $2 AND is_provisional = true`,
      [orgId, provisionalSku],
    );

    // The catalog row goes last. `fk_bin_contents_sku` is ON DELETE RESTRICT,
    // so if any bin still pointed at the placeholder this DELETE would raise
    // rather than orphan a reference — the constraint is the proof that the
    // move above actually completed, so it is deliberately not guarded away.
    await db.query(
      `DELETE FROM sku_catalog
        WHERE organization_id = $1 AND sku = $2 AND is_provisional = true`,
      [orgId, provisionalSku],
    );

    // The target may have had no ledger rows of its own and no trigger fire
    // (a merge of zero rows), so make sure its stock row exists and is right.
    if (ledgerRowsRekeyed === 0) {
      await db.query(
        `INSERT INTO sku_stock (sku, stock, boxed_stock, organization_id)
         VALUES ($1, 0, 0, $2)
         ON CONFLICT (organization_id, sku) DO NOTHING`,
        [targetSku, orgId],
      );
    }

    return {
      qtyMoved: plan.qtyMoved,
      binRowsMoved: plan.binRowsMoved,
      ledgerRowsRekeyed,
      feedLedgerId,
    };
  });
}

/** Reason string stamped on any ledger row a merge writes. Re-exported for callers. */
export { PROVISIONAL_MERGE_REASON, isProvisionalSku };
