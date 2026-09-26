/**
 * One row of the `sku-ledger` family — a single `sku_stock_ledger` entry,
 * wire-safe.
 *
 * `sku_stock_ledger` has been the AUTHORITATIVE store for SKU quantities since
 * 2026-04-15 (`sku_stock.stock` / `.boxed_stock` are trigger-maintained from
 * `SUM(delta)` per `(sku, dimension)`), so a row here is one signed movement of
 * stock and the reason somebody recorded for it.
 *
 * `created_at` is an ISO STRING, not a `Date`: a slot resolver must resolve the
 * same text for the same row at any time (see `inventory-events-resolve.ts`),
 * and an instant that has to survive an RSC boundary is a string on both sides
 * of it.
 *
 * ## The three refs are three FACTS
 *
 * The retired cell joined `ord#… · rl#… · su#…` into one string under a single
 * "Refs" header, so none of the three could be sorted, searched or bound on its
 * own, and a row with two of them printed a sentence. They are separate columns
 * in the table and they are separate facts here: the order is the row's
 * identity handle, and the unit and receiving line are their own tracks.
 *
 * `ref_packer_log_id`, `ref_tech_log_id`, `ref_sal_id`, `ref_shipment_id` and
 * `reason_code_id` are columns of the same table that this desk's `SELECT` does
 * not read and no cell ever painted — they are not facts of this family until
 * something paints them.
 *
 * `notes` IS a fact: the phone take flow writes the operator's own words there
 * for a `TAKE_CUSTOM` take (`src/lib/inventory/take-reason.ts`), and the item
 * cell's note line paints it under the reason.
 *
 * Field names stay snake_case — the wire names, so the desk hands its rows
 * straight to the family with one mapper and no renaming.
 */

/** The per-SKU ledger row — what the catalog, resolver and adapter read. */
export interface SkuLedgerTableRow {
  /** `sku_stock_ledger.id` — the row key, never painted as a fact. */
  id: number;
  /** ISO instant the movement was recorded. */
  created_at: string;
  /** Signed quantity change. Never null (`NOT NULL` in the schema). */
  delta: number;
  /**
   * Free-form reason code ('SALE', 'ADJUSTMENT', 'TAKE_FBA', …). `NOT NULL`.
   * Painted through `takeReasonLedgerLabel`, never as the raw take code.
   */
  reason: string;
  /** What somebody wrote about this movement; trimmed, empty ⇒ `null`. */
  notes: string | null;
  /** `WAREHOUSE` | `BOXED` — which quantity bucket moved. `NOT NULL`. */
  dimension: string;
  /**
   * The staffer behind the write. `staff_id` is `null` for a machine write,
   * which is what lets the person face draw the absence honestly instead of
   * printing the `'system'` sentinel the retired cell invented.
   */
  staff_id: number | null;
  staff_name: string | null;
  /** The order this movement belongs to — the IDENTITY fact. */
  ref_order_id: number | null;
  ref_receiving_line_id: number | null;
  ref_serial_unit_id: number | null;
}
